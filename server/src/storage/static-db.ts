import { Pool } from 'pg';

let staticPool: Pool | null = null;

export function getStaticPool(): Pool {
  if (!staticPool) {
    staticPool = new Pool({
      connectionString: process.env.STATIC_DATABASE_URL ?? 'postgresql://localhost/atlas_static',
    });
  }
  return staticPool;
}

/**
 * Finds the currently active feed_version_id for an agency slug (e.g. 'ttc').
 * Used during ingestion to link real-time positions to the correct static schedule.
 */
export async function getAgencyFeedVersion(agencySlug: string): Promise<string | null> {
  const db = getStaticPool();
  const res = await db.query(
    `SELECT v.id FROM feed_versions v
     JOIN gtfs_agencies a ON v.gtfs_agency_id = a.id
     WHERE a.agency_slug = $1 AND v.is_current = TRUE`,
    [agencySlug]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Time-based fallback: returns all stop_times for trips on a given route that
 * have at least one scheduled stop within ±1 hour of the supplied time.
 *
 * Used when the GTFS-RT trip_id doesn't match static trip_ids (e.g. TTC uses
 * Clever Devices internal IDs that differ from Toronto Open Data trip_ids).
 * Grouped by static gtfs_trip_id so the caller can pick the spatially closest trip.
 */
export async function getRouteScheduleAroundTime(
  versionId: string,
  routeId: string,
  timeSeconds: number,
): Promise<Map<string, import('../types').GtfsStopTime[]>> {
  const db = getStaticPool();
  // arrival_time is stored as integer minutes from midnight (hours*60+minutes).
  const timeMinutes = Math.round(timeSeconds / 60);
  const WINDOW_MINUTES = 60; // ±1 hour

  const res = await db.query<import('../types').GtfsStopTime & { tripId: string }>(
    `SELECT
       st.gtfs_trip_id  AS "tripId",
       st.gtfs_stop_id  AS "stopId",
       st.stop_sequence AS "stopSequence",
       st.arrival_time  AS "arrivalTime",
       st.departure_time AS "departureTime",
       s.stop_lat       AS "stopLat",
       s.stop_lon       AS "stopLon"
     FROM stop_times st
     JOIN trips t  ON t.feed_version_id  = st.feed_version_id AND t.gtfs_trip_id  = st.gtfs_trip_id
     JOIN stops s  ON s.feed_version_id  = st.feed_version_id AND s.gtfs_stop_id  = st.gtfs_stop_id
     WHERE st.feed_version_id = $1
       AND t.gtfs_route_id   = $2
       AND st.gtfs_trip_id IN (
         SELECT DISTINCT st2.gtfs_trip_id
         FROM stop_times st2
         JOIN trips t2 ON t2.feed_version_id = st2.feed_version_id AND t2.gtfs_trip_id = st2.gtfs_trip_id
         WHERE st2.feed_version_id = $1
           AND t2.gtfs_route_id   = $2
           AND st2.arrival_time BETWEEN $3 AND $4
       )
     ORDER BY st.gtfs_trip_id, st.stop_sequence`,
    [versionId, routeId, timeMinutes - WINDOW_MINUTES, timeMinutes + WINDOW_MINUTES],
  );

  const tripMap = new Map<string, import('../types').GtfsStopTime[]>();
  for (const row of res.rows) {
    const { tripId, ...stop } = row;
    if (!tripMap.has(tripId)) tripMap.set(tripId, []);
    tripMap.get(tripId)!.push(stop as import('../types').GtfsStopTime);
  }
  return tripMap;
}
