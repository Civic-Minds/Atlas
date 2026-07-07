import type { GtfsData } from '../types/gtfs.js';

function LevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return tmp[a.length][b.length];
}

export function synthesizeMissingDirections(gtfs: GtfsData): GtfsData {
  if (!gtfs.trips || gtfs.trips.length === 0) return gtfs;

  const tripsByRoute = new Map<string, typeof gtfs.trips>();
  for (const t of gtfs.trips) {
    if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
    tripsByRoute.get(t.route_id)!.push(t);
  }

  const lastStopByTrip = new Map<string, string>();
  const maxSeqByTrip = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
    if (seq > currentMax) {
      maxSeqByTrip.set(st.trip_id, seq);
      lastStopByTrip.set(st.trip_id, st.stop_id);
    }
  }
  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));

  let synthesizedCount = 0;
  for (const [, rTrips] of tripsByRoute.entries()) {
    const hasAnyDir = rTrips.some(t => t.direction_id != null && String(t.direction_id).trim() !== '');
    if (hasAnyDir) continue;

    const groups = new Map<string, typeof gtfs.trips>();
    for (const t of rTrips) {
      let headsign = t.trip_headsign?.trim();
      if (!headsign) {
        const lastStopId = lastStopByTrip.get(t.trip_id);
        if (lastStopId) headsign = stopNameById.get(lastStopId);
      }
      const key = t.shape_id || headsign || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    if (sortedGroups.length > 0) {
      const [key0, trips0] = sortedGroups[0];
      for (const t of trips0) {
        t.direction_id = '0';
        synthesizedCount++;
      }

      if (sortedGroups.length > 1) {
        const [key1, trips1] = sortedGroups[1];
        for (const t of trips1) {
          t.direction_id = '1';
          synthesizedCount++;
        }

        for (let i = 2; i < sortedGroups.length; i++) {
          const [keyI, tripsI] = sortedGroups[i];
          const dist0 = LevenshteinDistance(keyI, key0);
          const dist1 = LevenshteinDistance(keyI, key1);
          const dir = dist0 <= dist1 ? '0' : '1';
          for (const t of tripsI) {
            t.direction_id = dir;
            synthesizedCount++;
          }
        }
      }
    }
  }

  if (synthesizedCount > 0) {
    console.log(`Synthesized direction_id for ${synthesizedCount} trips across routes lacking direction_id.`);
  }

  return gtfs;
}
