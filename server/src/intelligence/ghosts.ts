import { getPool } from '../storage/db';
import { getStaticPool } from '../storage/static-db';
import { log } from '../logger';

/**
 * Ghost Bus Engine (Phase 2)
 * 
 * Compares scheduled stop times against actual vehicle positions.
 * A "Ghost Bus" is a trip that is scheduled to occur but never broadcasts
 * a single position or arrival for its assigned trip_id.
 */

export interface GhostBusStats {
  agencyId: string;
  routeId: string;
  totalScheduledTrips: number;
  totalObservedTrips: number;
  ghostCount: number;
  ghostRate: number; // 0-1
}

export async function detectGhostBuses(agencyId: string, windowMinutes: number = 60): Promise<GhostBusStats[]> {
  const realtimeDb = getPool();
  const staticDb = getStaticPool();

  const now = new Date();
  const startTime = new Date(now.getTime() - windowMinutes * 60 * 1000);

  // 1. Resolve current feed version and active routes
  const agencyRow = await staticDb.query(
    `SELECT ga.id as gtfs_agency_id, fv.id as feed_version_id
     FROM agency_accounts aa
     JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
     JOIN feed_versions fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
     WHERE aa.slug = $1`,
    [agencyId]
  );

  if (agencyRow.rows.length === 0) return [];
  const { gtfs_agency_id, feed_version_id } = agencyRow.rows[0];

  // 2. Identify which calendar service IDs are active TODAY
  // Handles day-of-week rules plus calendar_dates.txt exceptions:
  //   exception_type = 1: service added on this date (include even if not in calendar)
  //   exception_type = 2: service removed on this date (exclude even if in calendar)
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  const activeServices = await staticDb.query(
    `SELECT service_id FROM calendar_services
     WHERE feed_version_id = $1
       AND ${dayOfWeek} = TRUE
       AND start_date <= CURRENT_DATE
       AND end_date >= CURRENT_DATE
       AND service_id NOT IN (
         SELECT service_id FROM calendar_exceptions
         WHERE feed_version_id = $1
           AND exception_date = CURRENT_DATE
           AND exception_type = 2
       )
     UNION
     SELECT service_id FROM calendar_exceptions
     WHERE feed_version_id = $1
       AND exception_date = CURRENT_DATE
       AND exception_type = 1`,
    [feed_version_id]
  );
  const serviceIds = activeServices.rows.map(r => r.service_id);

  if (serviceIds.length === 0) return [];

  // 3. Find trips that were scheduled to be active in the window
  // We look at trips that HAVE at least one stop_time in the window.
  // We'll group by route to provide route-level granularity.
  // Build the arrival time window in minutes-from-midnight.
  // When the window crosses midnight (startMinutes > endMinutes) use an OR
  // condition to correctly capture trips on either side of the day boundary.
  const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
  const endMinutes   = now.getHours() * 60 + now.getMinutes();
  const midnightCrossing = startMinutes > endMinutes;

  const scheduledTrips = await staticDb.query(
    `SELECT
       t.gtfs_route_id as route_id,
       t.gtfs_trip_id as trip_id
     FROM trips t
     JOIN stop_times st ON st.feed_version_id = t.feed_version_id AND st.gtfs_trip_id = t.gtfs_trip_id
     WHERE t.feed_version_id = $1
       AND t.service_id = ANY($2)
       AND (
         ${midnightCrossing
           ? 'st.arrival_time >= $3 OR st.arrival_time <= $4'
           : 'st.arrival_time >= $3 AND st.arrival_time <= $4'}
       )
     GROUP BY t.gtfs_route_id, t.gtfs_trip_id`,
    [feed_version_id, serviceIds, startMinutes, endMinutes]
  );

  // 4. Find trips that actually broadcasted positions in the window
  const observedTripsResult = await realtimeDb.query(
    `SELECT DISTINCT trip_id 
     FROM vehicle_positions 
     WHERE agency_id = $1 
       AND observed_at >= $2 
       AND observed_at <= $3`,
    [agencyId, startTime, now]
  );
  const observedTripIds = new Set(observedTripsResult.rows.map(r => r.trip_id));

  // 5. Aggregate results by route
  const statsMap = new Map<string, { scheduled: Set<string>, ghosts: number }>();

  for (const row of scheduledTrips.rows) {
    if (!statsMap.has(row.route_id)) {
      statsMap.set(row.route_id, { scheduled: new Set(), ghosts: 0 });
    }
    const stat = statsMap.get(row.route_id)!;
    stat.scheduled.add(row.trip_id);
    if (!observedTripIds.has(row.trip_id)) {
      stat.ghosts++;
    }
  }

  const results: GhostBusStats[] = [];
  statsMap.forEach((val, routeId) => {
    results.push({
      agencyId,
      routeId,
      totalScheduledTrips: val.scheduled.size,
      totalObservedTrips: val.scheduled.size - val.ghosts,
      ghostCount: val.ghosts,
      ghostRate: val.ghosts / val.scheduled.size
    });
  });

  return results.sort((a, b) => b.ghostRate - a.ghostRate);
}
