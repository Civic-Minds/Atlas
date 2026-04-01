import { getPool } from '../storage/db';
import { getStaticPool } from '../storage/static-db';
import { log } from '../logger';

/**
 * Headway Engine (Phase 2)
 *
 * Compares observed vehicle arrivals on corridors against scheduled headways
 * to detect bunching and service gaps.
 */

export interface CorridorPerformance {
  linkId: string;
  agencyId: string;
  start_obs: Date;
  end_obs: Date;
  observedAvgHeadway: number; // minutes
  scheduledAvgHeadway: number;
  observedTripCount: number;
  avgDelaySeconds: number;
  reliabilityScore: number; // AHW Reliability (0-100)
  bunchingCount: number; // Trips arriving < threshold after the previous trip
  earlyCount: number; // Arrivals > 60s before schedule
  onTimeCount: number; // Arrivals within [-60s, 300s] of schedule
  lateCount: number; // Arrivals > 300s after schedule
}

export async function aggregateCorridorPerformance(
    agencyId: string, 
    startTime: Date,
    endTime: Date,
    overrideFeedVersionId?: string,
    bunchingThresholdSeconds: number = 60
): Promise<CorridorPerformance[]> {
  const realtimeDb = getPool();
  const staticDb = getStaticPool();

  log.info('Headway', 'Aggregating corridor performance', { agencyId, startTime, endTime, overrideFeedVersionId });

  // 1. Resolve the feed version for this agency to get corridor definitions (Pivot logic)
  let feedVersionId = overrideFeedVersionId;
  
  if (!feedVersionId) {
    const agencyRow = await staticDb.query(
      `SELECT fv.id AS feed_version_id
       FROM agency_accounts aa
       JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
       JOIN feed_versions  fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
       WHERE aa.slug = $1
       LIMIT 1`,
      [agencyId]
    );

    if (agencyRow.rows.length === 0) return [];
    feedVersionId = agencyRow.rows[0].feed_version_id;
  }

  // Determine day type dynamically from the midpoint of the window
  const midPoint = new Date((startTime.getTime() + endTime.getTime()) / 2);
  const dow = midPoint.getDay();
  const dayType = dow === 0 ? 'Sunday' : dow === 6 ? 'Saturday' : 'Weekday';

  // 2. Get active corridors for this agency
  const corridors = await staticDb.query(
    `SELECT link_id, stop_a_id, route_ids, avg_headway as scheduled_headway
     FROM corridor_results
     WHERE feed_version_id = $1 AND day_type = $2
     LIMIT 20`,
    [feedVersionId, dayType]
  );

  if (corridors.rows.length === 0) return [];

  // 3. Collect all unique stop IDs from all corridors, then fetch ALL arrivals
  // in a single query to avoid N+1 per-corridor round trips.
  const allStopIds: string[] = [...new Set(corridors.rows.map((c: any) => c.stop_a_id as string))];

  const allArrivalsRes = await realtimeDb.query(
    `SELECT
       stop_id,
       trip_id,
       route_id,
       MIN(observed_at) as arrival_time,
       AVG(delay_seconds) as avg_delay
     FROM vehicle_positions
     WHERE agency_id = $1
       AND stop_id = ANY($2::text[])
       AND observed_at >= $3
       AND observed_at < $4
       AND match_confidence >= 0.7
     GROUP BY stop_id, trip_id, route_id
     ORDER BY stop_id, arrival_time ASC`,
    [agencyId, allStopIds, startTime, endTime]
  );

  // Index arrivals by stop_id for fast in-memory aggregation
  const arrivalsByStop = new Map<string, Array<{ trip_id: string; route_id: string; arrival_time: string; avg_delay: number | null }>>();
  for (const row of allArrivalsRes.rows) {
    if (!arrivalsByStop.has(row.stop_id)) arrivalsByStop.set(row.stop_id, []);
    arrivalsByStop.get(row.stop_id)!.push(row);
  }

  const results: CorridorPerformance[] = [];

  for (const corridor of corridors.rows) {
    const { link_id, stop_a_id, route_ids, scheduled_headway } = corridor;

    // Filter arrivals for this corridor's stop and route set
    const stopArrivals = (arrivalsByStop.get(stop_a_id) ?? [])
      .filter(r => (route_ids as string[]).includes(r.route_id))
      .sort((a, b) => new Date(a.arrival_time).getTime() - new Date(b.arrival_time).getTime());

    if (stopArrivals.length < 2) continue; // Need at least two buses to calculate a headway

    const intervals: number[] = [];
    let totalDelay = 0;
    let bunchingCount = 0;
    let earlyCount = 0;
    let onTimeCount = 0;
    let lateCount = 0;

    for (let i = 1; i < stopArrivals.length; i++) {
        const current = new Date(stopArrivals[i].arrival_time).getTime();
        const previous = new Date(stopArrivals[i-1].arrival_time).getTime();
        const interval = (current - previous) / 1000; // seconds
        intervals.push(interval);
        totalDelay += stopArrivals[i].avg_delay ?? 0;

        if (interval < bunchingThresholdSeconds) {
            bunchingCount++;
        }

        const delay = stopArrivals[i].avg_delay ?? 0;
        if (delay < -60) {
            earlyCount++;
        } else if (delay > 300) {
            lateCount++;
        } else {
            onTimeCount++;
        }
    }

    const meanSeconds = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - meanSeconds, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / meanSeconds; // Coefficient of Variation

    // Reliability score: 100 * (1 - CV), capped at 0-100
    const reliabilityScore = Math.max(0, Math.min(100, Math.round(100 * (1 - cv))));

    const observedAvgHeadway = meanSeconds / 60;
    const avgDelay = totalDelay / stopArrivals.length;

    results.push({
      linkId: link_id,
      agencyId,
      start_obs: startTime,
      end_obs: endTime,
      observedAvgHeadway,
      scheduledAvgHeadway: scheduled_headway,
      observedTripCount: stopArrivals.length,
      avgDelaySeconds: avgDelay,
      reliabilityScore,
      bunchingCount,
      earlyCount,
      onTimeCount,
      lateCount
    });
  }

  return results;
}
