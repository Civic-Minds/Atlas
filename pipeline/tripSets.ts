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
import { PERIOD_KEYS, PERIOD_MINUTES, type PeriodKey } from '../shared/config.js';
import { PERIOD_COVERAGE_MAX_HEADWAY } from '../shared/periodEligibility.js';
import { DEFAULT_CRITERIA } from './defaults.js';
import { ALL_DAY_MIN_COVERAGE, BURST_MAX_SPAN_MINUTES, MIN_PEAK_BLOCK_DEPARTURES, MIN_SCHEDULE_DEPARTURES, computeHeadwayStats } from './transit-phase2.js';
import { ALL_DAY_MIDDAY_MAX_WAIT } from '../shared/worstDirection.js';
import { NO_PERIOD_SERVICE_TILE_VALUE } from '../shared/pmtilesProps.js';
import {
  computePeriodCoverageHeadways,
  computePeriodMaxGaps,
  computePeriodHeadways,
  BOUNDARY_DOMINANT_RATIO,
  computePeriodSustained,
  computeResearchFrequentService,
  forCrossMidnightWindow,
  hasSustainedFrequentService,
  isSparseOvernightWindow,
  isSustainedHeadway,
  isUnevenPeriod,
  medianHeadwayInWindow,
  hasSustainedServiceInWindow,
  headlineDeparturesInWindow,
  nightServiceDepartureTimes,
} from './headway-utils.js';
import { SHARED_STRETCH_MIN_KM, SHARED_STRETCH_MIN_STOPS } from './sharedStretch.js';
import { SAME_TERMINAL_METERS } from './featureDedupe.js';
import { boardingMainStretchWait, riderWait } from './routeGrading.js';

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
   * #899's midday input as main's rule reads it: the direction's longest midday wait at its
   * best-served stop over every trip, and whether that stop has a typical midday gap. Set by the
   * caller; without it the main stretch's own midday is read.
   */
  midday899?: { wait: number | null; hasReading: boolean };
  /**
   * The same direction built from only the trips that run in the 2-5am window (nightOnlyTrips):
   * the night version of the route, judged when the daytime main stretch has no night service
   * (Ryan, 2026-10-15: night service on part of the route counts, on the part it runs).
   */
  night?: DirectionStretches;
  /**
   * CIV-321 S1: departures at any stop of the direction, every trip that serves it (the same read
   * a stretch's reference stop gets). Not serialized.
   */
  timesAtStop?: (stop: string) => { times: readonly number[]; nightTimes: readonly number[]; tripCount: number };
  /**
   * CIV-321: along a drawn stop order, each stop's times over every trip that runs THROUGH it (Ryan,
   * 2026-10-18: the line is the track, coloured by the trains running along it, including those that
   * skip a stop). A trip that skips a stop between two it serves passes it at a time interpolated between them.
   */
  throughTimesAlong?: (stops: readonly string[]) => Array<{ times: readonly number[]; nightTimes: readonly number[]; tripCount: number }>;
  /**
   * #1072: for tail `i`, departures at the main stretch's reference stop of the trips that serve the
   * tail (`on`) and of the sibling trips (`off`: they serve none of the tail's stops but leave the
   * main stretch elsewhere), both on regular patterns only. Read by the handover test in
   * rollupDirection. Not serialized.
   */
  tailHandoverTimes?: (tailIndex: number) => { on: readonly number[]; off: readonly number[] };
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

/** The trips' distinct counted departures at `stop`, earliest first. */
function departuresAt(trips: readonly DirectionTrip[], stop: string): number[] {
  return [...new Set(trips
    .map(trip => trip.visits.find(v => v.stopId === stop))
    .filter((v): v is NonNullable<typeof v> => v != null && v.counted !== false)
    .map(v => v.minutes))].sort((x, y) => x - y);
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
  // MIN_SCHEDULE_DEPARTURES trips, or all of them within BURST_MAX_SPAN_MINUTES, is one-off or a
  // burst and never a branch; a pattern running only in one rush-hour period needs
  // MIN_PEAK_BLOCK_DEPARTURES there (TransLink 044's Dundarave Express: 15:06, 16:03, 17:07). Three
  // trips spread over the day are a schedule (GO 88C, Saturday 10:00-14:30).
  const peakWindows = PERIOD_WINDOWS.filter(w => w.key === 'amPeak' || w.key === 'pmPeak');
  const eligible = all.filter(p => {
    if (p.trips.length < MIN_SCHEDULE_DEPARTURES) return false;
    const starts = p.trips.map(t => t.visits[0].minutes);
    if (Math.max(...starts) - Math.min(...starts) <= BURST_MAX_SPAN_MINUTES) return false;
    const onePeak = peakWindows.some(w => starts.every(t => t >= w.start && t < w.end));
    return !onePeak || p.trips.length >= MIN_PEAK_BLOCK_DEPARTURES;
  });
  // Two stops are one terminal when they are the same stop or within SAME_TERMINAL_METERS.
  const sameTerminal = (a: string, b: string) => {
    if (a === b) return true;
    const p = stopCoord(a), q = stopCoord(b);
    return p != null && q != null && km(p, q) * 1000 <= SAME_TERMINAL_METERS;
  };
  const steadyIn = (periods: readonly PeriodKey[]) => eligible.filter(p => runsSteadily(p.trips, p.stops[Math.floor(p.stops.length / 2)], periods));
  let regular = steadyIn(DAYTIME_PERIODS);
  if (regular.length === 0) regular = steadyIn(ALL_PERIODS);
  // CIV-786: a pattern that takes the same trip in turn with a regular sibling is regular too. HSR 16 on
  // weekends runs via Wilson every 30 from 7:19 to 11:49, then via Fiddler's Green every 30 from 12:19:
  // the morning pattern starts inside the AM peak and stops before midday ends, so it runs steadily
  // through no period of its own, and the main stretch became all of Fiddler's Green, whose middle
  // stop has no trips before noon (no midday value). Promoted only with #1072's handover evidence, at
  // the stops the two share: same two terminals (the same trip by another road), every trip of one
  // before every trip of the other, the 3 departures a value needs on each side, and the two
  // spacings and the gap at the handover passing the settled steadiness test against each other.
  if (regular.length > 0) {
    const sameEnds = (a: readonly string[], b: readonly string[]) => sameTerminal(a[0], b[0]) && sameTerminal(a[a.length - 1], b[b.length - 1]);
    // Daytime service shapes the stretches (as steadyIn above): a pattern that takes over only at night
    // (OC Transpo 39's after-midnight Place d'Orléans routing, 00:09-02:09) stays a variant by day.
    const daytimeWindows = PERIOD_WINDOWS.filter(w => DAYTIME_PERIODS.includes(w.key));
    const runsByDay = (p: (typeof all)[number]) =>
      p.trips.filter(t => daytimeWindows.some(w => t.visits[0].minutes >= w.start && t.visits[0].minutes < w.end)).length >= MIN_SCHEDULE_DEPARTURES;
    const takesTurnsWith = (p: (typeof all)[number], q: (typeof all)[number]): boolean => {
      if (p.stops.length < 2 || q.stops.length < 2 || !runsByDay(p) || !sameEnds(p.stops, q.stops)) return false;
      const pStops = new Set(p.stops);
      const shared = q.stops.filter(stop => pStops.has(stop));
      if (shared.length === 0) return false;
      const ref = shared[Math.floor(shared.length / 2)];
      const a = departuresAt(p.trips, ref), b = departuresAt(q.trips, ref);
      if (a.length < MIN_SCHEDULE_DEPARTURES || b.length < MIN_SCHEDULE_DEPARTURES) return false;
      const [first, second] = a[a.length - 1] < b[0] ? [a, b] : b[b.length - 1] < a[0] ? [b, a] : [null, null];
      if (!first || !second) return false;
      const everyA = medianHeadwayInWindow(a, a[0], a[a.length - 1], MIN_SCHEDULE_DEPARTURES, true);
      const everyB = medianHeadwayInWindow(b, b[0], b[b.length - 1], MIN_SCHEDULE_DEPARTURES, true);
      if (everyA == null || everyB == null || everyA <= 0 || everyB <= 0) return false;
      const near = (x: number, y: number) => isSustainedHeadway([x], y) && isSustainedHeadway([y], x);
      const gap = second[0] - first[first.length - 1];
      return near(everyA, everyB) && near(gap, everyA) && near(gap, everyB);
    };
    const regularNow = new Set(regular);
    const turnTakers = eligible.filter(p => !regularNow.has(p) && regular.some(q => takesTurnsWith(p, q)));
    if (turnTakers.length > 0) regular = [...regular, ...turnTakers];
  }
  // #1256: the busiest pattern can fail the steady test only because another pattern takes alternate trips.
  // Pace 542 on weekdays runs every 30, but a 6-trip pattern from another stop takes the 7:14, 7:50, 8:25,
  // 14:02, 15:03 and 17:29 slots, so the 22-trip pattern has an hour's hole in every period and only the
  // 6-trip pattern was regular: the main stretch was its 14 stops, 10 of them served by 6 trips. MATA 30's
  // two routings each run every 4 hours, alternating. Pooled where they meet, they are one steady service,
  // so both are regular and the main stretch is the stops they share. Only when the busiest pattern is not
  // regular itself, the two end (or start) at the same terminal, the other's trips fall between the
  // busiest's first and last at their shared middle stop, and together they run steadily through a daytime
  // period that neither does alone: a branch steady on its own, or a peak-only branch beside a steady
  // all-day pattern (Pace 808), is not pooled.
  const busiestEligible = eligible.length > 0 ? eligible.reduce((x, y) => (y.trips.length > x.trips.length ? y : x)) : null;
  if (busiestEligible && !regular.includes(busiestEligible)) {
    const top = busiestEligible;
    const alternatesWithTop = (q: (typeof all)[number]): boolean => {
      if (q === top) return false;
      const qStops = new Set(q.stops);
      const shared = top.stops.filter(stop => qStops.has(stop));
      if (shared.length < 2) return false;
      const meet = sameTerminal(top.stops[top.stops.length - 1], q.stops[q.stops.length - 1]) || sameTerminal(top.stops[0], q.stops[0]);
      if (!meet) return false;
      const ref = shared[Math.floor(shared.length / 2)];
      const a = departuresAt(top.trips, ref), b = departuresAt(q.trips, ref);
      if (a.length < MIN_SCHEDULE_DEPARTURES || !b.some(t => t > a[0] && t < a[a.length - 1])) return false;
      const alone = periodSustainedMid(a), other = periodSustainedMid(b);
      const together = periodSustainedMid([...new Set([...a, ...b])].sort((x, y) => x - y));
      return DAYTIME_PERIODS.some(k => together[k] === true && alone[k] !== true && other[k] !== true);
    };
    const partners = eligible.filter(alternatesWithTop);
    if (partners.length > 0) regular = [...new Set([...regular, top, ...partners])];
  }
  // A short turn: a regular pattern whose stops all lie on a longer regular pattern shapes the
  // main stretch only when it carries a real share of the direction's trips (the spec's 20%).
  // Below it, it is a variant whose trips count where they serve: CTA 93's 7-trip Logan Square -
  // Foster turn (18%) shrank the main stretch to its own stops and its evening trips read as
  // evening service on the route, and SEPTA 66's 5-trip Cottman turn cut the trunk to 17 stops.
  // TTC 94's Wellesley pattern (half the trips) still shapes it, so the Harbord tail stays.
  // "On" a longer pattern: off it, the short turn has no run that would pass the tail test (a
  // turning loop of a stop or two at its end is not a branch: CTA 152's 8-trip Harlem turn).
  const regularSets = new Map(regular.map(p => [p, new Set(p.stops)]));
  const liesOn = (p: (typeof regular)[number], other: (typeof regular)[number]) => {
    const on = regularSets.get(other)!;
    let run: string[] = [];
    const runs: string[][] = [];
    for (const stop of [...p.stops, null]) {
      if (stop != null && !on.has(stop)) { run.push(stop); continue; }
      if (run.length > 0) runs.push(run);
      run = [];
    }
    return runs.every(r => r.length < SHARED_STRETCH_MIN_STOPS || (runKm(r, stopCoord) ?? 0) < SHARED_STRETCH_MIN_KM);
  };
  const minorShortTurn = (p: (typeof regular)[number]) => p.trips.length < SHORT_TURN_MIN_SHARE * withVisits.length
    && regular.some(other => other !== p && other.stops.length > p.stops.length && liesOn(p, other));
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

  const timesAtStopCache = new Map<string, ReturnType<typeof timesAt>>();
  const timesAtStop = (stop: string) => {
    let hit = timesAtStopCache.get(stop);
    if (!hit) { hit = timesAt(stop); timesAtStopCache.set(stop, hit); }
    return hit;
  };
  const throughTimesAlong = (stops: readonly string[]) => {
    const index = new Map(stops.map((stop, i) => [stop, i] as const));
    const times = stops.map(() => new Set<number>());
    const overnight = stops.map(() => [] as number[]);
    const counts = stops.map(() => 0);
    for (const trip of measureTrips) {
      const at = new Map<number, TripVisit>();
      for (const visit of trip.visits) {
        const i = index.get(visit.stopId);
        if (i == null || visit.counted === false || at.has(i)) continue;
        at.set(i, visit);
      }
      if (at.size === 0) continue;
      const served = [...at.keys()].sort((a, b) => a - b);
      for (let s = 0; s < served.length; s++) {
        const from = served[s], to = served[s + 1] ?? served[s];
        const a = at.get(from)!, b = at.get(to)!;
        // The served stop itself, then the stops it skips before its next one, at times interpolated
        // between the two by stop position.
        for (let i = from; i < (to === from ? from + 1 : to); i++) {
          const minutes = i === from ? a.minutes : Math.round(a.minutes + ((b.minutes - a.minutes) * (i - from)) / (to - from));
          counts[i]++;
          times[i].add(minutes);
          if (a.overnightOnly) overnight[i].push(minutes + 1440);
        }
      }
    }
    return stops.map((_, i) => {
      const sorted = [...times[i]].sort((a, b) => a - b);
      return { times: sorted, nightTimes: nightServiceDepartureTimes(sorted, overnight[i]), tripCount: counts[i] };
    });
  };
  const regularIds = new Set(regular.map(p => p.stops.join('>')));
  const tailHandoverTimes = (tailIndex: number) => {
    const tail = tails[tailIndex];
    const on = new Set<number>();
    const off = new Set<number>();
    if (!main || !tail) return { on: [], off: [] };
    const tailStops = new Set(tail.stops);
    // Siblings take the same trip between the same two terminals by another road (HSR 16: Meadowlands
    // to Garner at Wilson, via Wilson or via Fiddler's Green), on a regular pattern. A peak extension
    // or an evening cut-back to another terminal (CTA 28 to Union Station, TransLink 9 late to
    // Granville), and a few variant trips (AC Transit 22's late Grand Lake runs), leave the cut
    // stretch without service and are not a handover.
    const onPatterns = regular.filter(p => p.stops.some(stop => tailStops.has(stop)));
    const siblingOf = (stops: readonly string[]) => onPatterns.some(p =>
      sameTerminal(p.stops[0], stops[0]) && sameTerminal(p.stops[p.stops.length - 1], stops[stops.length - 1]));
    for (const trip of measureTrips) {
      const stops = trip.visits.map(v => v.stopId);
      if (!regularIds.has(stops.join('>'))) continue;
      const atRef = trip.visits.find(v => v.stopId === main.refStop);
      if (!atRef || atRef.counted === false) continue;
      if (stops.some(stop => tailStops.has(stop))) on.add(atRef.minutes);
      else if (stops.some(stop => !common.has(stop)) && siblingOf(stops)) off.add(atRef.minutes);
    }
    return { on: [...on].sort((a, b) => a - b), off: [...off].sort((a, b) => a - b) };
  };
  return { key, main, tails, regularPatternCount: regular.length, variantTripCount, disconnected: disconnected || undefined, timesAtStop, throughTimesAlong, tailHandoverTimes };
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
  /** The value is one gap between departures, not a repeated cadence (see isOneGapPeriod). */
  oneGap: boolean;
  /** Steady by the settled check but uneven (#1142, isUnevenPeriod): the value is the longest wait. */
  uneven: boolean;
}

const PERIOD_WINDOWS = PERIOD_KEYS.map(key => ({ key, ...PERIOD_MINUTES[key] }));

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

/**
 * An unsteady period's value (its longest wait) is one gap between departures when no other gap
 * around it repeats it (TTC 10 weekday midday to Victoria Park: 09:07, 14:22, 14:52 shows 315; TTC
 * 166 to Milvan 302). The gaps are those between the period's departures and the departure on each
 * side of it; a gap repeats the value when the settled steadiness test calls neither one a real gap
 * over the other. A slow cadence repeats (MBTA 18 AM to Ashmont: 07:04, 08:28, then 09:52, every
 * 84; Halifax 401 PM every 99) and keeps its number, and so does regular service with one gap
 * inside it. A value that is only a late start or early end, matching no gap, is not one gap.
 */
export function isOneGapPeriod(times: readonly number[], start: number, end: number, value: number | null, sustained: boolean | undefined): boolean {
  // Steady periods show their cadence; unsteady ones, and those too thin to judge (two departures), show the wait.
  if (value == null || sustained === true) return false;
  const all = [...new Set(forCrossMidnightWindow([...times], end))].sort((a, b) => a - b);
  const inWindow = all.filter(t => t >= start && t <= end);
  if (inWindow.length === 0) return false;
  const before = all.filter(t => t < start);
  const after = all.filter(t => t > end);
  const seq = [...before.slice(-1), ...inWindow, ...after.slice(0, 1)];
  const gaps = seq.slice(1).map((t, i) => t - seq[i]);
  const near = (g: number) => isSustainedHeadway([value], g) && isSustainedHeadway([g], value);
  if (gaps.filter(near).length !== 1) return false;
  // Regular service around the gap keeps its cadence (TransLink 147 Saturday AM: 06:26, then every
  // 30 from 07:26): the gap stands alone only when the rest of the period has fewer than the three
  // departures a period value needs.
  const otherInWindow = inWindow.slice(1).map((t, i) => t - inWindow[i]).filter(g => !near(g));
  return otherInWindow.length < 2;
}

/** A stretch period's filter value: the headway when steady with every gap within the coverage cap, else the full-window wait. */
/** The longest gap between consecutive departures inside [start, end), or null with under two. */
function longestInnerGap(times: readonly number[], start: number, end: number): number | null {
  const t = [...new Set(forCrossMidnightWindow([...times], end))].filter(x => x >= start && x < end).sort((a, b) => a - b);
  if (t.length < 2) return null;
  return Math.max(...t.slice(1).map((x, i) => x - t[i]));
}

/**
 * CIV-1064: an uneven main stretch's longest wait. It counts every gap between its departures in
 * [start, end). It also counts the wait from the window's start to its first departure, or from its
 * last departure to the window's end, but only where the stretch has a departure on the other side
 * of that boundary. Then the wait is a real gap that the window cuts. Where it has none, the edge is
 * the start or end of its service, which is not a gap between buses. Like the settled edge rules
 * (#568), a window boundary is never an edge, and the first and last gaps between buses always count.
 * TTC 320 weekday overnight is the case: night service only, its last northbound bus at Eglinton is
 * 5:32, and its gaps are 5-15, but it read 28, the run from 5:32 to 6:00. A true start or end longer
 * than PERIOD_COVERAGE_MAX_HEADWAY keeps the full-window wait, as a steady period's does
 * (stretchFilterValue).
 */
function unevenMainWait(times: readonly number[], start: number, end: number, coverage: number | null): number | null {
  if (coverage == null || coverage > PERIOD_COVERAGE_MAX_HEADWAY) return coverage;
  const all = [...new Set(forCrossMidnightWindow([...times], end))].sort((a, b) => a - b);
  const t = all.filter(x => x >= start && x < end);
  if (t.length === 0) return coverage;
  let worst = 0;
  for (let i = 1; i < t.length; i++) worst = Math.max(worst, t[i] - t[i - 1]);
  if (all[0] < start) worst = Math.max(worst, t[0] - start);
  if (all[all.length - 1] >= end) worst = Math.max(worst, end - t[t.length - 1]);
  return Math.ceil(worst);
}

export function stretchFilterValue(p: StretchPeriod): number | null {
  // An uneven period reads its value: its longest wait (for a tail, between its own departures; for
  // a main stretch, leaving out a true start or end of service, unevenMainWait).
  if (p.uneven) return p.value;
  return p.sustained === true && !p.uneven && p.coverage != null && p.coverage <= PERIOD_COVERAGE_MAX_HEADWAY ? p.headway : p.coverage;
}

/**
 * CIV-321 S3: run-length encoding of one period's stop values, to keep agency JSON small: runs of
 * equal values as "v*n" (a single stop is just "v"), comma-separated; an empty v is no value.
 * "30*4,,60*2" is 30, 30, 30, 30, none, 60, 60. Decoded by shared/stopRuns decodeStopRuns.
 */
export function encodeStopRuns(values: ReadonlyArray<number | null>): string {
  const runs: string[] = [];
  for (let i = 0; i < values.length;) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[i]) j++;
    const v = values[i] == null ? '' : String(values[i]);
    runs.push(j > i ? `${v}*${j - i + 1}` : v);
    i = j + 1;
  }
  return runs.join(',');
}

/**
 * CIV-321: the section colour value at each drawn stop, per period: every trip of the direction that
 * runs through the stop, including those that skip it (throughTimesAlong; the stop's own stopping
 * frequency stays on the stop card), read with the same rules as a whole route (stretchPeriods,
 * stretchFilterValue). One run-length-encoded string per period aligned to the feature's stopOrder
 * (encodeStopRuns), empty where no trip passes. Where every trip stops, it equals the stretch value at
 * that stretch's reference stop. Read by the section colours (S3, beta only).
 *
 * #1094: Overnight reads each stop through the night verdict (directionNightValue over the stop alone), the
 * function the line's own Overnight value reads (#1267), so a stop never turns grey on a line that passes
 * Overnight by the same rule. A stop the verdict does not pass at 60 keeps its full-window wait, never
 * a better one.
 */
export function stopPeriodValues(stops: readonly string[], throughTimesAlong: NonNullable<DirectionStretches['throughTimesAlong']>): Record<PeriodKey, string> {
  const reads = throughTimesAlong(stops);
  const perStop = stops.map((stop, i) => {
    const read = reads[i];
    if (read.times.length === 0) return null;
    const stretch: Stretch = { kind: 'main', stops: [stop], refStop: stop, lengthKm: 0, ...read };
    const night = directionNightValue({ key: stop, main: stretch, tails: [], regularPatternCount: 1, variantTripCount: 0 }, true);
    return { periods: stretchPeriods(stretch), night };
  });
  const value = (p: (typeof perStop)[number], key: PeriodKey) => {
    if (!p) return null;
    return key === 'overnight' && p.night != null ? p.night : stretchFilterValue(p.periods[key]);
  };
  return Object.fromEntries(PERIOD_WINDOWS.map(({ key }) => [key, encodeStopRuns(perStop.map(p => value(p, key)))])) as Record<PeriodKey, string>;
}

/**
 * CIV-321 S2: a stretch's own value per period for its card row once one drawn feature covers several
 * stretches (S4), read at its reference stop by the same rules as a whole route (Ryan, 2026-10-18: a
 * section needs the usual three departures for a value, then the same filter and limited-service
 * handling; no thresholds of its own).
 */
export function stretchMetaPeriods(s: Stretch): { period: Record<PeriodKey, number | null>; noRegular: PeriodKey[]; maxGap: Record<PeriodKey, number | null>; edge?: Partial<Record<PeriodKey, StretchPeriodEdge>> } {
  const own = stretchPeriods(s);
  // CIV-1069: the longest gap between the same departures the value reads, so a card row never pairs
  // the stretch's value with a gap measured over one headsign's trips.
  const gaps = computePeriodMaxGaps([...s.times]);
  // The card's guard (#955): a period whose value is one gap, or that has under three departures (no
  // cadence to read, only the full-window wait), reads "Irregular" on a row; the map keeps
  // the filter value.
  const departures = (start: number, end: number) => new Set(forCrossMidnightWindow([...s.times], end).filter(t => t >= start && t <= end)).size;
  // CIV-1251 (Ryan): the stretch's own late start or early end, read as the direction's edge is
  // (#934, CIV-1248), so a branch row can say when its own service starts or stops (TTC 110 Sunday
  // AM: the shared stretch every 15 from 8:07, each branch every 30 from its own first trip).
  // Overnight reads the night verdict (#1267) and has none; an uneven period reads its range.
  const edges: Partial<Record<PeriodKey, StretchPeriodEdge>> = {};
  for (const { key, start, end } of PERIOD_WINDOWS) {
    if (key === 'overnight' || own[key].uneven) continue;
    const edge = runsThroughPeriod(s.times, start, end, own[key].sustained)
      ? periodEdge(s.times, start, end, stretchFilterValue(own[key]))
      : periodPartialEdge(s.times, start, end);
    if (edge) edges[key] = edge;
  }
  return {
    period: Object.fromEntries(PERIOD_WINDOWS.map(({ key }) => [key, stretchFilterValue(own[key])])) as Record<PeriodKey, number | null>,
    noRegular: PERIOD_WINDOWS.filter(({ key, start, end }) => own[key].coverage != null && (own[key].oneGap || departures(start, end) < 3)).map(w => w.key),
    maxGap: Object.fromEntries(PERIOD_WINDOWS.map(({ key }) => [key, own[key].value == null ? null : gaps[key] ?? null])) as Record<PeriodKey, number | null>,
    ...(Object.keys(edges).length > 0 ? { edge: edges } : {}),
  };
}

/**
 * Whether a stretch's departures run through a period: some on both sides of its midpoint, and, when the period is not
 * steady, no internal gap more than BOUNDARY_DOMINANT_RATIO times its typical gap. The settled period checks (#567-#571,
 * PR #584) decide this: such a hole means the departures are a straggler and the first trips of the next service, not
 * service through the period (TTC 900 overnight: 26:11-26:41, then nothing until 29:19). A late start or an early end is
 * the edge rules' business (CTA 134 PM runs every 9 from 16:14); only a hole between two runs of service counts here.
 */
export function runsThroughPeriod(times: readonly number[], start: number, end: number, sustained: boolean | null | undefined): boolean {
  const mid = (start + end) / 2;
  const inWindow = [...new Set(forCrossMidnightWindow([...times], end))].filter(t => t >= start && t <= end);
  if (!(inWindow.some(x => x < mid) && inWindow.some(x => x >= mid))) return false;
  if (sustained !== false) return true;
  const median = medianHeadwayInWindow(forCrossMidnightWindow([...times], end), start, end, 3);
  if (median == null || median <= 0) return true;
  const t = inWindow.sort((a, b) => a - b);
  let longest = 0;
  for (let i = 1; i < t.length; i++) longest = Math.max(longest, t[i] - t[i - 1]);
  return !(longest / median > BOUNDARY_DOMINANT_RATIO);
}

/**
 * CIV-1204 (Ryan, 2026-10-31): the rider wait (CIV-1161) stands for the headline only where the direction runs through
 * the window it read, by the settled verdicts, at every boarding stop that has a reading: at midday, runsThroughPeriod
 * there and the #899 midday test (rule 7); at the PM peak, runsThroughPeriod there; on the all-day fallback, a direction
 * that is not limited (#720) at a stop whose departures span the all-day share of the grading window (#720's coverage). A peak route's few trips reaching into midday (TTC 945: 9:28, then 14:40) are not a
 * 312-minute wait. Null when no boarding stop has a reading.
 */
export function gatedRiderWait(
  stops: readonly string[],
  timesAt: (stopId: string) => readonly number[],
  dropOffOnly: ReadonlySet<string>,
  direction: { middayRuns: boolean; limited: boolean; gradingWindow: { start: number; end: number } },
): { wait: number; stops: number; allDayStops: number; passes: boolean } | null {
  const board = boardingMainStretchWait(stops, timesAt, dropOffOnly);
  if (!board) return null;
  const passes = stops.filter(stop => !dropOffOnly.has(stop)).every(stop => {
    const times = timesAt(stop);
    const reading = riderWait(times);
    if (!reading) return true;
    if (reading.window === 'allDay') {
      // #720's all-day coverage test, as a branch takes part in the all-day value (spansWindow in rollupDirection): the
      // stop's departures span at least ALL_DAY_MIN_COVERAGE of the day's grading window. #1257 (Ryan, 2026-10-31): and
      // at least HEADLINE_MIN_DEPARTURES of them fall inside it, the minimum midday and the PM peak read (NJT 194 Sunday:
      // 10:36 and 18:34 inside 9-21 read 478).
      const { start, end } = direction.gradingWindow;
      const t = headlineDeparturesInWindow(times, start, end);
      return !direction.limited && t != null && (t[t.length - 1] - t[0]) / (end - start) >= ALL_DAY_MIN_COVERAGE;
    }
    const { start, end } = PERIOD_MINUTES[reading.window];
    const runs = runsThroughPeriod(times, start, end, computePeriodSustained([...times])[reading.window]);
    return reading.window === 'midday' ? runs && direction.middayRuns : runs;
  });
  return { ...board, passes };
}

/**
 * #1115 (Ryan, 2026-10-26): the periods a tail does not run through, by the same rule as the main stretch, read over every
 * trip at the tail's reference stop. The card leaves that branch's row off for the period (TTC 84 to Pioneer Village:
 * peak-only, nothing from 9:35 to 15:12, read "every 21" at midday).
 */
export function tailNotThrough(s: Stretch): { notThrough: PeriodKey[] } {
  const own = stretchPeriods(s);
  return { notThrough: PERIOD_WINDOWS.filter(({ key, start, end }) => !runsThroughPeriod(s.times, start, end, own[key].sustained)).map(w => w.key) };
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
    const uneven = runs && steady && isUnevenPeriod(times, start, end, headways[key]);
    // An uneven tail reads its longest wait between its own departures in the period, not the lead-in
    // before its first or the run after its last: the 6's Pelham Bay tail starts its evening at 19:41,
    // when the <6> express (another route) serves it, and read 41 though its gaps are 5-18. An uneven
    // main stretch leaves out only a true start or end of its service (CIV-1064, unevenMainWait).
    const value = !runs ? null
      : steady && !uneven ? (headways[key] ?? null)
      : uneven && s.kind === 'tail' ? longestInnerGap(times, start, end) ?? coverage[key] ?? null
      : uneven ? unevenMainWait(times, start, end, coverage[key] ?? null)
      : coverage[key] ?? null;
    out[key] = {
      // A tail speaks for the direction only where it runs steadily through the period.
      counts: runs && (s.kind === 'main' || (steady && sustainedWithMidpoint([...new Set(forCrossMidnightWindow(times, end))].sort((a, b) => a - b), sustained[key], start, end) === true)),
      value,
      headway: headways[key] ?? null,
      coverage: coverage[key] ?? null,
      sustained: sustained[key] ?? null,
      sustainedMid: sustainedWithMidpoint([...new Set(forCrossMidnightWindow([...times], end))].sort((a, b) => a - b), sustained[key], start, end),
      oneGap: runs && isOneGapPeriod(times, start, end, value, sustained[key]),
      uneven,
    };
  }
  return out;
}

/**
 * CIV-1198 (Ryan, 2026-10-30): the longest wait a stretch that runs at night may have before its first
 * 2:00-5:00 departure and after its last. Night networks start when day service and the subway stop,
 * and that hand-over falls inside the window (TTC 304 King from 2:32, while the 504 runs to about 3:10).
 */
export const NIGHT_EDGE_MAX_WAIT_MIN = 60;

/**
 * Night (D7: 26:00-29:00), every gap between departures at most maxGap. A stretch that runs at night
 * (D3: departures on both sides of 3:30) may wait up to NIGHT_EDGE_MAX_WAIT_MIN before its first
 * departure and after its last (CIV-1198: TTC 300's Danforth Rd branch runs every 15 from its first
 * bus at 2:39). Any other stretch keeps both edges at maxGap, so day service starting at 4:30 never
 * passes. null: no departure in the window.
 */
export function stretchNight(s: Stretch, maxGap: number): boolean | null {
  if (!s.nightTimes.some(t => t >= STRETCH_NIGHT_START_MIN && t <= STRETCH_NIGHT_END_MIN)) return null;
  if (!runsAcrossNightMidpoint(s.nightTimes)) return hasSustainedServiceInWindow([...s.nightTimes], STRETCH_NIGHT_START_MIN, STRETCH_NIGHT_END_MIN, maxGap);
  const times = [...new Set(s.nightTimes)].filter(t => t >= STRETCH_NIGHT_START_MIN && t <= STRETCH_NIGHT_END_MIN).sort((a, b) => a - b);
  const edge = Math.max(maxGap, NIGHT_EDGE_MAX_WAIT_MIN);
  if (times[0] - STRETCH_NIGHT_START_MIN > edge || STRETCH_NIGHT_END_MIN - times[times.length - 1] > edge) return false;
  return times.every((t, i) => i === 0 || t - times[i - 1] <= maxGap);
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
function fullNightVerdict(d: DirectionStretches, gap: number): boolean {
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
export function directionNightVerdict(d: DirectionStretches, gap: number): NightVerdict {
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
 * #1267 (Ryan, 2026-10-31): the Overnight period reads the night verdict, so its value and Night
 * Service never disagree. A direction's night value is the smallest gap at which its verdict passes
 * (pass or partial), up to the window's length: at most 30 exactly when it is Night Service 30, at
 * most 60 exactly when it is Night Service 60. TTC 301 reads 30, not the 71 a 2-6am window gave it
 * across the 5-6am lull before day service. null: nothing in the direction runs at night (D3: no
 * stretch with departures on both sides of 3:30), as for day service that starts at 4:48 (TTC 102),
 * or no gap of 60 or less passes: Night Service's longest grade, so a wait like TTC 504's 172 minutes
 * is not overnight service (#1267, pending Ryan's OK). `wholeDirection`: only a full pass counts, not one on the night version alone
 * (the direction's card row, which stands for the whole direction: NYC subway 3 to New Lots Av
 * runs every 20 at night on its night path, but 220 minutes apart at the row's own stops).
 */
/** #1267: the longest Overnight value; a direction that passes only above it has none (Night Service's 60 grade). */
export const NIGHT_OVERNIGHT_MAX_VALUE = 60;

export function directionNightValue(d: DirectionStretches, wholeDirection = false): number | null {
  const stretches = [d.main, ...d.tails, ...(wholeDirection ? [] : [d.night?.main, ...(d.night?.tails ?? [])])];
  if (!stretches.some(st => st != null && runsAcrossNightMidpoint(st.nightTimes))) return null;
  const max = NIGHT_OVERNIGHT_MAX_VALUE;
  const passes = (gap: number) => (wholeDirection ? directionNightVerdict(d, gap) === 'pass' : directionNightVerdict(d, gap) !== 'fail');
  if (!passes(max)) return null;
  // The verdict only gets easier as the gap grows (the edge allowance stays 60 up to here).
  let lo = 1, hi = max;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (passes(mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
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
    /** The main stretch's best reading for the range's low end: its typical gap when uneven (#1142), else mainValue. */
    mainLow: number | null;
    /** The direction value comes from a counting stretch whose value is one gap (isOneGapPeriod). */
    oneGap: boolean;
    /**
     * Step 5a filter value: the worst counting stretch, each read as the tile rule reads a row
     * (steady with a full-window wait of PERIOD_COVERAGE_MAX_HEADWAY or less: its headway; else its
     * wait). null: the main stretch runs only stray or part-day trips in the period (no departure on
     * one side of its midpoint), so the direction has no regular cadence there.
     */
    filterValue: number | null;
    /** The main stretch runs through the period (departures on both sides of its midpoint). */
    runs: boolean;
    /** The main stretch has any departure in the period. A direction with none is skipped by the route (a one-way peak route). */
    hasService: boolean;
    /** #934: the main stretch's late start or early end around steady service (card wording only). */
    edge: StretchPeriodEdge | null;
    /** Narrow D6: the main stretch runs through the period, steady but for one gap inside it (card wording only). */
    gap: StretchPeriodGap | null;
    /**
     * #1142: the typical gap when the filter value comes from an uneven stretch (its longest wait),
     * so the card can read "every typical-worst". null otherwise.
     */
    typical: number | null;
  }>;
  night30: boolean;
  night60: boolean;
  /** #1267: the Overnight value, directionNightValue. */
  nightValue: number | null;
  /** #1267: the direction's own Overnight value (card rows): a full pass only, not on the night version alone. */
  nightDirectionValue: number | null;
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

/**
 * #934: a period whose value is a late start or an early end around steady service (SF Muni 8BX
 * AM: every 8-11 from 7:17, so a 77-minute wait). `from` is the first departure when the start gap
 * sets the value, `until` the last when the end gap does, `every` the median gap between them.
 */
export interface StretchPeriodEdge {
  from?: number;
  until?: number;
  every: number;
  /** #1276: the stretch the edge is read on: 'main', or a tail's index (a row's stretchIndex when its stretchRole is 'tail'). */
  stretch?: 'main' | number;
}

/**
 * The edge reading of one period at a stretch's reference stop, or null. Only when `value` (the
 * direction's filter value) is that stretch's full-window wait, an edge gap sets it (a steady
 * period reads its spacing, not its wait, so it never does), and the gaps between departures pass
 * the steadiness gap test: the card can then say when service starts or ends instead of "every
 * 77". One edge only: a period that both starts late and ends early keeps the plain reading.
 * Read like computePeriodCoverageHeadways' window.
 */
export function periodEdge(stretchTimes: readonly number[], start: number, end: number, value: number | null): StretchPeriodEdge | null {
  if (value == null) return null;
  const t = [...new Set(forCrossMidnightWindow([...stretchTimes], end))].filter(x => x >= start && x < end).sort((a, b) => a - b);
  if (t.length < 3) return null;
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  const lead = t[0] - start;
  const trail = end - t[t.length - 1];
  const inner = Math.max(...gaps);
  if (Math.ceil(Math.max(lead, trail, inner)) !== value || inner >= value) return null;
  const every = medianHeadwayInWindow(t, start, end, 3, true);
  if (every == null || every <= 0 || !isSustainedHeadway(gaps, every)) return null;
  // The wait is rounded up to whole minutes; frequencies.txt spacing can leave fractional times.
  const fromEdge = Math.ceil(lead) === value, untilEdge = Math.ceil(trail) === value;
  if (fromEdge === untilEdge) return null;
  return fromEdge ? { from: t[0], every } : { until: t[t.length - 1], every };
}

/**
 * #934 (Ryan, 2026-10-16): a period the main stretch covers only part of (D8: no departure on one
 * side of its midpoint) with steady spacing where it runs reads "from 7:17am, every 9 min" or
 * "until 5:40pm, every 10 min" instead of "limited".
 */
export function periodPartialEdge(stretchTimes: readonly number[], start: number, end: number): StretchPeriodEdge | null {
  const t = [...new Set(forCrossMidnightWindow([...stretchTimes], end))].filter(x => x >= start && x < end).sort((a, b) => a - b);
  if (t.length < 3) return null;
  const mid = (start + end) / 2;
  const after = t[0] >= mid;
  const before = t[t.length - 1] < mid;
  if (!after && !before) return null;
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  const every = medianHeadwayInWindow(t, start, end, 3, true);
  if (every == null || every <= 0 || !isSustainedHeadway(gaps, every)) return null;
  return after ? { from: t[0], every } : { until: t[t.length - 1], every };
}

/** D6, narrowed (Ryan, 2026-10-16): service through the period, steady but for one gap inside it. */
export interface StretchPeriodGap {
  every: number;
  gap: number;
}

/**
 * The one-gap reading of a period at a stretch's reference stop, or null: departures on both sides
 * of the period's midpoint, the gaps between them unsteady by the shared gap test, and steady once
 * the longest is left out. The caller applies it only to periods that run (D8 and the dominant
 * hole check). `every` is the median gap, `gap` the longest.
 */
export function periodOneGap(stretchTimes: readonly number[], start: number, end: number): StretchPeriodGap | null {
  const t = [...new Set(forCrossMidnightWindow([...stretchTimes], end))].filter(x => x >= start && x < end).sort((a, b) => a - b);
  if (t.length < 4) return null;
  const mid = (start + end) / 2;
  if (!(t[0] < mid && t[t.length - 1] >= mid)) return null;
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  // One gap inside steady service only where the plain median and the #772 reading agree: where
  // the gaps alternate, the reading rises toward the long gaps (GO 33 PM: every 69, with a 158 min
  // gap), which is not steady service with one gap, so no wording and the card keeps its wait.
  const every = medianHeadwayInWindow(t, start, end, 3, true);
  if (every !== medianHeadwayInWindow(t, start, end, 3)) return null;
  if (every == null || every <= 0 || isSustainedHeadway(gaps, every)) return null;
  const gap = Math.max(...gaps);
  const rest = [...gaps];
  rest.splice(rest.indexOf(gap), 1);
  return isSustainedHeadway(rest, every) ? { every, gap } : null;
}

/** D1 and D3: the direction value is the worst counting stretch; night needs the main stretch and every tail that runs at night. */
export function rollupDirection(d: DirectionStretches): DirectionRollup | null {
  if (!d.main) return null;
  // The guard's narrowing does not reach the closures below.
  const mainStretch = d.main;
  const main = stretchPeriods(d.main);
  const tails = d.tails.map(stretchPeriods);
  // #1072, rule 3: a tail that runs only part of a period because a sibling branch takes over the
  // same cadence from it at the main stretch (HSR 16: every 30 via Wilson until 12:10, then every 30
  // via Fiddler's Green) is read at its own spacing in that period, not at its full-window wait
  // (170), which would fail the direction though a bus comes every 30. Only when the main stretch is steady with
  // every wait within the coverage cap; the tail's trips and the siblings' are apart in time there
  // (one before the other), each has the 3 departures a value needs, and their spacing and the gap
  // at the handover pass the settled steadiness test against each other. A branch that just stops
  // (no sibling, short turns only, overlapping or slower siblings) keeps its wait. The all-day
  // value and Frequent Service are untouched.
  const handsOver = (i: number, key: PeriodKey, start: number, end: number): boolean => {
    const t = tails[i][key];
    const m = main[key];
    if (!d.tailHandoverTimes || d.disconnected || !t.counts || t.coverage == null || t.coverage <= PERIOD_COVERAGE_MAX_HEADWAY) return false;
    if (m.sustained !== true || m.sustainedMid !== true || m.coverage == null || m.coverage > PERIOD_COVERAGE_MAX_HEADWAY) return false;
    const { on, off } = d.tailHandoverTimes(i);
    const inWindow = (times: readonly number[]) => [...new Set(forCrossMidnightWindow([...times], end))].filter(x => x >= start && x <= end).sort((a, b) => a - b);
    const a = inWindow(on), b = inWindow(off);
    if (a.length < MIN_SCHEDULE_DEPARTURES || b.length < MIN_SCHEDULE_DEPARTURES) return false;
    const [first, second] = a[a.length - 1] < b[0] ? [a, b] : b[b.length - 1] < a[0] ? [b, a] : [null, null];
    if (!first || !second) return false;
    const everyA = medianHeadwayInWindow(a, start, end, MIN_SCHEDULE_DEPARTURES, true);
    const everyB = medianHeadwayInWindow(b, start, end, MIN_SCHEDULE_DEPARTURES, true);
    if (everyA == null || everyB == null || everyA <= 0 || everyB <= 0) return false;
    const near = (x: number, y: number) => isSustainedHeadway([x], y) && isSustainedHeadway([y], x);
    return near(everyA, everyB) && near(second[0] - first[first.length - 1], everyA) && near(second[0] - first[first.length - 1], everyB);
  };
  // A tail that hands over is read at its own steady spacing, not left out: the slower branch
  // still decides (D1), so the main stretch's cadence never stands in for a slower branch.
  const turnTaking = (p: StretchPeriod): StretchPeriod => ({ ...p, coverage: p.headway });
  const handover = Object.fromEntries(PERIOD_WINDOWS.map(({ key, start, end }) => [key, d.tails.map((_, i) => handsOver(i, key, start, end))])) as Record<PeriodKey, boolean[]>;
  const period = {} as DirectionRollup['period'];
  for (const { key } of PERIOD_WINDOWS) {
    const counting = [main[key], ...tails.map((t, i) => (handover[key][i] ? turnTaking(t[key]) : t[key]))].filter(p => p.counts && p.value != null);
    period[key] = {
      value: counting.length > 0 ? Math.max(...counting.map(p => p.value!)) : null,
      coverage: counting.length > 0 ? Math.max(...counting.map(p => p.coverage ?? 0)) : null,
      sustained: counting.length > 0 ? counting.every(p => p.sustained === true) : null,
      sustainedMid: counting.length > 0 ? counting.every(p => p.sustainedMid === true) : null,
      // The worst counting stretch sets the value; it is one gap when that stretch's is.
      oneGap: counting.length > 0 && counting.some(p => p.oneGap && p.value === Math.max(...counting.map(c => c.value!))),
      mainValue: main[key].counts ? main[key].value : null,
      mainLow: !main[key].counts ? null : main[key].uneven ? main[key].headway : main[key].value,
      filterValue: null,
      typical: null,
      runs: false,
      hasService: false,
      edge: null,
      gap: null,
    };
  }
  // Step 5a: the filter value and whether the direction runs, per period.
  for (const { key, start, end } of PERIOD_WINDOWS) {
    const runs = runsThroughPeriod(d.main.times, start, end, main[key].sustained);
    const filterOf = stretchFilterValue;
    // #961: a sparse overnight window (#897: three departures around a hole of hours) has no
    // value at the row, so it gives none here either; the card would otherwise print its full-
    // window wait as "every N" (MBTA 23 Sunday overnight to Ashmont: every 196). A sparse main
    // stretch leaves the direction without a value, a sparse tail drops out.
    const sparse = (s: Stretch | null | undefined) => s != null && key === 'overnight' && isSparseOvernightWindow(s.times);
    const countingStretches = [d.main, ...d.tails]
      .map((st, i) => ({ st, stretch: (i === 0 ? 'main' : i - 1) as 'main' | number, p: i === 0 ? main[key] : handover[key][i - 1] ? turnTaking(tails[i - 1][key]) : tails[i - 1][key] }))
      .filter(({ st, p }, i) => p.counts && (i === 0 ? runs && !sparse(d.main) : !sparse(st)));
    const counting = countingStretches.map(c => c.p);
    const values = counting.map(filterOf).filter((v): v is number => v != null);
    period[key].runs = runs;
    period[key].hasService = forCrossMidnightWindow([...d.main.times], end).some(t => t >= start && t <= end);
    period[key].filterValue = runs && !sparse(d.main) && values.length > 0 ? Math.max(...values) : null;
    const setterAt = period[key].filterValue == null ? undefined : countingStretches.find(c => filterOf(c.p) === period[key].filterValue);
    const setter = setterAt?.p;
    period[key].typical = setter?.uneven && setter.headway != null && setter.headway < period[key].filterValue! ? setter.headway : null;
    // An uneven period's card reads its range, not an edge or one-gap wording.
    const uneven = period[key].typical != null;
    // CIV-1241 (Ryan, 2026-11-01): the edge is read on the stretch that sets the filter value, so a
    // branch that runs steadily and then stops (settled rule 3 keeps its full-window wait: AC
    // Transit 22 Sunday midday, every 30 until 12:12, 168) reads "every 30 until 12:12" from the
    // same reading as a main stretch's early end.
    // CIV-1248 (Ryan, 2026-11-01): a period the main stretch covers only part of reads the partial
    // edge of every stretch that starts or ends in it, and the slowest decides (D1), as the filter
    // value's setter does: TTC 110 Sunday AM's trunk runs every 15 from 7:52, its branches every 30.
    // The filter value stays null there (D8).
    const partial = () => [mainStretch, ...d.tails]
      .map((st, i) => ({ edge: periodPartialEdge(st.times, start, end), stretch: (i === 0 ? 'main' : i - 1) as 'main' | number }))
      .filter((c): c is { edge: StretchPeriodEdge; stretch: 'main' | number } => c.edge != null)
      .reduce<{ edge: StretchPeriodEdge; stretch: 'main' | number } | null>((worst, c) => (worst == null || c.edge.every > worst.edge.every ? c : worst), null);
    // #1276: name the stretch, so the card puts the words on that stretch's row.
    if (uneven) period[key].edge = null;
    else if (runs) {
      const edge = periodEdge((setterAt?.st ?? d.main).times, start, end, period[key].filterValue);
      period[key].edge = edge && { ...edge, stretch: setterAt?.stretch ?? 'main' };
    } else {
      const slowest = partial();
      period[key].edge = slowest && { ...slowest.edge, stretch: slowest.stretch };
    }
    // Only where the settled checks count the period as running: a big-gap period that does not
    // run (TTC 504 overnight, 169 minutes against a typical 5) keeps "Irregular".
    period[key].gap = runs && !uneven && !period[key].edge ? periodOneGap(d.main.times, start, end) : null;
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
  // By day a branch takes part in the all-day value and Frequent Service only when it runs at
  // midday and across the all-day window by #720's coverage test (its own departures span at least
  // ALL_DAY_MIN_COVERAGE of the grading window). A part-day branch still sets its own periods (D1),
  // not the all-day value: TTC 76B (every 30 at midday), SEPTA T3's 12-trip Darby branch.
  const spansWindow = (st: Stretch) => {
    const t = st.times.filter(x => x >= grading.start && x <= grading.end);
    return t.length >= 2 && (Math.max(...t) - Math.min(...t)) / (grading.end - grading.start) >= ALL_DAY_MIN_COVERAGE;
  };
  const allDayTails = d.tails.filter((t, i) => (overnightFallback
    ? tails[i].overnight.counts
    : tails[i].midday.counts && spansWindow(t)));
  const allDayOf = (st: Stretch) => {
    // Phase 2's overnight fallback: with fewer than two departures in the window (a night route),
    // the stretch reads all of its departures.
    let t = st.times.filter(x => x >= grading.start && x <= grading.end);
    if (t.length < 2) t = [...st.times];
    return t.length >= 2 ? Math.round(computeHeadwayStats(t).median) : null;
  };
  const allDays = [d.main, ...allDayTails].map(allDayOf);
  // The #899 rule unchanged, on main's input (the direction's best-served stop over every trip,
  // midday899): a midday reading with a wait under three hours, or a wait of at most
  // ALL_DAY_MIDDAY_MAX_WAIT, means the direction runs at midday (GO 88 Saturday: 90 and 95 at
  // Durham College, though 182 at King St on the local main stretch).
  const middayWait = d.midday899 ? d.midday899.wait : main.midday.coverage;
  const middayHasReading = (d.midday899 ? d.midday899.hasReading : main.midday.headway != null) && middayWait != null && middayWait < 3 * 60;
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
    period, night30: v30 !== 'fail', night60: v60 !== 'fail', nightValue: directionNightValue(d), nightDirectionValue: directionNightValue(d, true), nightPartial30: v30 === 'partial', nightPartial60: v60 === 'partial',
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
  /** #1267: the Overnight value, the worst direction's night value; null when any has none. */
  nightValue: number | null;
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
 * or no regular cadence in the period) leaves the route with none: never one direction alone.
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
    const mains = known.map(d => d.period[key].mainLow).filter((v): v is number => v != null);
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
    nightValue: complete && known.every(d => d.nightValue != null) ? Math.max(...known.map(d => d.nightValue!)) : null,
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
  'stretchPeriodOneGap',
  'stretchPeriodTypical',
  'stretchPeriodEdge',
  'stretchPeriodGap',
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
  'stretchCovers',
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
    // #1267: Overnight is one number from the night verdict, so its old 2-6 AM wording inputs (one gap, typical-worst
    // range, late start or early end, one gap inside) are not stamped.
    p.stretchPeriodOneGap = byPeriod(k => k === 'overnight' ? false : dir.period[k].oneGap);
    p.stretchPeriodTypical = byPeriod(k => k === 'overnight' ? null : dir.period[k].typical);
    // #934: only periods with an edge reading, so most features carry an empty object at most.
    {
      const edges = Object.fromEntries(PERIOD_WINDOWS.flatMap(({ key }) => (key !== 'overnight' && dir.period[key].edge ? [[key, dir.period[key].edge]] : [])));
      if (Object.keys(edges).length > 0) p.stretchPeriodEdge = edges;
      else delete p.stretchPeriodEdge;
      const gaps = Object.fromEntries(PERIOD_WINDOWS.flatMap(({ key }) => (key !== 'overnight' && dir.period[key].gap ? [[key, dir.period[key].gap]] : [])));
      if (Object.keys(gaps).length > 0) p.stretchPeriodGap = gaps;
      else delete p.stretchPeriodGap;
    }
    p.stretchRoutePeriodHeadway = byPeriod(k => route.period[k].value);
    p.stretchPeriodRange = byPeriod(k => k === 'overnight' ? null : route.period[k].range);
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
    // #1267: Overnight reads the night verdict's value (directionNightValue), as Night Service does.
    p.routeFilterHeadwayByPeriod = byPeriod(k => k === 'overnight' ? route.nightValue : route.period[k].filterValue);
    p.directionFilterHeadwayByPeriod = byPeriod(k => k === 'overnight' ? dir.nightDirectionValue : dir.period[k].filterValue);
    // CIV-321: per drawn stop and period, every trip of the direction running through the stop, along
    // the display-only full line where the row has one (S4), else the row's own stops.
    const stopOrder = (p.fullStopOrder ?? p.stopOrder) as readonly string[] | undefined;
    if (stretches.throughTimesAlong && Array.isArray(stopOrder) && stopOrder.length > 0) p.stretchStopPeriodValues = stopPeriodValues(stopOrder, stretches.throughTimesAlong);
    else delete p.stretchStopPeriodValues;
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
      // #1276: every stretch the row's stops cover, so a period edge (stretchPeriodEdge[k].stretch)
      // finds its rows where no row stands for that stretch (TTC 110 Weekday PM: tail 3).
      const coversAll: ('main' | number)[] = [
        ...(stretches.main && covers(stretches.main.stops) ? ['main' as const] : []),
        ...stretches.tails.flatMap((t, i) => (covers(t.stops) ? [i] : [])),
      ];
      if (coversAll.length > 0) p.stretchCovers = coversAll;
      else delete p.stretchCovers;
    }
    p.stretchMeta = {
      main: stretches.main ? { stops: stretches.main.stops.length, refStop: stretches.main.refStop, trips: stretches.main.tripCount, ...stretchMetaPeriods(stretches.main) } : null,
      tails: stretches.tails.map(t => ({ refStop: t.refStop, stops: t.stops.length, km: Math.round(t.lengthKm * 100) / 100, trips: t.tripCount, ...stretchMetaPeriods(t), ...tailNotThrough(t) })),
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
