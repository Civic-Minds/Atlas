/**
 * Live run time over a direction's main stretch: the stops every regular pattern serves, so short turns count too.
 * The definition is the frequency plan's trip-set selector (`_reports/step3-tripsets-spec.md`, section 2; code
 * `pipeline/tripSets.ts` on fix/freq-step2): a regular pattern carries at least 20% of the direction's trips (if none
 * does, the most common pattern alone is regular); the main stretch is the stops every regular pattern serves, in the
 * longest regular pattern's order; if that is empty, the stops more than half the trips serve. Tails are not used here.
 * Pure: no I/O.
 */

/** The spec's REGULAR_PATTERN_MIN_SHARE. */
export const REGULAR_PATTERN_MIN_SHARE = 0.2;

/** A stretch end needs a departure measured in at least this share of the runs scheduled to serve it. */
export const RELIABLE_STOP_MIN_SHARE = 0.7;

export interface PatternTrips {
  /** Stop ids in travel order. */
  stops: readonly string[];
  /** Timetable trips on this pattern. */
  trips: number;
}

export function mainStretchStops(patterns: readonly PatternTrips[]): string[] {
  const all = patterns.filter(p => p.trips > 0 && p.stops.length > 0);
  if (!all.length) return [];
  const total = all.reduce((n, p) => n + p.trips, 0);
  let regular = all.filter(p => p.trips >= REGULAR_PATTERN_MIN_SHARE * total);
  if (!regular.length) regular = [all.reduce((a, b) => (b.trips > a.trips ? b : a))];
  const longest = regular.reduce((a, b) => (b.stops.length > a.stops.length ? b : a));
  const shared = longest.stops.filter(s => regular.every(p => p.stops.includes(s)));
  if (shared.length >= 2) return shared;
  const served = new Map<string, number>();
  for (const p of all) for (const s of new Set(p.stops)) served.set(s, (served.get(s) ?? 0) + p.trips);
  return longest.stops.filter(s => (served.get(s) ?? 0) > total / 2);
}

/**
 * Trim the stretch's ends to stops where departures are measured reliably (underground loops and tunnels report too
 * few positions), and drop `skipFirst` stops known to be measured poorly at the start. `coverage(stop)` is the share of
 * runs scheduled there with a measured departure. Returns null when fewer than two stops are left.
 */
export function reliableStretch(stops: readonly string[], coverage: (stopId: string) => number, skipFirst = 0, minShare = RELIABLE_STOP_MIN_SHARE): string[] | null {
  let a = Math.max(0, skipFirst);
  let b = stops.length - 1;
  while (a < b && coverage(stops[a]) < minShare) a++;
  while (b > a && coverage(stops[b]) < minShare) b--;
  return b > a ? stops.slice(a, b + 1) : null;
}

/**
 * The station or loop a stop belongs to ("St Clair West Station at Bay 3" -> "st clair west station"), or null when
 * the stop is not at a station or loop. Every stop of a station or loop that ends any pattern is a terminal: bays of
 * the same station count, so a car waiting in another bay is never read as delay.
 */
export function stationOrLoop(stopName: string): string | null {
  const place = stopName.split(/\s+at\s+/i)[0].trim().toLowerCase();
  return /\b(station|loop)\b/.test(place) ? place : null;
}
