/**
 * "Where vehicles lose time" from archived vehicle positions (local Live POC).
 *
 * Lead metric is identity-free: the actual time from stop A to stop B for
 * whichever vehicle passed, compared with the timetable's A->B time for that
 * time band. Short turns, swaps and holds-for-headway don't change it.
 *
 * Positions arrive about once a minute, so the time a vehicle passed a stop
 * is interpolated between the samples either side of it by distance along
 * the route shape.
 */
import { projectOntoShape, type Shape, type ShapeProjection } from './shapeProjection.js';

export interface PatternStop {
  stopId: string;
  along: number; // metres along the pattern's shape
}

export interface Pattern {
  id: string;
  directionId: number;
  shape: Shape;
  stops: PatternStop[];
}

export interface PositionSample {
  t: number; // epoch seconds
  lat: number;
  lon: number;
}

export interface StopPassage {
  stopId: string;
  t: number;
}

export const SEGMENT_DEFAULTS = {
  /** A sample further than this from the shape ends the leg (diversion or bad fix). */
  maxPerpM: 50,
  /** Faster than this between samples is a bad fix, not a streetcar (90 km/h). */
  maxSpeedMps: 25,
  /** Max time between the two samples bracketing a stop. */
  maxBracketGapSec: 150,
};

export interface Projected {
  t: number;
  along: number;
  perpM: number;
}

/** Sub-shape covering [from, to] metres along, with its cumulative offset. */
function window(shape: Shape, from: number, to: number): Shape {
  let i = 0;
  while (i < shape.cum.length - 1 && shape.cum[i + 1] < from) i++;
  let j = i + 1;
  while (j < shape.cum.length - 1 && shape.cum[j] < to) j++;
  return { pts: shape.pts.slice(i, j + 1), cum: shape.cum.slice(i, j + 1), total: shape.total };
}

export function projectRun(samples: PositionSample[], pattern: Pattern): Projected[] {
  const out: Projected[] = [];
  let hint: number | null = null;
  for (const s of samples) {
    // Search near the previous position first (samples are ~1 min apart); fall back to the whole shape.
    let p: ShapeProjection | null = null;
    if (hint != null) {
      p = projectOntoShape(window(pattern.shape, hint - 300, hint + 2000), s.lat, s.lon);
      if (p && p.perpDistM > 50) p = null;
    }
    p ??= projectOntoShape(pattern.shape, s.lat, s.lon);
    if (!p) continue;
    out.push({ t: s.t, along: p.along, perpM: p.perpDistM });
    if (p.perpDistM <= 50) hint = p.along;
  }
  return out;
}

/**
 * Times a run passed each stop of its pattern, interpolated between the two
 * samples either side of the stop. A stop is skipped when those samples are
 * too far apart in time or the vehicle went backwards. Passages are split
 * into legs at any off-shape sample, so a stop pair that spans a diversion
 * never becomes a segment observation. Samples implying an impossible speed
 * are dropped as bad GPS fixes.
 */
export function stopPassages(projected: Projected[], pattern: Pattern, opts = SEGMENT_DEFAULTS): StopPassage[][] {
  const legs: Projected[][] = [[]];
  for (const p of projected) {
    const leg = legs[legs.length - 1];
    if (p.perpM > opts.maxPerpM) {
      if (leg.length) legs.push([]);
      continue;
    }
    const prev = leg[leg.length - 1];
    if (prev && p.t > prev.t && Math.abs(p.along - prev.along) / (p.t - prev.t) > opts.maxSpeedMps) continue;
    leg.push(p);
  }
  return legs.filter(l => l.length >= 2).map(leg => {
    const out: StopPassage[] = [];
    let i = 0;
    for (const stop of pattern.stops) {
      while (i < leg.length - 1 && leg[i + 1].along < stop.along) i++;
      if (i >= leg.length - 1) break;
      const a = leg[i];
      const b = leg[i + 1];
      if (!(a.along <= stop.along && b.along >= stop.along) || b.along <= a.along) continue;
      if (b.t <= a.t || b.t - a.t > opts.maxBracketGapSec) continue;
      const frac = (stop.along - a.along) / (b.along - a.along);
      out.push({ stopId: stop.stopId, t: a.t + frac * (b.t - a.t) });
    }
    return out;
  });
}

export interface SegmentObservation {
  fromStopId: string;
  toStopId: string;
  directionId: number;
  departT: number;
  actualSec: number;
  date: string;
}

/** Consecutive pattern stops passed within one leg -> one observation per stop pair. */
export function segmentObservations(legs: StopPassage[][], pattern: Pattern, date: string): SegmentObservation[] {
  const order = new Map(pattern.stops.map((s, i) => [s.stopId, i]));
  const out: SegmentObservation[] = [];
  for (const passages of legs) {
    for (let k = 0; k < passages.length - 1; k++) {
      const a = passages[k];
      const b = passages[k + 1];
      if (order.get(b.stopId)! !== order.get(a.stopId)! + 1) continue;
      const actualSec = b.t - a.t;
      if (actualSec <= 0) continue;
      out.push({ fromStopId: a.stopId, toStopId: b.stopId, directionId: pattern.directionId, departT: a.t, actualSec, date });
    }
  }
  return out;
}

export type TimeBand = 'early' | 'am' | 'midday' | 'pm' | 'evening' | 'late';
export const TIME_BANDS: { id: TimeBand; startHour: number; endHour: number }[] = [
  { id: 'early', startHour: 5, endHour: 7 },
  { id: 'am', startHour: 7, endHour: 10 },
  { id: 'midday', startHour: 10, endHour: 15 },
  { id: 'pm', startHour: 15, endHour: 19 },
  { id: 'evening', startHour: 19, endHour: 22 },
  { id: 'late', startHour: 22, endHour: 29 },
];

export function bandForHour(hour: number): TimeBand {
  const h = ((hour % 24) + 24) % 24;
  for (const b of TIME_BANDS) {
    if ((h >= b.startHour && h < b.endHour) || (h + 24 >= b.startHour && h + 24 < b.endHour)) return b.id;
  }
  return 'late';
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Nearest-rank percentile (p in 0..1). */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

export function segmentKey(fromStopId: string, toStopId: string): string {
  return `${fromStopId}>${toStopId}`;
}

/** Timetable A->B running time per (schedule key, segment, band): median seconds. */
export type ScheduledRunTimes = Map<string, Map<string, Map<TimeBand, number>>>;

export interface SegmentBandStat {
  trips: number;
  days: number;
  firstDate: string;
  lastDate: string;
  actualMedianSec: number;
  scheduledMedianSec: number;
  /** Median of (actual - scheduled) per pass; positive = loses time. */
  gainedMedianSec: number;
  /** 90th percentile of (actual - scheduled): 1 in 10 passes lose at least this much. */
  gainedP90Sec: number;
}

export interface SegmentStat {
  fromStopId: string;
  toStopId: string;
  directionId: number;
  bands: Partial<Record<TimeBand | 'all', SegmentBandStat>>;
}

/**
 * Per-segment, per-band stats. Each pass is compared with the timetable's
 * A->B time for its date's schedule and band; passes with no timetable
 * counterpart are dropped, not guessed.
 */
export function aggregateSegments(
  observations: SegmentObservation[],
  scheduled: ScheduledRunTimes,
  scheduleKeyForDate: (date: string) => string | null,
  hourOf: (epochSec: number) => number,
): SegmentStat[] {
  type Acc = { actual: number[]; sched: number[]; gained: number[]; days: Set<string> };
  const acc = new Map<string, { directionId: number; from: string; to: string; bands: Map<TimeBand | 'all', Acc> }>();
  for (const o of observations) {
    const sk = scheduleKeyForDate(o.date);
    if (!sk) continue;
    const key = segmentKey(o.fromStopId, o.toStopId);
    const band = bandForHour(hourOf(o.departT));
    const sched = scheduled.get(sk)?.get(key)?.get(band);
    if (sched == null) continue;
    let seg = acc.get(key);
    if (!seg) {
      seg = { directionId: o.directionId, from: o.fromStopId, to: o.toStopId, bands: new Map() };
      acc.set(key, seg);
    }
    for (const b of [band, 'all'] as const) {
      let a = seg.bands.get(b);
      if (!a) { a = { actual: [], sched: [], gained: [], days: new Set() }; seg.bands.set(b, a); }
      a.actual.push(o.actualSec);
      a.sched.push(sched);
      a.gained.push(o.actualSec - sched);
      a.days.add(o.date);
    }
  }
  const out: SegmentStat[] = [];
  for (const seg of acc.values()) {
    const bands: SegmentStat['bands'] = {};
    for (const [b, a] of seg.bands) {
      const days = [...a.days].sort();
      bands[b] = {
        trips: a.actual.length,
        days: days.length,
        firstDate: days[0],
        lastDate: days[days.length - 1],
        actualMedianSec: Math.round(median(a.actual)!),
        scheduledMedianSec: Math.round(median(a.sched)!),
        gainedMedianSec: Math.round(median(a.gained)!),
        gainedP90Sec: Math.round(percentile(a.gained, 0.9)!),
      };
    }
    out.push({ fromStopId: seg.from, toStopId: seg.to, directionId: seg.directionId, bands });
  }
  return out;
}

/** Average wait for a rider arriving at random: Σgap² / (2·Σgap). */
export function averageWaitSec(gaps: number[]): number | null {
  const sum = gaps.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  return gaps.reduce((a, g) => a + g * g, 0) / (2 * sum);
}

export interface HeadwayBandStat {
  gaps: number;
  days: number;
  scheduledMedianGapSec: number;
  actualMedianGapSec: number;
  /** Share of gaps within ±50% of that window's scheduled gap. */
  withinShare: number;
  /** Actual average wait minus scheduled average wait (TfL-style EWT); null if unmeasurable. */
  excessWaitSec: number | null;
}

export interface HeadwayStopStat {
  stopId: string;
  directionId: number;
  bands: Partial<Record<TimeBand | 'all', HeadwayBandStat>>;
}

/**
 * Headway adherence at one stop for one (service date, band) window.
 *
 * A pass we failed to observe would look like a long gap, so gaps are only
 * measured across stretches where every scheduled trip in a row was seen at
 * this stop (matched by trip ID): within such a stretch, actual gaps are
 * between successive vehicles of any trip, scheduled gaps between those
 * timetable trips. Stretches shorter than `minRun` trips are dropped.
 */
export function headwayWindows(
  scheduled: { tripId: string; t: number }[],
  observedByTrip: Map<string, number>,
  observedAll: number[],
  minRun = 4,
): { actualGaps: number[]; scheduledGaps: number[] }[] {
  const sched = [...scheduled].sort((a, b) => a.t - b.t);
  const all = [...observedAll].sort((a, b) => a - b);
  const out: { actualGaps: number[]; scheduledGaps: number[] }[] = [];
  let run: { tripId: string; t: number; seen: number }[] = [];
  const flush = () => {
    // A stretch spanning a service break (over 30 min between scheduled trips) isn't a headway.
    const broken = run.some((r, i) => i > 0 && r.t - run[i - 1].t > 1800);
    if (run.length >= minRun && !broken) {
      const lo = Math.min(...run.map(r => r.seen));
      const hi = Math.max(...run.map(r => r.seen));
      const inside = all.filter(t => t >= lo && t <= hi);
      const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);
      out.push({ actualGaps: gaps(inside), scheduledGaps: gaps(run.map(r => r.t)) });
    }
    run = [];
  };
  for (const s of sched) {
    const seen = observedByTrip.get(s.tripId);
    if (seen == null) { flush(); continue; }
    run.push({ ...s, seen });
  }
  flush();
  return out;
}

export function headwayBandStat(
  windows: { date: string; actualGaps: number[]; scheduledGaps: number[] }[],
): HeadwayBandStat | null {
  const usable = windows.filter(w => w.actualGaps.length && w.scheduledGaps.length);
  if (usable.length === 0) return null;
  let ewtSum = 0, weight = 0, within = 0, gaps = 0;
  for (const w of usable) {
    // Grade each window against its own schedule, so mixing a 4-min morning
    // with a 10-min evening doesn't make either look irregular.
    const schedMedian = median(w.scheduledGaps)!;
    within += w.actualGaps.filter(g => Math.abs(g - schedMedian) <= 0.5 * schedMedian).length;
    gaps += w.actualGaps.length;
    const a = averageWaitSec(w.actualGaps);
    const sw = averageWaitSec(w.scheduledGaps);
    if (a == null || sw == null) continue;
    const span = w.scheduledGaps.reduce((x, y) => x + y, 0);
    ewtSum += (a - sw) * span;
    weight += span;
  }
  return {
    gaps,
    days: new Set(usable.map(w => w.date)).size,
    scheduledMedianGapSec: Math.round(median(usable.flatMap(w => w.scheduledGaps))!),
    actualMedianGapSec: Math.round(median(usable.flatMap(w => w.actualGaps))!),
    withinShare: Math.round((within / gaps) * 100) / 100,
    excessWaitSec: weight ? Math.round(ewtSum / weight) : null,
  };
}

export interface HoldEvent {
  stopId: string;
  start: number;
  end: number;
}

/**
 * Times a vehicle sat still (moved under `stillM` along the shape) for at
 * least `minSec`, within `nearM` of a stop. Reported per stop, not folded into
 * running time. With ~1-minute positions, 2+ minutes means 3+ samples in place.
 * This can't tell a deliberate hold from a breakdown or blocked track ahead.
 */
export function detectHolds(
  projected: Projected[],
  pattern: Pattern,
  opts = { minSec: 120, stillM: 25, nearM: 60, maxPerpM: SEGMENT_DEFAULTS.maxPerpM, maxGapSec: SEGMENT_DEFAULTS.maxBracketGapSec },
): HoldEvent[] {
  const pts = projected.filter(p => p.perpM <= opts.maxPerpM);
  const out: HoldEvent[] = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (
      j + 1 < pts.length
      && Math.abs(pts[j + 1].along - pts[i].along) <= opts.stillM
      && pts[j + 1].t - pts[j].t <= opts.maxGapSec
    ) j++;
    if (pts[j].t - pts[i].t >= opts.minSec) {
      const at = (pts[i].along + pts[j].along) / 2;
      let best: PatternStop | null = null;
      for (const s of pattern.stops) {
        if (Math.abs(s.along - at) <= opts.nearM && (!best || Math.abs(s.along - at) < Math.abs(best.along - at))) best = s;
      }
      if (best) out.push({ stopId: best.stopId, start: pts[i].t, end: pts[j].t });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

export type TripStopStatus =
  | 'ran' // a pass was timed at this stop
  | 'timing_gap' // the vehicle was reporting around then, but this stop wasn't timed
  | 'off_route' // the vehicle was reporting but off the route shape (detour) around then
  | 'not_seen' // no vehicle reported this trip, while the feed was healthy for the whole trip
  | 'started_other_trip' // the vehicle turned back and started another trip before this stop
  | 'joined_late' // the vehicle first reported this trip after it would have passed here
  | 'stopped_reporting' // the vehicle stopped reporting this trip before it would have passed here
  | 'feed_gap'; // the feed was down or degraded: unknown, excluded

/** Plain-language labels for the statuses (for the card, after review). */
export const TRIP_STOP_STATUS_LABELS: Record<TripStopStatus, string> = {
  ran: 'Timed here',
  timing_gap: 'Reporting, but not timed at this stop',
  off_route: "Off this trip's route here (detour, or running another branch)",
  not_seen: 'No vehicle reported this trip. It may have been cancelled, run under another trip number, or had its tracker off.',
  started_other_trip: 'Vehicle started another trip partway along',
  joined_late: 'Vehicle started reporting this trip after this stop',
  stopped_reporting: 'Vehicle stopped reporting this trip before this stop',
  feed_gap: 'Live feed was down or incomplete; not counted',
};

/**
 * Status of each scheduled stop of one trip on one service day, from what the
 * live feed showed. Untimed stops are placed in time by offsetting the nearest
 * timed pass by the timetable's running time, then compared with when the
 * vehicle was reporting this trip.
 */
export function classifyTripStops(input: {
  stopIds: string[]; // the trip's stops, in order
  scheduledT: number[]; // timetable time at each stop
  passT: Map<string, number>; // timed pass per stop
  pings: number[]; // times this trip's vehicle reported (empty: never seen)
  offRoute?: [number, number][]; // intervals the vehicle was off the shape
  startedOtherTripAfterIndex?: number | null; // confirmed turn-back after this stop index
  feedDown: (t: number) => boolean; // feed down or degraded around t
  slackSec?: number;
}): TripStopStatus[] {
  const { stopIds, scheduledT, passT, feedDown } = input;
  const slack = input.slackSec ?? 60;
  const n = stopIds.length;
  // A trip nobody reported, overlapping any feed trouble, is unknown rather than missing.
  if (input.pings.length === 0) {
    const troubled = scheduledT.some(t => feedDown(t)) || feedDown(scheduledT[0] - 600) || feedDown(scheduledT[n - 1] + 600);
    return stopIds.map(() => (troubled ? 'feed_gap' : 'not_seen'));
  }
  const timed = stopIds.map((s, i) => (passT.has(s) ? i : -1)).filter(i => i >= 0);
  const estimate = (i: number): number => {
    if (!timed.length) return scheduledT[i];
    let k = timed[0];
    for (const j of timed) if (Math.abs(j - i) < Math.abs(k - i)) k = j;
    return passT.get(stopIds[k])! + (scheduledT[i] - scheduledT[k]);
  };
  // Reporting stretches: pings more than 5 min apart mean the vehicle wasn't reporting in between.
  const sorted = [...input.pings].sort((a, b) => a - b);
  const stretches: [number, number][] = [];
  for (const t of sorted) {
    const last = stretches[stretches.length - 1];
    if (last && t - last[1] <= 300) last[1] = t; else stretches.push([t, t]);
  }
  const firstPing = sorted[0];
  return stopIds.map((s, i) => {
    if (passT.has(s)) return 'ran';
    if (input.startedOtherTripAfterIndex != null && i > input.startedOtherTripAfterIndex) return 'started_other_trip';
    const t = estimate(i);
    if (feedDown(t)) return 'feed_gap';
    if (t < firstPing - slack) return 'joined_late';
    if (!stretches.some(([a, b]) => t >= a - slack && t <= b + slack)) return 'stopped_reporting';
    if ((input.offRoute ?? []).some(([a, b]) => t >= a - slack && t <= b + slack)) return 'off_route';
    return 'timing_gap';
  });
}

/**
 * A trip counts as "vehicle started another trip partway along" only when it
 * stopped well short of the route end (not a terminal loop) and the same
 * vehicle then started a trip in the *opposite* direction close by and soon
 * after. A same-direction follow-on is a trip-number change, not a turn-back.
 */
export function isTurnBack(input: {
  metresFromRouteEnd: number;
  nextTripSameDirection: boolean;
  gapSec: number;
  distanceM: number;
  stoppedBeforeScheduledEndSec: number;
}): boolean {
  return input.metresFromRouteEnd >= 1000
    && !input.nextTripSameDirection
    && input.gapSec <= 1200
    && input.distanceM <= 500
    && input.stoppedBeforeScheduledEndSec >= 180;
}

/**
 * Whether a stationary spell counts as "stood still near this stop": not
 * within 10 min of a trip-number change or the car leaving the feed, not at
 * either end of the pattern, not near a carhouse, inside the trip's scheduled
 * span, and longer than the timetable's own dwell there by 2+ min. Returns the
 * excess seconds, or null.
 */
export function standingStillExcess(input: {
  start: number;
  end: number;
  runFirst: number;
  runLast: number;
  stopIndex: number;
  patternStops: number;
  nearCarhouse: boolean;
  scheduledStart: number;
  scheduledEnd: number;
  scheduledDwellSec: number;
}): number | null {
  if (input.start - input.runFirst < 600 || input.runLast - input.end < 600) return null;
  if (input.stopIndex < 2 || input.stopIndex > input.patternStops - 3) return null;
  if (input.nearCarhouse) return null;
  if (input.start < input.scheduledStart || input.end > input.scheduledEnd) return null;
  const excess = (input.end - input.start) - input.scheduledDwellSec;
  return excess >= 120 ? excess : null;
}
