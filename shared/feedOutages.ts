/**
 * Feed outages for the Live analysis, worked out the same way whatever format the archive is in.
 *
 * The older fetcher wrote an empty line `{ts, v: []}` for a snapshot with none of a route's vehicles; `--routes all`
 * leaves those lines out. Both functions below therefore take only times (the feed's snapshot times, and the times
 * the route had vehicles), never empty lines, so an empty line and an absent line give the identical result.
 */

/** A gap longer than this many seconds between two feed snapshots is the feed being down. */
export const FEED_GAP_SECONDS = 180;
/** A route is judged "scheduled" in a minute when the timetable has at least this many trips in service. */
export const MIN_SCHEDULED_TRIPS = 4;

/** Feed-wide outages: [last snapshot before, first snapshot after] where no snapshot of any route exists for over FEED_GAP_SECONDS. */
export function feedGaps(feedSnapshotTimes: Iterable<number>): [number, number][] {
  const sorted = [...new Set(feedSnapshotTimes)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > FEED_GAP_SECONDS) out.push([sorted[i - 1], sorted[i]]);
  }
  return out;
}

/**
 * Route-only outages: feed snapshots that exist but carry none of this route's vehicles while the timetable has the
 * route in service. Returns the minutes (floor(ts / 60)) to treat as degraded and how many snapshots that was.
 * `scheduledTrips(minute)` is how many of the route's trips the timetable has in service that minute.
 */
export function routeEmptyMinutes(
  feedSnapshotTimes: Iterable<number>,
  routeVehicleTimes: Iterable<number>,
  scheduledTrips: (minute: number) => number,
): { minutes: Set<number>; snapshots: number } {
  const withVehicles = new Set(routeVehicleTimes);
  const minutes = new Set<number>();
  let snapshots = 0;
  for (const ts of new Set(feedSnapshotTimes)) {
    if (withVehicles.has(ts)) continue;
    const m = Math.floor(ts / 60);
    if (scheduledTrips(m) >= MIN_SCHEDULED_TRIPS) { snapshots++; minutes.add(m); }
  }
  return { minutes, snapshots };
}
