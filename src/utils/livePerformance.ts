/**
 * View model for the Live route card (local proof of concept): stops in line
 * order, the gap strip, the shared-section summary, stretches, and the
 * "Right now" gaps between the vehicles currently on the line.
 */
import { MIN_DAYS, MIN_SEGMENT_TRIPS, stopNameParts, type HeadwayBandStat, type HeadwayStop, type SegmentBand, type SegmentDelayData, type SegmentDelaySegment } from './segmentDelayView';

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
  // The shared section: the analysis's own list when it has one (so the header, strip and Right now
  // use one rule); otherwise stops whose stop pairs either side carry most of the line's trips.
  const sharedList = (data as { sharedSection?: Record<string, { stops: string[] }> }).sharedSection?.[String(directionId)]?.stops;
  const sharedIds = sharedList ? new Set(sharedList) : null;
  const sharedAt = (i: number) => {
    if (sharedIds) return sharedIds.has(ids[i]);
    const before = i > 0 ? tripsOf(path[i - 1]) : 0;
    const after = i < path.length ? tripsOf(path[i]) : 0;
    return Math.max(before, after) >= 0.75 * maxTrips;
  };
  const counts = new Map<string, number>();
  ids.forEach((_, i) => { if (sharedAt(i)) counts.set(stopNameParts(names[i]).street, (counts.get(stopNameParts(names[i]).street) ?? 0) + 1); });
  const sharedStreet = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const stops: LineStop[] = ids.map((stopId, index) => {
    const headway = headwayBy.get(stopId) ?? null;
    const st = stopNameParts(names[index]).street;
    return {
      stopId,
      name: names[index],
      street: st,
      // The cross street alone: the strip runs in line order, so the street is clear from context.
      label: stopNameParts(names[index]).cross,
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

/** Header figures for the shared section: the analysis pools every gap at its stops (not a median of stop ranges). */
export function sharedSummary(data: SegmentDelayData & { sharedSection?: Record<string, { bands: Record<string, GapStat | null> }> }, line: LineModel, band: SegmentBand): GapStat | null {
  const section = data.sharedSection?.[String(line.directionId)];
  const st = section?.bands?.[band] ?? null;
  if (!st || !line.sharedStreet || st.days < MIN_DAYS) return null;
  // Pooled counts include each car once per stop, so the sample minimum is tested stop by stop:
  // at least half the section's stops must have enough gaps of their own.
  const ids = new Set((section as { stops?: string[] }).stops ?? []);
  const own = line.stops.filter(s => ids.has(s.stopId));
  if (own.length === 0 || own.filter(s => stopGapStat(s, band)).length < own.length / 2) return null;
  return st;
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

/** The passing time is interpolated only between reports at most this far apart (as in the analysis). */
export const MAX_BRACKET_SEC = 150;

/** One archived snapshot: [vehicleId, tripId, lat, lon, reportedAt] per car on the route. */
export interface RecentSnapshot {
  capturedAt: number;
  v: [string, string, number, number, number][];
}

export interface LiveGaps {
  /** The feed is behind, too few cars are placed for the schedule, or a car on the line can't be placed. */
  incomplete?: boolean;
  cars: number;
  /** Minutes between consecutive cars, front of the line first; null when the car ahead's passing wasn't seen. */
  gapsMin: (number | null)[];
  scheduledSec: number | null;
}

/** Metres along the line to the start of each stop pair, and each pair's length. */
function lineMetres(line: LineModel): { start: number[]; len: number[] } {
  const start: number[] = [], len: number[] = [];
  let run = 0;
  for (const seg of line.segments) {
    let l = 0;
    for (let i = 1; i < seg.coordinates.length; i++) l += lonLatDist(seg.coordinates[i - 1], seg.coordinates[i]);
    start.push(run); len.push(l); run += l;
  }
  return { start, len };
}

/**
 * Real time gaps between the cars on the shared section now, from the last
 * 30 minutes of archived positions: a gap is how long ago the car ahead
 * passed the spot where the car behind is now. Nothing is estimated; when the
 * car ahead's passing wasn't seen, that gap is null.
 */
export function liveGaps(data: SegmentDelayData & { tripDirections?: Record<string, string[]> }, line: LineModel, stops: LineStop[], band: SegmentBand, snapshots: RecentSnapshot[], nowSec: number): LiveGaps | null {
  const trips = new Set(data.tripDirections?.[String(line.directionId)] ?? []);
  if (trips.size === 0 || snapshots.length === 0) return null;
  const sched = med(stops.filter(s => s.shared && s.stat).map(s => s.stat!.scheduledMedianGapSec));
  const latest = snapshots[snapshots.length - 1];
  // nowSec is the server's clock (the archive's), not the browser's. The archive is written every
  // minute: an old newest snapshot means the feed or the archive is behind.
  if (nowSec - latest.capturedAt > LIVE_STALE_SEC) return { incomplete: true, cars: 0, gapsMin: [], scheduledSec: sched };

  const { start, len } = lineMetres(line);
  const onShared = (segIndex: number) => !!stops[segIndex]?.shared && !!stops[segIndex + 1]?.shared;
  const along = (lon: number, lat: number) => {
    const p = placeOnLine(line, [lon, lat]);
    return p ? { m: start[p.segIndex] + p.frac * len[p.segIndex], segIndex: p.segIndex } : null;
  };
  const known = new Set(Object.values(data.tripDirections ?? {}).flat());
  // Trips the timetable doesn't list (e.g. added buses with negative trip numbers) count in this
  // direction only when their own recent track moved 200 m or more forward along this line.
  const added = new Map<string, { m: number; t: number }[]>();
  for (const snap of snapshots) {
    for (const [id, tripId, lat, lon, t] of snap.v) {
      if (known.has(tripId)) continue;
      const a = along(lon, lat);
      if (!a) continue;
      const key = `${id}|${tripId}`;
      if (!added.has(key)) added.set(key, []);
      added.get(key)!.push({ m: a.m, t });
    }
  }
  const forward = new Set<string>(), backward = new Set<string>();
  for (const [key, tr] of added) {
    const recent = tr.filter(x => tr[tr.length - 1].t - x.t <= 600);
    if (recent.length < 2) continue;
    const moved = recent[recent.length - 1].m - recent[0].m;
    if (moved >= 200) forward.add(key);
    else if (moved <= -200) backward.add(key);
  }
  const movingOtherWay = (id: string, tripId: string) => backward.has(`${id}|${tripId}`);
  // Parked: two or more reports in the last 10 min that stay within 200 m.
  const parked = (id: string, tripId: string) => {
    const tr = added.get(`${id}|${tripId}`) ?? [];
    const recent = tr.filter(x => tr[tr.length - 1].t - x.t <= 600);
    return recent.length >= 2 && Math.max(...recent.map(x => x.m)) - Math.min(...recent.map(x => x.m)) < 200;
  };
  const inDirection = (id: string, tripId: string) => trips.has(tripId) || forward.has(`${id}|${tripId}`);

  // Each car's track on its current trip: (reported time, metres along the line).
  const tracks = new Map<string, { t: number; m: number }[]>();
  for (const snap of snapshots) {
    for (const [id, tripId, lat, lon, t] of snap.v) {
      if (!inDirection(id, tripId)) continue;
      const a = along(lon, lat);
      if (!a) continue;
      const key = `${id}|${tripId}`;
      if (!tracks.has(key)) tracks.set(key, []);
      const tr = tracks.get(key)!;
      if (!tr.length || t > tr[tr.length - 1].t) tr.push({ t, m: a.m });
    }
  }
  const now: { key: string; t: number; m: number }[] = [];
  let unplaceable = 0;
  for (const [id, tripId, lat, lon, t] of latest.v) {
    // Staleness is measured once: the car's own report time against the server clock.
    if (nowSec - t > LIVE_STALE_SEC) continue;
    const a = along(lon, lat);
    if (!inDirection(id, tripId)) {
      // A current car on this section whose direction we can't tell (an unlisted trip with too few
      // reports, or moving back and forth): the gaps either side of it would be wrong. One that
      // stayed within 200 m over 10 min is parked (standby buses wait on the line), not missing.
      if (!known.has(tripId) && a && onShared(a.segIndex) && !parked(id, tripId) && !movingOtherWay(id, tripId)) unplaceable++;
      continue;
    }
    if (a && onShared(a.segIndex)) now.push({ key: `${id}|${tripId}`, t, m: a.m });
  }
  // Same idea as the archive's "thin" feed rule: fewer than half the cars the schedule puts on the
  // section means some aren't reporting, and a missing car would show as one long gap.
  let sharedSec = 0;
  line.segments.forEach((seg, i) => {
    if (!onShared(i)) return;
    const b = seg.bands[band] ?? seg.bands.all;
    sharedSec += b ? b.actualMedianSec : 0;
  });
  const expected = sched ? sharedSec / sched : 0;
  if (unplaceable > 0 || (expected >= 2 && now.length < expected / 2)) return { incomplete: true, cars: now.length, gapsMin: [], scheduledSec: sched };
  if (now.length < 2) return null;
  now.sort((a, b) => b.m - a.m);
  const gapsMin = now.slice(1).map((car, i) => {
    const track = tracks.get(now[i].key) ?? [];
    for (let k = 1; k < track.length; k++) {
      const a = track[k - 1], b = track[k];
      if (a.m <= car.m && b.m >= car.m && b.m > a.m) {
        // Reports too far apart (the car ahead dropped out a while): don't guess when it passed.
        if (b.t - a.t > MAX_BRACKET_SEC) return null;
        const passed = a.t + ((car.m - a.m) / (b.m - a.m)) * (b.t - a.t);
        const gap = car.t - passed;
        return gap < 0 ? null : Math.round(gap / 60); // negative only from clock skew between cars
      }
    }
    return null;
  });
  return { cars: now.length, gapsMin, scheduledSec: sched };
}
