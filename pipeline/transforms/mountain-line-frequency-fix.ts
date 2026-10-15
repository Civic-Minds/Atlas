import type { GtfsData } from '../../types/gtfs.js';

/**
 * Mountain Line RT 46 (#727): the weekday afternoon template trip 4705552 runs its stop_times from
 * 14:15, but its frequencies.txt row starts the window at 14:45 (14:45-19:12 every 90 min). Every
 * other row of the route ends 27 minutes after its last start (08:15-11:42 has last start 11:15),
 * and 19:12 is 18:45 + 27, so the window was meant to start at 14:15: the timetable's 14:15,
 * 15:45, 17:15 and 18:45 read as 14:45, 16:15 and 17:45. Corrects exactly that row and nothing
 * else; a feed that changes it is left as published.
 */
const TRIP_ID = '4705552';
const PUBLISHED = { start_time: '14:45:00', end_time: '19:12:00', headway_secs: '5400' };
const FIRST_STOP_TIME = '14:15:00';

export function fixMountainLineFrequencyWindow(gtfs: GtfsData): { gtfs: GtfsData; fixed: boolean } {
  const first = (gtfs.stopTimes ?? [])
    .filter(st => st.trip_id === TRIP_ID)
    .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))[0];
  if ((first?.departure_time || first?.arrival_time) !== FIRST_STOP_TIME) return { gtfs, fixed: false };
  let fixed = false;
  const frequencies = (gtfs.frequencies ?? []).map(row => {
    if (row.trip_id !== TRIP_ID || row.start_time !== PUBLISHED.start_time || row.end_time !== PUBLISHED.end_time
      || String(row.headway_secs) !== PUBLISHED.headway_secs) return row;
    fixed = true;
    return { ...row, start_time: FIRST_STOP_TIME };
  });
  return fixed ? { gtfs: { ...gtfs, frequencies }, fixed } : { gtfs, fixed };
}
