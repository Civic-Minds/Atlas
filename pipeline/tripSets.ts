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
import { PERIOD_COVERAGE_MAX_HEADWAY } from '../shared/periodEligibility.js';
import { DEFAULT_CRITERIA } from './defaults.js';
import { BURST_MAX_SPAN_MINUTES, MIN_PEAK_BLOCK_DEPARTURES, computeHeadwayStats } from './transit-phase2.js';
import { ALL_DAY_MIDDAY_MAX_WAIT } from '../shared/worstDirection.js';
import { NO_PERIOD_SERVICE_TILE_VALUE } from '../shared/pmtilesProps.js';
import {
  computePeriodCoverageHeadways,
  computePeriodHeadways,
  BOUNDARY_DOMINANT_RATIO,
  computePeriodSustained,
  computeResearchFrequentService,
  forCrossMidnightWindow,
  hasSustainedFrequentService,
  medianHeadwayInWindow,
  hasSustainedServiceInWindow,
  nightServiceDepartureTimes,
} from './headway-utils.js';
import { SHARED_STRETCH_MIN_KM, SHARED_STRETCH_MIN_STOPS } from './sharedStretch.js';

/** A short turn (stops all on a longer regular pattern) under this share of trips is a variant (the spec's regular-pattern share). */
export const SHORT_TURN_MIN_SHARE = 0.2;

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
  /**
   * The regular patterns share no stop: disconnected pieces (TTC 25's halves, NYC subway S's
   * three shuttles). Each piece off the main stretch is a tail whatever its length, and at night
   * only the pieces that run at night must pass.
   */
  disconnected?: boolean;
  /**
   * The same direction built from only the trips that run in the 2-5am window (nightOnlyTrips):
   * the night version of the route, judged when the daytime main stretch has no night service
   * (Ryan, 2026-10-15: night service on part of the route counts, on the part it runs).
   */
  night?: DirectionStretches;
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
function runsSteadily(trips: readonly DirectionTrip[], stop: string, periods: readonly PeriodKey[]): boolean {
  const times: number[] = [];
  for (const trip of trips) {
    const visit = trip.visits.find(v => v.stopId === stop);
    if (visit && visit.counted !== false) times.push(visit.minutes);
  }
  const steady = periodSustainedMid(times);
  return periods.some(period => steady[period] === true);
}

/** The daytime periods (06:00-23:00) that shape a route's stretches; late and overnight only shape a night route's. */
const DAYTIME_PERIODS: readonly PeriodKey[] = ['amPeak', 'midday', 'pmPeak', 'evening'];
const ALL_PERIODS: readonly PeriodKey[] = ['amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight'];

/**
 * Splits one route direction day into its main stretch and tails, and reads each at its middle
 * stop. `trips` are the same trips (first visits, frequency-expanded departures included) that
 * build stopDepsByGroup for this key.
 */
export function directionStretches(
  key: string,
  trips: readonly DirectionTrip[],
  stopCoord: (stopId: string) => Coord | undefined,
  /** The trips whose departures are read at each stretch's middle stop; the shaping trips by default. */
  measureTrips: readonly DirectionTrip[] = trips,
  /**
   * 'shared': the main stretch is the stops every regular pattern serves (the daytime rule).
   * 'mostVisits': the regular pattern with the most stop visits (trips times stops), the rule the
   * daytime uses when regular patterns share no stop. The night version uses it, so a short owl
   * hop with many trips (TTC 353's 3-stop Tapscott hop) cannot become the night route.
   */
  mainBy: 'shared' | 'mostVisits' = 'shared',
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
  // Daytime service shapes the stretches: a night-only pattern (CTA 87's owl over part of the
  // route) is a variant by day, so it cannot shrink the main stretch to its own stops and leave the
  // rest of the route as tails that drop out at night. A route with no steady daytime pattern
  // (a night route) is shaped by the patterns that run steadily in any period.
  // #720's minimum evidence for a timetable, on the pattern's own trips (not phase 2's per-shape
  // class, which a feed giving each trip its own shape defeats): fewer than
  // MIN_PEAK_BLOCK_DEPARTURES trips, or all of them within BURST_MAX_SPAN_MINUTES, is a burst and
  // never a branch (TransLink 044's 3-trip Dundarave Express).
  const eligible = all.filter(p => {
    if (p.trips.length < MIN_PEAK_BLOCK_DEPARTURES) return false;
    const starts = p.trips.map(t => t.visits[0].minutes);
    return Math.max(...starts) - Math.min(...starts) > BURST_MAX_SPAN_MINUTES;
  });
  const steadyIn = (periods: readonly PeriodKey[]) => eligible.filter(p => runsSteadily(p.trips, p.stops[Math.floor(p.stops.length / 2)], periods));
  let regular = steadyIn(DAYTIME_PERIODS);
  if (regular.length === 0) regular = steadyIn(ALL_PERIODS);
  // A short turn: a regular pattern whose stops all lie on a longer regular pattern shapes the
  // main stretch only when it carries a real share of the direction's trips (the spec's 20%).
  // Below it, it is a variant whose trips count where they serve: CTA 93's 7-trip Logan Square -
  // Foster turn (18%) shrank the main stretch to its own stops and its evening trips read as
  // evening service on the route, and SEPTA 66's 5-trip Cottman turn cut the trunk to 17 stops.
  // TTC 94's Wellesley pattern (half the trips) still shapes it, so the Harbord tail stays.
  const regularSets = new Map(regular.map(p => [p, new Set(p.stops)]));
  const minorShortTurn = (p: (typeof regular)[number]) => p.trips.length < SHORT_TURN_MIN_SHARE * withVisits.length
    && regular.some(other => other !== p && other.stops.length > p.stops.length && p.stops.every(stop => regularSets.get(other)!.has(stop)));
  if (regular.some(p => !minorShortTurn(p))) regular = regular.filter(p => !minorShortTurn(p));
  // No pattern runs steadily: the most common one alone is regular.
  const busiest = (list: typeof all) => list.reduce((x, y) => (y.trips.length > x.trips.length ? y : x));
  if (regular.length === 0) regular = [busiest(all)];
  const variantTripCount = withVisits.length - regular.reduce((n, p) => n + p.trips.length, 0);

  const tripStops = withVisits.map(trip => new Set(trip.visits.map(v => v.stopId)));
  // Main stretch: the stops every regular pattern serves, in the longest regular pattern's order.
  const longestRegular = regular.reduce((x, y) => (y.stops.length > x.stops.length ? y : x));
  let mainStops = mainBy === 'shared' ? longestRegular.stops.filter(stop => regular.every(p => p.stops.includes(stop))) : [];
  const disconnected = mainBy === 'shared' && mainStops.length === 0;
  if (mainStops.length === 0) {
    // Regular patterns that share no stop (a route run as two halves meeting at a hub, TTC 25
    // at Don Mills Station; two routes drawn as one group): the regular pattern with the most stop
    // visits (trips times stops) is the main stretch, and the others' own runs are its tails. Not
    // the one with the most trips: TTC 300's 2-stop Pearson T1-T3 hop would be main and the
    // 117-stop trunk a tail.
    const visits = (p: (typeof regular)[number]) => p.trips.length * p.stops.length;
    mainStops = [...regular.reduce((x, y) => (visits(y) > visits(x) ? y : x)).stops];
  }
  const common = new Set(mainStops);

  const timesAt = (stop: string) => {
    const times = new Set<number>();
    const overnight: number[] = [];
    let count = 0;
    for (const trip of measureTrips) {
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

  // Tails: each regular pattern's runs off the main stretch, split wherever the set of regular
  // patterns serving the stops changes, that pass the shared-stretch test. Two branches that share
  // a road beyond the main stretch and then part (TTC 102B and 102D on Markham Rd, 102D alone to
  // Major Mackenzie) give a shared tail and a 102D-only tail, so the slower part is not read at a
  // stop both serve. The same segment from several patterns is one tail.
  const servingSet = (stop: string) => regular.filter(p => p.stops.includes(stop)).map(p => regular.indexOf(p)).join(',');
  const segments = new Map<string, { stops: string[]; km: number }>();
  for (const pattern of regular) {
    let run: string[] = [];
    let runSet: string | null = null;
    const close = () => {
      // A disconnected piece is not a branch off the main stretch, so it is a stretch of its
      // own whatever its length (NYC subway S's 4-stop Franklin Av shuttle).
      const wholePiece = disconnected && run.length === pattern.stops.length;
      if (wholePiece || run.length >= SHARED_STRETCH_MIN_STOPS) {
        const length = runKm(run, stopCoord);
        const key = [...run].sort().join('>');
        if (length != null && (wholePiece || length >= SHARED_STRETCH_MIN_KM) && !segments.has(key)) segments.set(key, { stops: run, km: length });
      }
      run = [];
      runSet = null;
    };
    for (const stop of pattern.stops) {
      if (common.has(stop)) { close(); continue; }
      const set = servingSet(stop);
      if (runSet !== null && set !== runSet) close();
      run.push(stop);
      runSet = set;
    }
    close();
  }
  const merged = [...segments.values()];
  const tails = main ? merged.map(t => stretch('tail', t.stops, t.km)) : [];

  return { key, main, tails, regularPatternCount: regular.length, variantTripCount, disconnected: disconnected || undefined };
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

/**
 * D3 with the D8 midpoint: service runs at night when it has departures on both sides of the
 * 2-5am window's midpoint (3:30, which counts as the later side). `nightTimes` are GTFS minutes
 * as nightServiceDepartureTimes builds them.
 */
export function runsAcrossNightMidpoint(nightTimes: readonly number[]): boolean {
  const mid = (STRETCH_NIGHT_START_MIN + STRETCH_NIGHT_END_MIN) / 2;
  return nightTimes.some(x => x >= STRETCH_NIGHT_START_MIN && x < mid) && nightTimes.some(x => x >= mid && x <= STRETCH_NIGHT_END_MIN);
}

/**
 * One direction's Night verdict at `gap` minutes, 2-5am.
 * - 'pass': the main stretch passes and every tail that runs at night passes (D3); for
 *   disconnected pieces, every piece that runs at night passes and at least one runs.
 * - 'partial': the daytime main stretch has no qualifying night service, but the night version
 *   of the direction (its night trips' own stretches) passes the same test: night service on part
 *   of the route, or on a night path (NYC subway 3 and 5, CTA 87). Ryan, 2026-10-15: it counts,
 *   drawn and listed on the part it runs.
 * - 'fail': neither.
 */
export type NightVerdict = 'pass' | 'partial' | 'fail';
function fullNightVerdict(d: DirectionStretches, gap: 30 | 60): boolean {
  if (!d.main) return false;
  const runsAtNight = (t: Stretch) => runsAcrossNightMidpoint(t.nightTimes);
  const passes = (t: Stretch) => stretchNight(t, gap) === true;
  if (d.disconnected) {
    // The main stretch is only one piece, so it drops out like a tail when it does not run at
    // night (NYC subway S's 42 St shuttle).
    const running = [d.main, ...d.tails].filter(runsAtNight);
    return running.length > 0 && running.every(passes);
  }
  return passes(d.main) && d.tails.filter(runsAtNight).every(passes);
}
export function directionNightVerdict(d: DirectionStretches, gap: 30 | 60): NightVerdict {
  if (fullNightVerdict(d, gap)) return 'pass';
  // Partial only when night service does not reach the daytime main stretch's middle stop (no
  // departures on both sides of 3:30 there): the night route runs elsewhere or on part of the
  // route. A main stretch that runs at night but fails the gap test (TTC 353: 3:06-4:36 every 30,
  // a 66-minute opening gap) is a fail, whatever a short owl hop on it does.
  if (d.main && !d.disconnected && runsAcrossNightMidpoint(d.main.nightTimes)) return 'fail';
  if (d.night && fullNightVerdict(d.night, gap)) return 'partial';
  return 'fail';
}

/**
 * The trips that shape a direction's night version: those running in the first half of the 2-5am
 * window (2:00-3:30) at some stop, the owl. Day trips that only start up after 3:30 (CTA 87's
 * full-route trips from 3:29 on) would stretch it back over the whole route. The night version is
 * then measured with every trip of the direction.
 */
export function nightOnlyTrips(trips: readonly DirectionTrip[]): DirectionTrip[] {
  const mid = (STRETCH_NIGHT_START_MIN + STRETCH_NIGHT_END_MIN) / 2;
  const inWindow = (t: number) => t >= STRETCH_NIGHT_START_MIN && t < mid;
  return trips.filter(trip => trip.visits.some(v => inWindow(v.minutes) || inWindow(v.minutes + 1440)));
}

export interface DirectionRollup {
  period: Record<PeriodKey, {
    value: number | null; coverage: number | null; sustained: boolean | null; sustainedMid: boolean | null; mainValue: number | null;
    /**
     * Step 5a filter value: the worst counting stretch, each read as the tile rule reads a row
     * (steady with a full-window wait of PERIOD_COVERAGE_MAX_HEADWAY or less: its headway; else its
     * wait). null: the main stretch runs only stray or part-day trips in the period (no departure on
     * one side of its midpoint), so the direction has no regular service there.
     */
    filterValue: number | null;
    /** The main stretch runs through the period (departures on both sides of its midpoint). */
    runs: boolean;
    /** The main stretch has any departure in the period. A direction with none is skipped by the route (a one-way peak route). */
    hasService: boolean;
  }>;
  night30: boolean;
  night60: boolean;
  /** Passes only on the night version of the direction (part of the route, or a night path). */
  nightPartial30: boolean;
  nightPartial60: boolean;
  /** Step 6 shadow: the all-day (6-22h) headline, the worst of the main stretch and each steady tail. */
  allDay: number | null;
  /** Step 6 shadow: the main stretch's midday wait (#899 cap input), null with no midday service. */
  middayWait: number | null;
  limitedOnly: boolean;
  /** Step 6: the #899 inputs, as worstDirection.ts reads them, on the main stretch. */
  midday: { hasReading: boolean; runs: boolean; wait: number | null };
  /** Step 6 shadow: Frequent Service (7-19 every 15, no gap) on the main stretch and every tail running then. */
  frequent: boolean;
  research: { daytime15: boolean; daytime30: boolean; extended15: boolean; extended30: boolean };
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
      filterValue: null,
      runs: false,
      hasService: false,
    };
  }
  // Step 5a: the filter value and whether the direction runs, per period.
  for (const { key, start, end } of PERIOD_WINDOWS) {
    const mid = (start + end) / 2;
    const timesIn = (s: Stretch) => [...new Set(forCrossMidnightWindow([...s.times], end))].filter(t => t >= start && t <= end);
    const throughMidpoint = (s: Stretch) => { const t = timesIn(s); return t.some(x => x < mid) && t.some(x => x >= mid); };
    // The settled period checks (#567-#571, PR #584) decide whether a period that has departures
    // on both sides of its midpoint really runs through it: when it is not steady and its longest
    // gap between two departures is more than BOUNDARY_DOMINANT_RATIO times its typical gap, the
    // departures are a straggler and the first trips of the next service, not service through
    // the period (TTC 900 overnight: 26:11-26:41, then nothing until 29:19).
    const dominantHole = (s: Stretch) => {
      if (main[key].sustained !== false) return false;
      const dt = forCrossMidnightWindow([...s.times], end);
      const median = medianHeadwayInWindow(dt, start, end, 3);
      if (median == null || median <= 0) return false;
      // Internal gaps only: a late start or an early end is the edge rules' business (CTA 134 PM
      // runs every 9 from 16:14), a hole between two runs of service is this one's.
      const t = timesIn(s).sort((a, b) => a - b);
      let longest = 0;
      for (let i = 1; i < t.length; i++) longest = Math.max(longest, t[i] - t[i - 1]);
      return longest / median > BOUNDARY_DOMINANT_RATIO;
    };
    const runs = throughMidpoint(d.main) && !dominantHole(d.main);
    const filterOf = (p: StretchPeriod) => (p.sustained === true && p.coverage != null && p.coverage <= PERIOD_COVERAGE_MAX_HEADWAY ? p.headway : p.coverage);
    const counting = [main[key], ...tails.map(t => t[key])].filter((p, i) => p.counts && (i === 0 ? runs : true));
    const values = counting.map(filterOf).filter((v): v is number => v != null);
    period[key].runs = runs;
    period[key].hasService = timesIn(d.main).length > 0;
    period[key].filterValue = runs && values.length > 0 ? Math.max(...values) : null;
  }
  // D3 with the D8 midpoint test: a tail runs at night only when it has departures on both sides
  // of the window's midpoint. One that only starts its day inside the window (CTA 20's downtown
  // loop at 4:47 and 4:57) or only ends it there does not run at night, and drops out.
  const v30 = directionNightVerdict(d, 30);
  const v60 = directionNightVerdict(d, 60);
  // Step 6 shadow values. Tails count when they run steadily through some daytime period.
  // Tails that run steadily through midday are all-day branches; a peak-only tail (CTA 9's Beverly
  // tail, a 313-minute midday hole) is limited and takes no part in the all-day value or Frequent.
  // The all-day value reads like phase 2's headline (computeHeadwayStats over the day's grading
  // window, 07-22 or Sunday 09-21), not the 4x dominant-gap check: one 32-minute evening gap on an
  // every-7 trunk (LA Metro 51) must not void the route's all-day value.
  const dayType = d.key.slice(d.key.lastIndexOf('::') + 2) as 'Weekday' | 'Saturday' | 'Sunday';
  const grading = DEFAULT_CRITERIA.dayTypes[dayType]?.timeWindow ?? { start: 420, end: 1320 };
  // Phase 2's overnight fallback: a main stretch with under two departures in the grading window
  // is a night route, read over all its departures. Its branches are judged overnight, where it
  // runs, so the slower branch decides as by day (TTC 300: the Bloor trunk every 8, its branches
  // every 15 and 16).
  const overnightFallback = d.main.times.filter(x => x >= grading.start && x <= grading.end).length < 2;
  const allDayTails = d.tails.filter((t, i) => (overnightFallback ? tails[i].overnight : tails[i].midday).counts);
  const allDayOf = (st: Stretch) => {
    // Phase 2's overnight fallback: with fewer than two departures in the window (a night route),
    // the stretch reads all of its departures.
    let t = st.times.filter(x => x >= grading.start && x <= grading.end);
    if (t.length < 2) t = [...st.times];
    return t.length >= 2 ? Math.round(computeHeadwayStats(t).median) : null;
  };
  const allDays = [d.main, ...allDayTails].map(allDayOf);
  // The #899 rule unchanged: a midday reading with a wait under three hours, or a wait of at most
  // ALL_DAY_MIDDAY_MAX_WAIT, means the direction runs at midday.
  const middayWait = main.midday.coverage;
  const middayHasReading = main.midday.headway != null && middayWait != null && middayWait < 3 * 60;
  const middayRuns = middayHasReading || (middayWait != null && middayWait <= ALL_DAY_MIDDAY_MAX_WAIT);
  // Limited (#720): a direction whose main stretch does not run at midday by that rule has no
  // all-day value: rush-hour-only (OC Transpo 226) or evening-only service, and a median that
  // steps over a 5-hour midday hole (CTA 108: every 20 at the peaks) is not every N all day. Read
  // from the stretch, not phase 2's per-shape class, which a feed giving each trip its own shape
  // (CapMetro 7, every 16 all day) defeats. Phase 2's overnight fallback is the one exception: a
  // night route with under two main-stretch departures in the grading window has no midday by
  // design and keeps its value (TTC 300, 336, 337).
  const limitedOnly = !overnightFallback && !middayRuns;
  const frequentStretches = [d.main, ...allDayTails];
  const researchOf = frequentStretches.map(st => computeResearchFrequentService([...st.times]));
  return {
    period, night30: v30 !== 'fail', night60: v60 !== 'fail', nightPartial30: v30 === 'partial', nightPartial60: v60 === 'partial',
    allDay: !limitedOnly && allDays.every(v => v != null) ? Math.max(...(allDays as number[])) : null,
    limitedOnly,
    middayWait,
    midday: { hasReading: middayHasReading, runs: middayRuns, wait: middayWait },
    frequent: frequentStretches.every(st => hasSustainedFrequentService([...st.times])),
    research: {
      daytime15: researchOf.every(r => r.daytime15), daytime30: researchOf.every(r => r.daytime30),
      extended15: researchOf.every(r => r.extended15), extended30: researchOf.every(r => r.extended30),
    },
  };
}

export interface RouteRollup {
  period: Record<PeriodKey, {
    value: number | null; coverage: number | null; range: [number, number] | null;
    /** Step 5a filter value: every direction's filterValue, the worst; null when any has none. */
    filterValue: number | null;
    /** At least one direction runs through the period ("All" for that period still draws the route). */
    runs: boolean;
  }>;
  night30: boolean;
  night60: boolean;
  /** The route qualifies only on the night version of some direction: drawn on the part it runs. */
  nightPartial30: boolean;
  nightPartial60: boolean;
  /** Step 6 shadow: worst direction's all-day headline; null when any direction has none. */
  /** Some direction is limited (#720): its main stretch does not run at midday (rollupDirection). */
  limited: boolean;
  allDay: number | null;
  /** Step 6 shadow: worst direction's midday wait (the #899 cap); null when any direction has no midday service. */
  middayWait: number | null;
  /** Step 6: the #899 midday cap over the route's directions (only with two or more); null: no cap. */
  middayCap: number | null;
  frequent: boolean;
  research: { daytime15: boolean; daytime30: boolean; extended15: boolean; extended30: boolean };
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
    // A direction with no departure at all in the period does not run in it and is skipped (a
    // one-way peak route: CTA 134 runs only outbound in the PM); one whose departures are only
    // stray or part-day trips leaves the route with no value (rule 3).
    const serving = known.filter(d => d.period[key].hasService);
    const filterValues = serving.map(d => d.period[key].filterValue);
    period[key] = {
      value,
      coverage: value != null && coverages.every(v => v != null) ? Math.max(...(coverages as number[])) : null,
      range: value != null && low != null && low !== value ? [Math.min(low, value), value] : null,
      filterValue: complete && serving.length > 0 && filterValues.every(v => v != null) ? Math.max(...(filterValues as number[])) : null,
      runs: known.some(d => d.period[key].runs),
    };
  }
  return {
    period,
    night30: complete && known.every(d => d.night30),
    night60: complete && known.every(d => d.night60),
    nightPartial30: complete && known.every(d => d.night30) && known.some(d => d.nightPartial30),
    nightPartial60: complete && known.every(d => d.night60) && known.some(d => d.nightPartial60),
    // A limited direction (#720) has no all-day value, so neither has its route: every direction
    // must run all day (#899), and the other direction alone never passes for it.
    limited: known.some(d => d.limitedOnly),
    allDay: complete && known.every(d => d.allDay != null) ? Math.max(...known.map(d => d.allDay!)) : null,
    middayWait: complete && known.every(d => d.middayWait != null) ? Math.max(...known.map(d => d.middayWait!)) : null,
    middayCap: (() => {
      // #899 as worstDirection.ts applies it: some directions run at midday and some do not, the
      // route fails every all-day threshold; all run, it is capped at the longest wait of those
      // with no midday reading; none run (a peak-only route), no cap.
      if (!complete || known.length < 2) return null;
      const runs = known.map(d => d.midday.runs);
      if (runs.some(Boolean) && !runs.every(Boolean)) return Infinity;
      if (!runs.every(Boolean)) return null;
      const caps = known.filter(d => !d.midday.hasReading).map(d => d.midday.wait).filter((v): v is number => v != null);
      return caps.length > 0 ? Math.max(...caps) : null;
    })(),
    frequent: complete && known.every(d => d.frequent),
    research: {
      daytime15: complete && known.every(d => d.research.daytime15), daytime30: complete && known.every(d => d.research.daytime30),
      extended15: complete && known.every(d => d.research.extended15), extended30: complete && known.every(d => d.research.extended30),
    },
  };
}

/** Shadow keys stamped by stampStretchShadow. JSON only: tiles leave them out (prepareAgencyRoutesForTiles). */
export const STRETCH_SHADOW_KEYS = [
  'stretchRouteLimited',
  'stretchPeriodHeadway',
  'stretchPeriodCoverage',
  'stretchPeriodSustained',
  'stretchPeriodSustainedMid',
  'stretchRoutePeriodHeadway',
  'stretchPeriodRange',
  'stretchNight30',
  'stretchNight60',
  'stretchNightPartial30',
  'stretchNightPartial60',
  'stretchAllDayHeadway',
  'stretchMiddayWait',
  'stretchFrequentService',
  'stretchResearchFrequentService',
  'stretchMeta',
  'stretchRole',
  'stretchIndex',
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
  /** A feature's own drawn stops, for its stretch role (5b card rows). */
  stopsOf: (feature: ShadowFeature) => readonly string[] = () => [],
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
    p.stretchNightPartial30 = route.nightPartial30;
    p.stretchNightPartial60 = route.nightPartial60;
    // Step 6 shadow: nothing reads these yet.
    p.stretchAllDayHeadway = route.allDay;
    p.stretchRouteLimited = route.limited;
    // Step 6: the all-day filter value and the #899 cap from the stretches (tiles: scalars; a
    // missing value or no midday service is the no-service sentinel, no cap is 0, so an MVT tile
    // never drops them and falls back to today's fields).
    p.routeAllDayHeadway = route.allDay ?? NO_PERIOD_SERVICE_TILE_VALUE;
    p.routeMiddayCap = route.middayCap == null ? 0 : Number.isFinite(route.middayCap) ? route.middayCap : NO_PERIOD_SERVICE_TILE_VALUE;
    p.stretchMiddayWait = route.middayWait;
    p.stretchFrequentService = slot.day === 'Weekday' ? route.frequent : false;
    p.stretchResearchFrequentService = route.research;
    p.routeFilterHeadwayByPeriod = byPeriod(k => route.period[k].filterValue);
    p.directionFilterHeadwayByPeriod = byPeriod(k => dir.period[k].filterValue);
    p.routeRunsByPeriod = byPeriod(k => route.period[k].runs);
    // Card rows (5b): which stretch this row stands for. A row whose own stops cover a whole tail
    // stands for it (the longest such tail); else one covering the whole main stretch stands for
    // the main stretch; else it is a variant (a short turn, a positioning trip, a pattern that only
    // touches a branch) and names no destination row.
    {
      const own = new Set(stopsOf(feature));
      const covers = (stops: readonly string[]) => stops.length > 0 && stops.every(stop => own.has(stop));
      const tailIdx = stretches.tails
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => covers(t.stops))
        .sort((a, b) => b.t.stops.length - a.t.stops.length)[0]?.i;
      if (tailIdx != null) { p.stretchRole = 'tail'; p.stretchIndex = tailIdx; }
      else if (stretches.main && covers(stretches.main.stops)) { p.stretchRole = 'main'; p.stretchIndex = 0; }
      else { p.stretchRole = 'variant'; delete p.stretchIndex; }
    }
    p.stretchMeta = {
      main: stretches.main ? { stops: stretches.main.stops.length, refStop: stretches.main.refStop, trips: stretches.main.tripCount } : null,
      tails: stretches.tails.map(t => ({ refStop: t.refStop, stops: t.stops.length, km: Math.round(t.lengthKm * 100) / 100, trips: t.tripCount })),
    };
  }
  // The filter fields sit on every feature of a route-day or on none (no mixing with today's pools).
  const complete = new Map<string, boolean>();
  for (const feature of features) {
    const slot = slotOf(feature);
    if (!slot) continue;
    const routeKey = `${slot.group}::${slot.day}`;
    complete.set(routeKey, (complete.get(routeKey) ?? true) && feature.properties.routeFilterHeadwayByPeriod !== undefined);
  }
  for (const feature of features) {
    const slot = slotOf(feature);
    if (slot && complete.get(`${slot.group}::${slot.day}`)) continue;
    delete feature.properties.routeFilterHeadwayByPeriod;
    delete feature.properties.routeRunsByPeriod;
    delete feature.properties.directionFilterHeadwayByPeriod;
    delete feature.properties.routeAllDayHeadway;
    delete feature.properties.routeMiddayCap;
  }
}
