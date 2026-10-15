/**
 * View model for the Live route card (local proof of concept): stops in line
 * order, the gap strip, the shared-section summary, stretches, and the
 * "Right now" gaps between the vehicles currently on the line.
 */
import { MIN_DAYS, MIN_SEGMENT_TRIPS, tidyStopName, type HeadwayBandStat, type HeadwayStop, type SegmentBand, type SegmentDelayData, type SegmentDelaySegment } from './segmentDelayView';

/** A stop needs this many gaps (over MIN_DAYS days) to appear in the strip. */
export const MIN_STRIP_GAPS = 30;
/** Rows in the card's gap strip; every stop is listed on the Details screen. */
export const STRIP_ROWS = 8;
/** A live vehicle more than this far from the line isn't placed. */
const MAX_PLACE_M = 60;
/** Positions older than this aren't used for "Right now". */
export const LIVE_STALE_SEC = 180;

export type GapStat = HeadwayBandStat & { gapP10Sec: number; gapP90Sec: number };

export interface LineStop {
  stopId: string;
  name: string;
  /** Short label: the cross street ("Spadina"), or "Roncesvalles & Queen" off the main street. */
  label: string;
  street: string;
  index: number;
  stat: GapStat | null;
  headway: HeadwayStop | null;
  shared: boolean;
}

export interface LineModel {
  directionId: number;
  stops: LineStop[];
  /** Consecutive stop pairs of the line, in order. */
  segments: SegmentDelaySegment[];
  /** Main street of the section every branch shares (e.g. "King St"). */
  sharedStreet: string | null;
}

const lonLatDist = (a: [number, number], b: [number, number]) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  const dx = (a[0] - b[0]) * 111_320 * k;
  const dy = (a[1] - b[1]) * 110_540;
  return Math.hypot(dx, dy);
};

function street(name: string): string {
  return tidyStopName(name).split(' at ')[0].replace(/\s+(East|West|North|South)$/i, '').trim();
}

function cross(name: string): string {
  const parts = tidyStopName(name).split(' at ');
  return (parts[1] ?? parts[0]).replace(/\s+(East|West|North|South) Side$/i, '').replace(/ - .*$/, '').replace(/\s+(St|Ave|Rd|Blvd|Cres|Way)(\s+(East|West|North|South))?$/i, '').trim();
}

function tripsOf(s: SegmentDelaySegment): number {
  return s.bands.all?.trips ?? 0;
}

/**
 * The line in one direction: start at the beginning of the busiest path and
 * follow the busiest next stop pair. Branch ends that aren't on that path are
 * left to the Details screen.
 */
export function lineModel(data: SegmentDelayData, directionId: number): LineModel | null {
  const segs = data.segments.filter(s => s.directionId === directionId);
  if (segs.length === 0) return null;
  const next = new Map<string, SegmentDelaySegment[]>();
  const hasIncoming = new Set<string>();
  for (const s of segs) {
    if (!next.has(s.fromStopId)) next.set(s.fromStopId, []);
    next.get(s.fromStopId)!.push(s);
    hasIncoming.add(s.toStopId);
  }
  const walk = (start: string) => {
    const path: SegmentDelaySegment[] = [];
    const seen = new Set<string>();
    let cur = start;
    while (next.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const s = next.get(cur)!.reduce((a, b) => (tripsOf(b) > tripsOf(a) ? b : a));
      path.push(s);
      cur = s.toStopId;
    }
    return path;
  };
  const starts = [...next.keys()].filter(k => !hasIncoming.has(k));
  const paths = starts.map(walk);
  const path = paths.reduce<SegmentDelaySegment[]>((best, p) => (p.reduce((n, s) => n + tripsOf(s), 0) > best.reduce((n, s) => n + tripsOf(s), 0) ? p : best), []);
  if (path.length === 0) return null;

  const maxTrips = Math.max(...path.map(tripsOf));
  const headwayBy = new Map((data.headways ?? []).filter(h => h.directionId === directionId).map(h => [h.stopId, h]));
  const ids = [path[0].fromStopId, ...path.map(s => s.toStopId)];
  const names = [path[0].fromName, ...path.map(s => s.toName)];
  // A stop is on the shared section when the stop pairs either side of it carry most of the line's trips.
  const sharedAt = (i: number) => {
    const before = i > 0 ? tripsOf(path[i - 1]) : 0;
    const after = i < path.length ? tripsOf(path[i]) : 0;
    return Math.max(before, after) >= 0.75 * maxTrips;
  };
  const counts = new Map<string, number>();
  ids.forEach((_, i) => { if (sharedAt(i)) counts.set(street(names[i]), (counts.get(street(names[i])) ?? 0) + 1); });
  const sharedStreet = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const stops: LineStop[] = ids.map((stopId, index) => {
    const headway = headwayBy.get(stopId) ?? null;
    const st = street(names[index]);
    return {
      stopId,
      name: names[index],
      street: st,
      // The cross street alone: the strip runs in line order, so the street is clear from context.
      label: cross(names[index]),
      index,
      stat: null,
      headway,
      shared: sharedAt(index),
    };
  });
  return { directionId, stops, segments: path, sharedStreet };
}

/** The stop's gap stats for a band, when there are enough gaps and days and it isn't a line end. */
export function stopGapStat(stop: LineStop, band: SegmentBand): GapStat | null {
  const h = stop.headway;
  if (!h || h.terminal) return null;
  const b = h.bands[band] as GapStat | undefined;
  if (!b || b.gaps < MIN_STRIP_GAPS || b.days < MIN_DAYS || b.gapP10Sec == null || b.gapP90Sec == null) return null;
  return b;
}

export function withStats(line: LineModel, band: SegmentBand): LineStop[] {
  return line.stops.map(s => ({ ...s, stat: stopGapStat(s, band) }));
}

/** Up to `rows` measured stops for the strip: both ends, the widest spread, then evenly spaced. */
export function stripStops(stops: LineStop[], rows = STRIP_ROWS): LineStop[] {
  const measured = stops.filter(s => s.stat);
  if (measured.length <= rows) return measured;
  const pick = new Set<number>([0, measured.length - 1]);
  let widest = 0;
  measured.forEach((s, i) => { if (s.stat!.gapP90Sec - s.stat!.gapP10Sec > measured[widest].stat!.gapP90Sec - measured[widest].stat!.gapP10Sec) widest = i; });
  pick.add(widest);
  for (let k = 1; pick.size < rows && k < rows; k++) pick.add(Math.round((k * (measured.length - 1)) / (rows - 1)));
  for (let i = 0; pick.size < rows && i < measured.length; i++) pick.add(i);
  return [...pick].sort((a, b) => a - b).map(i => measured[i]);
}

const med = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface SharedSummary {
  street: string;
  scheduledSec: number;
  typicalSec: number;
  p10Sec: number;
  p90Sec: number;
}

/** Header figures for the shared section: medians over its measured stops. */
export function sharedSummary(line: LineModel, stops: LineStop[]): SharedSummary | null {
  const shared = stops.filter(s => s.shared && s.stat);
  if (shared.length === 0 || !line.sharedStreet) return null;
  return {
    street: line.sharedStreet,
    scheduledSec: med(shared.map(s => s.stat!.scheduledMedianGapSec))!,
    typicalSec: med(shared.map(s => s.stat!.actualMedianGapSec))!,
    p10Sec: med(shared.map(s => s.stat!.gapP10Sec))!,
    p90Sec: med(shared.map(s => s.stat!.gapP90Sec))!,
  };
}

/** Extra wait at the first measured stop and where it peaks. */
export function extraWaitRun(stops: LineStop[]): { first: LineStop; peak: LineStop } | null {
  const m = stops.filter(s => s.stat?.excessWaitSec != null);
  if (m.length === 0) return null;
  const peak = m.reduce((a, b) => (b.stat!.excessWaitSec! > a.stat!.excessWaitSec! ? b : a));
  return { first: m[0], peak };
}

/** Running time on the line: how many measured stop pairs are within ½ min of the timetable or faster. */
export function runningTimeTally(segments: SegmentDelaySegment[], band: SegmentBand): { within: number; total: number } {
  let within = 0, total = 0;
  for (const s of segments) {
    const b = s.bands[band];
    if (s.terminal || !b || b.trips < MIN_SEGMENT_TRIPS || b.days < MIN_DAYS) continue;
    total++;
    if (b.gainedMedianSec < 30) within++;
  }
  return { within, total };
}

export interface Stretch {
  from: LineStop;
  to: LineStop;
  stops: LineStop[];
  segments: SegmentDelaySegment[];
  bounds: [number, number, number, number];
  coordinates: [number, number][];
}

/** The stretch between two stops of the line (inclusive). */
export function stretchBetween(line: LineModel, stops: LineStop[], fromIndex: number, toIndex: number): Stretch | null {
  const lo = Math.min(fromIndex, toIndex), hi = Math.max(fromIndex, toIndex);
  if (lo === hi) return null;
  const segments = line.segments.slice(lo, hi);
  const coordinates = segments.flatMap(s => s.coordinates);
  if (coordinates.length === 0) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of coordinates) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { from: stops[lo], to: stops[hi], stops: stops.slice(lo, hi + 1), segments, bounds: [w, s, e, n], coordinates };
}

/** Strip row i covers the stretch from its stop to the next row's stop (the last row looks back). */
export function stretchForRow(line: LineModel, stops: LineStop[], rows: LineStop[], i: number): Stretch | null {
  if (rows.length < 2) return null;
  const a = i < rows.length - 1 ? rows[i] : rows[i - 1];
  const b = i < rows.length - 1 ? rows[i + 1] : rows[i];
  return stretchBetween(line, stops, a.index, b.index);
}

/** Place a point on the line: the stop pair it's on and how far along (0..1). */
export function placeOnLine(line: LineModel, lonLat: [number, number], maxM = MAX_PLACE_M): { segIndex: number; frac: number; distM: number } | null {
  let best: { segIndex: number; frac: number; distM: number } | null = null;
  line.segments.forEach((seg, segIndex) => {
    const c = seg.coordinates;
    if (c.length < 2) return;
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < c.length; i++) { const d = lonLatDist(c[i - 1], c[i]); lens.push(d); total += d; }
    let run = 0;
    for (let i = 1; i < c.length; i++) {
      const [ax, ay] = c[i - 1], [bx, by] = c[i];
      const k = Math.cos((ay * Math.PI) / 180);
      const vx = (bx - ax) * k, vy = by - ay;
      const px = (lonLat[0] - ax) * k, py = lonLat[1] - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * vx + py * vy) / len2)) : 0;
      const d = lonLatDist(lonLat, [ax + (bx - ax) * t, ay + (by - ay) * t]);
      if (!best || d < best.distM) best = { segIndex, frac: total > 0 ? (run + lens[i - 1] * t) / total : 0, distM: d };
      run += lens[i - 1];
    }
  });
  return best && (best as { distM: number }).distM <= maxM ? best : null;
}

export interface LiveCar {
  id: string;
  tripId: string;
  lat: number;
  lon: number;
  tsEpoch: number | null;
}

export interface LiveGaps {
  /** Too few cars placed for the schedule, or a car on the line we can't place: gaps would be invented. */
  incomplete?: boolean;
  cars: number;
  /** Minutes between consecutive cars, front of the line first. */
  gapsMin: number[];
  scheduledSec: number | null;
}

/**
 * Gaps between the cars on the shared section right now. Each car's position
 * is turned into minutes along the line using the typical running time of each
 * stop pair in this time band (from the archive); a gap is how long the car
 * behind typically needs to reach the car ahead's spot.
 */
export function liveGaps(data: SegmentDelayData & { tripDirections?: Record<string, string[]> }, line: LineModel, stops: LineStop[], band: SegmentBand, cars: LiveCar[], nowSec: number): LiveGaps | null {
  const trips = new Set(data.tripDirections?.[String(line.directionId)] ?? []);
  if (trips.size === 0) return null;
  // Minutes from the start of the line to the start of each stop pair, at typical running time.
  const cum: number[] = [];
  let t = 0;
  for (const s of line.segments) {
    cum.push(t);
    const b = s.bands[band] ?? s.bands.all;
    t += b ? b.actualMedianSec : 0;
  }
  const known = new Set(Object.values(data.tripDirections ?? {}).flat());
  const onShared = (p: { segIndex: number } | null) => !!p && !!stops[p.segIndex]?.shared && !!stops[p.segIndex + 1]?.shared;
  const placed: number[] = [];
  let unplaceable = 0;
  for (const c of cars) {
    if (c.tsEpoch == null || nowSec - c.tsEpoch > LIVE_STALE_SEC) continue;
    const p = placeOnLine(line, [c.lon, c.lat]);
    if (!trips.has(c.tripId)) {
      // A current car on this section whose trip isn't in the timetable: we can't tell its direction,
      // so any gap around it would be wrong.
      if (!known.has(c.tripId) && onShared(p)) unplaceable++;
      continue;
    }
    if (!p || !onShared(p)) continue;
    const seg = line.segments[p.segIndex];
    const b = seg.bands[band] ?? seg.bands.all;
    placed.push(cum[p.segIndex] + p.frac * (b ? b.actualMedianSec : 0));
  }
  const sched = med(stops.filter(s => s.shared && s.stat).map(s => s.stat!.scheduledMedianGapSec));
  // Same idea as the archive's "thin" feed rule: fewer than half the cars the schedule puts on this
  // section means some aren't reporting, and a missing car would show as one long gap.
  let sharedSec = 0;
  line.segments.forEach((seg, i) => {
    if (!stops[i]?.shared || !stops[i + 1]?.shared) return;
    const b = seg.bands[band] ?? seg.bands.all;
    sharedSec += b ? b.actualMedianSec : 0;
  });
  const expected = sched ? sharedSec / sched : 0;
  if (unplaceable > 0 || (expected >= 2 && placed.length < expected / 2)) return { incomplete: true, cars: placed.length, gapsMin: [], scheduledSec: sched };
  if (placed.length < 2) return null;
  placed.sort((a, b) => b - a);
  const gapsMin = placed.slice(1).map((x, i) => Math.round((placed[i] - x) / 60));
  return { cars: placed.length, gapsMin, scheduledSec: sched };
}
