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

/** The spec's regular patterns: at least 20% of the direction's trips, or the most common one alone. */
export function regularPatterns<P extends PatternTrips>(patterns: readonly P[]): P[] {
  const all = patterns.filter(p => p.trips > 0 && p.stops.length > 0);
  if (!all.length) return [];
  const total = all.reduce((n, p) => n + p.trips, 0);
  const regular = all.filter(p => p.trips >= REGULAR_PATTERN_MIN_SHARE * total);
  return regular.length ? regular : [all.reduce((a, b) => (b.trips > a.trips ? b : a))];
}

export function mainStretchStops(patterns: readonly PatternTrips[]): string[] {
  const all = patterns.filter(p => p.trips > 0 && p.stops.length > 0);
  if (!all.length) return [];
  const total = all.reduce((n, p) => n + p.trips, 0);
  const regular = regularPatterns(all);
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

/**
 * Branches: regular patterns with a tail, a contiguous run of stops off the main stretch at least `minStops` long and
 * `minM` metres long (the spec's tail test; the caller passes SHARED_STRETCH_MIN_STOPS and SHARED_STRETCH_MIN_KM).
 * Each gets its own run-time line, measured over the whole pattern. `along[i]` is stop i's metres along the pattern.
 */
export function branchPatterns<P extends PatternTrips & { along: readonly number[] }>(patterns: readonly P[], main: readonly string[], minStops: number, minM: number): P[] {
  const onMain = new Set(main);
  return regularPatterns(patterns).filter(p => {
    let start = -1;
    for (let i = 0; i <= p.stops.length; i++) {
      const off = i < p.stops.length && !onMain.has(p.stops[i]);
      if (off && start < 0) start = i;
      if (!off && start >= 0) {
        if (i - start >= minStops && p.along[i - 1] - p.along[start] >= minM) return true;
        start = -1;
      }
    }
    return false;
  });
}
