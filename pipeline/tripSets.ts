/**
 * The direction trip-set selector (frequency focus step 3, `_reports/step3-tripsets-spec.md`).
 *
 * One answer to "which trips speak for a route direction": the direction's main stretch (the stops
 * every regular pattern serves) and its tails (a regular pattern's own run of at least
 * SHARED_STRETCH_MIN_STOPS stops and SHARED_STRETCH_MIN_KM off the main stretch). Every other
 * pattern is a variant: it forms no stretch, and its trips count wherever they serve. A stretch is
 * measured at its middle stop (decision D2) with every trip that serves it, at that trip's own
 * time there.
 *
 * Shadow only: processing stamps the results as JSON-only fields that nothing reads yet. Pure: no
 * I/O and no feature access. The scripts/handcheck/stretch-departures.py oracle (`--at mid`)
 * computes the same stretches from the feed zip.
 */
import { TIME_PERIODS, type PeriodKey } from '../shared/config.js';
import {
  computePeriodCoverageHeadways,
  computePeriodHeadways,
  computePeriodSustained,
  forCrossMidnightWindow,
  hasSustainedServiceInWindow,
  nightServiceDepartureTimes,
} from './headway-utils.js';
import { SHARED_STRETCH_MIN_KM, SHARED_STRETCH_MIN_STOPS } from './sharedStretch.js';

/** Night for the stretch fields (D7): 2-5am, GTFS 26:00 to 29:00. */
export const STRETCH_NIGHT_START_MIN = 26 * 60;
export const STRETCH_NIGHT_END_MIN = 29 * 60;

export interface TripVisit {
  stopId: string;
  /** GTFS clock minutes at this stop (24:00+ kept). */
  minutes: number;
  /** A departure on a genuinely overnight-only service (#297): also counts at minutes + 1440 for night. */
  overnightOnly?: boolean;
  /**
   * false: the visit shapes the trip's pattern but is not a departure stopDepsByGroup counts (a
   * chained trip's end, where the next trip of the block departs instead). Default true.
   */
  counted?: boolean;
}

/** One trip of a route direction day: its first visit of each stop, in stop_sequence order. */
export interface DirectionTrip {
  tripId: string;
  visits: readonly TripVisit[];
  /**
   * Phase 2 classes the trip's pattern part-time or limited (#720 / CIV-220: time-limited,
   * irregular or rush-hour-only). Such a pattern is never a branch: its trips count where they
   * serve, as a variant's do.
   */
  limited?: boolean;
}

export interface Stretch {
  kind: 'main' | 'tail';
  /** Travel order. */
  stops: readonly string[];
  /** D2: the middle of the stops most of the stretch's trips serve. */
  refStop: string;
  lengthKm: number;
  /** Sorted unique departures at refStop, every trip that serves it. */
  times: readonly number[];
  /** times plus the #297 overnight-only shift, as nightServiceDepartureTimes builds them. */
  nightTimes: readonly number[];
  /** Trips serving refStop. */
  tripCount: number;
}

export interface DirectionStretches {
  key: string;
  /** null: no stop is served by every regular pattern nor by more than half the trips. */
  main: Stretch | null;
  tails: readonly Stretch[];
  regularPatternCount: number;
  /** Trips on patterns that are not regular. */
  variantTripCount: number;
}

type Coord = [lat: number, lon: number];

function km(a: Coord, b: Coord): number {
  const p = Math.PI / 180;
  const x = (b[1] - a[1]) * p * Math.cos(((a[0] + b[0]) / 2) * p);
  const y = (b[0] - a[0]) * p;
  return 6371 * Math.hypot(x, y);
}

function runKm(stops: readonly string[], stopCoord: (stopId: string) => Coord | undefined): number | null {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stopCoord(stops[i - 1]);
    const b = stopCoord(stops[i]);
    if (!a || !b) return null;
    total += km(a, b);
  }
  return total;
}

/** D2: the stretch's stops served by more than half of the trips serving any of them, index floor(n / 2). */
function middleStop(stops: readonly string[], tripStops: readonly ReadonlySet<string>[]): string {
  const ids = new Set(stops);
  const serving = tripStops.filter(set => [...set].some(id => ids.has(id)));
  const majority = stops.filter(stop => serving.filter(set => set.has(stop)).length * 2 > serving.length);
  const pool = majority.length > 0 ? majority : stops;
  return pool[Math.floor(pool.length / 2)];
}

/** True when the trips, read at `stop`, run steadily through at least one period (steady and on both sides of its midpoint). */
function runsSteadily(trips: readonly DirectionTrip[], stop: string): boolean {
  const times: number[] = [];
  for (const trip of trips) {
    const visit = trip.visits.find(v => v.stopId === stop);
    if (visit && visit.counted !== false) times.push(visit.minutes);
  }
  return Object.values(periodSustainedMid(times)).some(Boolean);
}

/**
 * Splits one route direction day into its main stretch and tails, and reads each at its middle
 * stop. `trips` are the same trips (first visits, frequency-expanded departures included) that
 * build stopDepsByGroup for this key.
 */
export function directionStretches(
  key: string,
  trips: readonly DirectionTrip[],
  stopCoord: (stopId: string) => Coord | undefined,
): DirectionStretches {
  const withVisits = trips.filter(trip => trip.visits.length > 0);
  const patterns = new Map<string, { stops: string[]; trips: DirectionTrip[] }>();
  for (const trip of withVisits) {
    const stops = trip.visits.map(v => v.stopId);
    const id = stops.join('>');
    const entry = patterns.get(id);
    if (entry) entry.trips.push(trip);
    else patterns.set(id, { stops, trips: [trip] });
  }
  const all = [...patterns.values()];
  if (all.length === 0) return { key, main: null, tails: [], regularPatternCount: 0, variantTripCount: 0 };
  // Regular: the pattern runs steadily through at least one period at its own middle stop (the
  // steady test plus the D8 midpoint test). Stray, part-day and garage trips fail it, whatever
  // their share of trips; a branch every 30 all day passes it (TTC 102D to Major Mackenzie, 18%).
  let regular = all.filter(p => !p.trips.every(t => t.limited) && runsSteadily(p.trips, p.stops[Math.floor(p.stops.length / 2)]));
  // No pattern runs steadily: the most common one alone is regular.
  const busiest = (list: typeof all) => list.reduce((x, y) => (y.trips.length > x.trips.length ? y : x));
  if (regular.length === 0) regular = [busiest(all)];
  const variantTripCount = withVisits.length - regular.reduce((n, p) => n + p.trips.length, 0);

  const tripStops = withVisits.map(trip => new Set(trip.visits.map(v => v.stopId)));
  // Main stretch: the stops every regular pattern serves, in the longest regular pattern's order.
  const longestRegular = regular.reduce((x, y) => (y.stops.length > x.stops.length ? y : x));
  let mainStops = longestRegular.stops.filter(stop => regular.every(p => p.stops.includes(stop)));
  if (mainStops.length === 0) {
    // Regular patterns that share no stop (a route run as two halves meeting at a hub, TTC 25
    // at Don Mills Station; two routes drawn as one group): the busiest regular pattern is the
    // main stretch, and the others' own runs are its tails.
    mainStops = [...busiest(regular).stops];
  }
  const common = new Set(mainStops);

  const timesAt = (stop: string) => {
    const times = new Set<number>();
    const overnight: number[] = [];
    let count = 0;
    for (const trip of withVisits) {
      const visit = trip.visits.find(v => v.stopId === stop);
      if (!visit || visit.counted === false) continue;
      count++;
      times.add(visit.minutes);
      if (visit.overnightOnly) overnight.push(visit.minutes + 1440);
    }
    const sorted = [...times].sort((a, b) => a - b);
    return { times: sorted, nightTimes: nightServiceDepartureTimes(sorted, overnight), tripCount: count };
  };
  const stretch = (kind: Stretch['kind'], stops: readonly string[], lengthKm: number): Stretch => {
    const refStop = middleStop(stops, tripStops);
    return { kind, stops, refStop, lengthKm, ...timesAt(refStop) };
  };

  const main = mainStops.length > 0 ? stretch('main', mainStops, runKm(mainStops, stopCoord) ?? 0) : null;

  // Tails: each regular pattern's maximal runs off the main stretch that pass the shared-stretch
  // test. Runs sharing their middle stop, or overlapping in half their stops, are one tail.
  const runs: Array<{ stops: string[]; km: number }> = [];
  for (const pattern of regular) {
    let run: string[] = [];
    for (const stop of [...pattern.stops, null]) {
      if (stop !== null && !common.has(stop)) { run.push(stop); continue; }
      if (run.length >= SHARED_STRETCH_MIN_STOPS) {
        const length = runKm(run, stopCoord);
        if (length != null && length >= SHARED_STRETCH_MIN_KM) runs.push({ stops: run, km: length });
      }
      run = [];
    }
  }
  const merged: Array<{ stops: string[]; km: number }> = [];
  for (const run of [...runs].sort((a, b) => b.stops.length - a.stops.length)) {
    const into = merged.find(m => {
      const overlap = run.stops.filter(stop => m.stops.includes(stop)).length;
      return overlap * 2 >= run.stops.length || m.stops.includes(run.stops[Math.floor(run.stops.length / 2)]);
    });
    if (into) into.stops.push(...run.stops.filter(stop => !into.stops.includes(stop)));
    else merged.push({ stops: [...run.stops], km: run.km });
  }
  const tails = main ? merged.map(t => stretch('tail', t.stops, t.km)) : [];

  return { key, main, tails, regularPatternCount: regular.length, variantTripCount };
}

export interface StretchPeriod {
  /** Whether the stretch speaks for its direction in the period. */
  counts: boolean;
  /** Steady: the period headway; not steady: the full-window wait (as tileEffectiveHeadwayExpr reads it). */
  value: number | null;
  headway: number | null;
  coverage: number | null;
  sustained: boolean | null;
  /** D8 shadow: sustained, and service runs on both sides of the period's midpoint. */
  sustainedMid: boolean | null;
}

const PERIOD_WINDOWS = TIME_PERIODS.map(p => ({ key: p.key as PeriodKey, start: p.startHour * 60, end: p.endHour * 60 }));

/** D8: sustained AND the first departure in [start, end] is before the midpoint AND the last after it. */
export function sustainedWithMidpoint(times: readonly number[], sustained: boolean | undefined, start: number, end: number): boolean | null {
  if (sustained == null) return null;
  const inWindow = times.filter(t => t >= start && t <= end);
  const midpoint = (start + end) / 2;
  return sustained && inWindow.length > 0 && inWindow[0] < midpoint && inWindow[inWindow.length - 1] > midpoint;
}

/** Feature-level D8 shadow on a feature's own period times (`headwayByPeriodSustainedMid`). */
export function periodSustainedMid(times: readonly number[]): Partial<Record<PeriodKey, boolean>> {
  const sustained = computePeriodSustained([...times]);
  const out: Partial<Record<PeriodKey, boolean>> = {};
  for (const { key, start, end } of PERIOD_WINDOWS) {
    const mid = sustainedWithMidpoint([...new Set(forCrossMidnightWindow([...times], end))].sort((a, b) => a - b), sustained[key], start, end);
    if (mid != null) out[key] = mid;
  }
  return out;
}

export function stretchPeriods(s: Stretch): Record<PeriodKey, StretchPeriod> {
  const times = [...s.times];
  const headways = computePeriodHeadways(times);
  const coverage = computePeriodCoverageHeadways(times);
  const sustained = computePeriodSustained(times);
  const out = {} as Record<PeriodKey, StretchPeriod>;
  for (const { key, start, end } of PERIOD_WINDOWS) {
    const runs = coverage[key] != null;
    const steady = sustained[key] === true;
    const value = !runs ? null : steady ? (headways[key] ?? null) : coverage[key] ?? null;
    out[key] = {
      // A tail speaks for the direction only where it runs steadily through the period.
      counts: runs && (s.kind === 'main' || (steady && sustainedWithMidpoint([...new Set(forCrossMidnightWindow(times, end))].sort((a, b) => a - b), sustained[key], start, end) === true)),
      value,
      headway: headways[key] ?? null,
      coverage: coverage[key] ?? null,
      sustained: sustained[key] ?? null,
      sustainedMid: sustainedWithMidpoint([...new Set(forCrossMidnightWindow([...times], end))].sort((a, b) => a - b), sustained[key], start, end),
    };
  }
  return out;
}

/** Night (D7: 26:00-29:00), every gap including both edges at most maxGap. null: no departure in the window. */
export function stretchNight(s: Stretch, maxGap: 30 | 60): boolean | null {
  if (!s.nightTimes.some(t => t >= STRETCH_NIGHT_START_MIN && t <= STRETCH_NIGHT_END_MIN)) return null;
  return hasSustainedServiceInWindow([...s.nightTimes], STRETCH_NIGHT_START_MIN, STRETCH_NIGHT_END_MIN, maxGap);
}

export interface DirectionRollup {
  period: Record<PeriodKey, { value: number | null; coverage: number | null; sustained: boolean | null; sustainedMid: boolean | null; mainValue: number | null }>;
  night30: boolean;
  night60: boolean;
}

/** D1 and D3: the direction value is the worst counting stretch; night needs the main stretch and every tail that runs at night. */
export function rollupDirection(d: DirectionStretches): DirectionRollup | null {
  if (!d.main) return null;
  const main = stretchPeriods(d.main);
  const tails = d.tails.map(stretchPeriods);
  const period = {} as DirectionRollup['period'];
  for (const { key } of PERIOD_WINDOWS) {
    const counting = [main[key], ...tails.map(t => t[key])].filter(p => p.counts && p.value != null);
    period[key] = {
      value: counting.length > 0 ? Math.max(...counting.map(p => p.value!)) : null,
      coverage: counting.length > 0 ? Math.max(...counting.map(p => p.coverage ?? 0)) : null,
      sustained: counting.length > 0 ? counting.every(p => p.sustained === true) : null,
      sustainedMid: counting.length > 0 ? counting.every(p => p.sustainedMid === true) : null,
      mainValue: main[key].counts ? main[key].value : null,
    };
  }
  const night = (gap: 30 | 60) => stretchNight(d.main!, gap) === true
    && d.tails.every(t => stretchNight(t, gap) !== false);
  return { period, night30: night(30), night60: night(60) };
}

export interface RouteRollup {
  period: Record<PeriodKey, { value: number | null; coverage: number | null; range: [number, number] | null }>;
  night30: boolean;
  night60: boolean;
}

/**
 * Rule 1: the route value is the worst direction, and a direction with no value (no stretch data,
 * or no regular service in the period) leaves the route with none: never one direction alone.
 * The range (D1, display only) runs from the worst direction's main stretch to the route value,
 * null when they agree. Night: every direction the route runs by day must pass. `dirs` holds one
 * entry per direction the route runs by day, null where it has no stretch data.
 */
export function rollupRoute(dirs: readonly (DirectionRollup | null)[]): RouteRollup {
  const period = {} as RouteRollup['period'];
  const known = dirs.filter((d): d is DirectionRollup => d != null);
  const complete = dirs.length > 0 && known.length === dirs.length;
  for (const { key } of PERIOD_WINDOWS) {
    const values = known.map(d => d.period[key].value);
    const value = complete && values.every(v => v != null) ? Math.max(...(values as number[])) : null;
    const mains = known.map(d => d.period[key].mainValue).filter((v): v is number => v != null);
    const coverages = known.map(d => d.period[key].coverage);
    const low = mains.length === known.length && mains.length > 0 ? Math.max(...mains) : null;
    period[key] = {
      value,
      coverage: value != null && coverages.every(v => v != null) ? Math.max(...(coverages as number[])) : null,
      range: value != null && low != null && low !== value ? [Math.min(low, value), value] : null,
    };
  }
  return {
    period,
    night30: complete && known.every(d => d.night30),
    night60: complete && known.every(d => d.night60),
  };
}

/** Shadow keys stamped by stampStretchShadow. JSON only: tiles leave them out (prepareAgencyRoutesForTiles). */
export const STRETCH_SHADOW_KEYS = [
  'stretchPeriodHeadway',
  'stretchPeriodCoverage',
  'stretchPeriodSustained',
  'stretchPeriodSustainedMid',
  'stretchRoutePeriodHeadway',
  'stretchPeriodRange',
  'stretchNight30',
  'stretchNight60',
  'stretchMeta',
  'headwayByPeriodSustainedMid',
] as const;

type ShadowFeature = { properties: Record<string, unknown> };

/**
 * Stamps the stretch shadow fields (spec section 4) on every feature whose route direction day has
 * stretch data. `slotOf` gives a feature's stop-group key parts (the stopDepsByGroup key), null to
 * skip it. Nothing reads these fields yet.
 */
export function stampStretchShadow(
  features: readonly ShadowFeature[],
  byKey: ReadonlyMap<string, DirectionStretches>,
  slotOf: (feature: ShadowFeature) => { group: string; dirId: string; day: string } | null,
): void {
  const rollups = new Map<string, DirectionRollup | null>();
  const rollupOf = (key: string): DirectionRollup | null => {
    if (!rollups.has(key)) {
      const d = byKey.get(key);
      rollups.set(key, d ? rollupDirection(d) : null);
    }
    return rollups.get(key)!;
  };
  // Route day → its directions (every direction drawn that day counts as run by day).
  const routeDirs = new Map<string, Set<string>>();
  for (const feature of features) {
    const slot = slotOf(feature);
    if (!slot) continue;
    const routeKey = `${slot.group}::${slot.day}`;
    let dirs = routeDirs.get(routeKey);
    if (!dirs) { dirs = new Set(); routeDirs.set(routeKey, dirs); }
    dirs.add(slot.dirId);
  }
  const routeRollups = new Map<string, RouteRollup | null>();
  const routeRollupOf = (group: string, day: string): RouteRollup | null => {
    const routeKey = `${group}::${day}`;
    if (!routeRollups.has(routeKey)) {
      const dirIds = [...(routeDirs.get(routeKey) ?? [])];
      const dirs = dirIds.map(dirId => rollupOf(`${group}::${dirId}::${day}`));
      routeRollups.set(routeKey, dirs.some(d => d != null) ? rollupRoute(dirs) : null);
    }
    return routeRollups.get(routeKey)!;
  };
  const byPeriod = <T>(pick: (key: PeriodKey) => T) =>
    Object.fromEntries(PERIOD_WINDOWS.map(({ key }) => [key, pick(key)])) as Record<PeriodKey, T>;
  for (const feature of features) {
    const slot = slotOf(feature);
    if (!slot) continue;
    const key = `${slot.group}::${slot.dirId}::${slot.day}`;
    const stretches = byKey.get(key);
    const dir = rollupOf(key);
    const route = routeRollupOf(slot.group, slot.day);
    if (!stretches || !dir || !route) continue;
    const p = feature.properties;
    p.stretchPeriodHeadway = byPeriod(k => dir.period[k].value);
    p.stretchPeriodCoverage = byPeriod(k => dir.period[k].coverage);
    p.stretchPeriodSustained = byPeriod(k => dir.period[k].sustained);
    p.stretchPeriodSustainedMid = byPeriod(k => dir.period[k].sustainedMid);
    p.stretchRoutePeriodHeadway = byPeriod(k => route.period[k].value);
    p.stretchPeriodRange = byPeriod(k => route.period[k].range);
    p.stretchNight30 = route.night30;
    p.stretchNight60 = route.night60;
    p.stretchMeta = {
      main: stretches.main ? { stops: stretches.main.stops.length, refStop: stretches.main.refStop, trips: stretches.main.tripCount } : null,
      tails: stretches.tails.map(t => ({ refStop: t.refStop, stops: t.stops.length, km: Math.round(t.lengthKm * 100) / 100, trips: t.tripCount })),
    };
  }
}
