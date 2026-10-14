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
  /** Max distance from the shape for a sample to be used for timing. */
  maxPerpM: 50,
  /** A sample further than this from the shape means the vehicle left the route (diversion). */
  offRouteM: 100,
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
 * too far apart in time, off the shape, or the vehicle went backwards.
 * Passages are split into legs at any off-route sample, so a stop pair that
 * spans a diversion never becomes a segment observation.
 */
export function stopPassages(projected: Projected[], pattern: Pattern, opts = SEGMENT_DEFAULTS): StopPassage[][] {
  const legs: Projected[][] = [[]];
  for (const p of projected) {
    if (p.perpM > opts.offRouteM) {
      if (legs[legs.length - 1].length) legs.push([]);
      continue;
    }
    if (p.perpM <= opts.maxPerpM) legs[legs.length - 1].push(p);
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
  /** Share of gaps within ±50% of the scheduled gap. */
  withinShare: number;
  /** Actual average wait minus scheduled average wait (TfL-style EWT). */
  excessWaitSec: number;
}

export interface HeadwayStopStat {
  stopId: string;
  directionId: number;
  bands: Partial<Record<TimeBand | 'all', HeadwayBandStat>>;
}

/**
 * Headway adherence at one stop, per (date, band) window: gaps between
 * successive vehicles (any trip) vs gaps between successive timetable trips.
 * A window only counts when we saw at least `minCoverage` of the scheduled
 * passes, because a missed pass would show up as a fake long gap.
 */
export function headwayWindows(
  observed: number[], // passage times at this stop in this window, any vehicle
  scheduled: number[], // timetable times at this stop in this window
  minCoverage = 0.9,
): { actualGaps: number[]; scheduledGaps: number[] } | null {
  if (scheduled.length < 3) return null;
  const cov = observed.length / scheduled.length;
  if (cov < minCoverage || cov > 1 / minCoverage) return null;
  const gaps = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const out: number[] = [];
    for (let i = 1; i < s.length; i++) out.push(s[i] - s[i - 1]);
    return out;
  };
  return { actualGaps: gaps(observed), scheduledGaps: gaps(scheduled) };
}

export function headwayBandStat(
  windows: { date: string; actualGaps: number[]; scheduledGaps: number[] }[],
): HeadwayBandStat | null {
  if (windows.length === 0) return null;
  const actual = windows.flatMap(w => w.actualGaps);
  const sched = windows.flatMap(w => w.scheduledGaps);
  const schedMedian = median(sched)!;
  // EWT per window (each window's own schedule), weighted by its scheduled span.
  let ewtSum = 0, weight = 0;
  for (const w of windows) {
    const a = averageWaitSec(w.actualGaps);
    const s = averageWaitSec(w.scheduledGaps);
    if (a == null || s == null) continue;
    const span = w.scheduledGaps.reduce((x, y) => x + y, 0);
    ewtSum += (a - s) * span;
    weight += span;
  }
  const within = actual.filter(g => Math.abs(g - schedMedian) <= 0.5 * schedMedian).length;
  return {
    gaps: actual.length,
    days: new Set(windows.map(w => w.date)).size,
    scheduledMedianGapSec: Math.round(schedMedian),
    actualMedianGapSec: Math.round(median(actual)!),
    withinShare: Math.round((within / actual.length) * 100) / 100,
    excessWaitSec: weight ? Math.round(ewtSum / weight) : 0,
  };
}
