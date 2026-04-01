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
    windowMinutes: number = 60,
    bunchingThresholdSeconds: number = 60
): Promise<CorridorPerformance[]> {
  const realtimeDb = getPool();
  const staticDb = getStaticPool();

  const now = new Date();
  const startTime = new Date(now.getTime() - windowMinutes * 60 * 1000);

  log.info('Headway', 'Aggregating corridor performance', { agencyId, windowMinutes });

  // 1. Resolve the current feed version for this agency to get corridor definitions
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
  const feedVersionId = agencyRow.rows[0].feed_version_id;

  // 2. Get active corridors for this agency
  const corridors = await staticDb.query(
    `SELECT link_id, stop_a_id, route_ids, avg_headway as scheduled_headway
     FROM corridor_results
     WHERE feed_version_id = $1 AND day_type = 'Weekday' -- Default to weekday for lab validation
     LIMIT 20`,
    [feedVersionId]
  );

  const results: CorridorPerformance[] = [];

  for (const corridor of corridors.rows) {
    const { link_id, stop_a_id, route_ids, scheduled_headway } = corridor;

    // 3. Find unique arrivals at Stop A for the routes in this corridor
    // We take the MIN(observed_at) per trip to catch the actual arrival moment
    const arrivals = await realtimeDb.query(
      `SELECT 
         trip_id,
         MIN(observed_at) as arrival_time,
         AVG(delay_seconds) as avg_delay
       FROM vehicle_positions
       WHERE agency_id = $1
         AND stop_id = $2
         AND route_id = ANY($3)
         AND observed_at >= $4
         AND observed_at < $5
         AND match_confidence >= 0.7 -- Only trust high-quality matches
       GROUP BY trip_id
       ORDER BY arrival_time ASC`,
      [agencyId, stop_a_id, route_ids, startTime, now]
    );

    if (arrivals.rows.length < 2) continue; // Need at least two buses to calculate a headway

    const intervals: number[] = [];
    let totalDelay = 0;
    let bunchingCount = 0;
    let earlyCount = 0;
    let onTimeCount = 0;
    let lateCount = 0;
    
    for (let i = 1; i < arrivals.rows.length; i++) {
        const current = new Date(arrivals.rows[i].arrival_time).getTime();
        const previous = new Date(arrivals.rows[i-1].arrival_time).getTime();
        const interval = (current - previous) / 1000; // seconds
        intervals.push(interval);
        totalDelay += arrivals.rows[i].avg_delay ?? 0;

        if (interval < bunchingThresholdSeconds) {
            bunchingCount++;
        }

        // Categorize adherence based on avg_delay (seconds)
        const delay = arrivals.rows[i].avg_delay ?? 0;
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
    // CV = 1 is random service, CV = 0 is perfect spacing.
    const reliabilityScore = Math.max(0, Math.min(100, Math.round(100 * (1 - cv))));

    const observedAvgHeadway = (meanSeconds / 60);
    const avgDelay = totalDelay / arrivals.rows.length;

    results.push({
      linkId: link_id,
      agencyId,
      start_obs: startTime,
      end_obs: now,
      observedAvgHeadway,
      scheduledAvgHeadway: scheduled_headway,
      observedTripCount: arrivals.rows.length,
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
