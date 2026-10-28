/**
 * History v2 per-year route shapes (pure; the v2 backfill writes, the v2 build compiles).
 *
 *  1. extractRouteShapes: one representative line per route key from a parsed GTFS feed.
 *     shapes.txt via trips.shape_id; a feed (or route) with no usable shape gets a line through the
 *     stops of its representative trip, marked approximate.
 *  2. prepareShape: Douglas-Peucker at HISTORY_SHAPE_TOLERANCE_M, then rounded, so the stored line
 *     is small and identical lines compare equal.
 *  3. buildPeriodShapes: one immutable object per archived period (history-v2-shapes/{slug}/{periodKey}.json).
 *  4. compileAgencyShapes: the public per-agency file; every distinct line is stored once and each
 *     year's route points at it (content-hash dedupe).
 *
 * Nothing here runs unless ATLAS_HISTORY_V2=1 builds or the v2 backfill is run with --shapes.
 */
import { createHash } from 'node:crypto';
import type { HistoryPeriodShapes, HistoryShapeLine, HistoryShapesFile, ShapeTripStats } from '../shared/historyV2.js';
import { simplifyLine } from './geometry.js';
import { historyRouteKey } from './historyRouteKey.js';
import { haversineDistance } from './utils.js';

/** Douglas-Peucker tolerance in METRES for stored History shapes (single place to change it). */
export const HISTORY_SHAPE_TOLERANCE_M = 15;
/** Coordinate decimals (5 = about 1.1 m). */
export const HISTORY_SHAPE_DECIMALS = 5;
/** A shape shorter than this share of the route's longest shape is a short turn and is never the representative. */
export const SHORT_TURN_LEN_RATIO = 0.75;

export interface ShapeFeedInput {
  routes: ReadonlyArray<{ route_id: string; route_short_name?: string; route_long_name?: string }>;
  trips: ReadonlyArray<{ route_id: string; trip_id: string; direction_id?: string; shape_id?: string }>;
  /** parseGtfsZip shape points are [lat, lon]. */
  shapes: ReadonlyArray<{ id: string; points: ReadonlyArray<readonly [number, number]> }>;
  stops: ReadonlyArray<{ stop_id: string; stop_lat: string | number; stop_lon: string | number }>;
  stopTimes: ReadonlyArray<{ trip_id: string; stop_id: string; stop_sequence: string | number }>;
}

export interface RouteShape {
  /** [lon, lat], full resolution (not yet simplified or rounded). */
  coordinates: number[][];
  /** True when built from the representative trip's stop order (no shapes.txt line for the route). */
  approximate: boolean;
}

function lineLengthM(pts: ReadonlyArray<readonly [number, number]>): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversineDistance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return total;
}

const dirOf = (d: string | undefined): string => String(d ?? '0');
const byNumber = (a: string, b: string): number => (Number(a) - Number(b)) || a.localeCompare(b);

/**
 * One representative line per History route key (same key function as the snapshots, v2 long-name fallback on).
 *
 * Choice (mirrors historyGeometry.ts: direction 0, and shape-selection.ts: no short turns):
 *  - pool the trips of every route_id that maps to the key, take direction 0 (else the lowest direction that has a shape);
 *  - among its shapes drop short turns (< SHORT_TURN_LEN_RATIO of the longest), then take the one most trips use
 *    (ties: longer, then shape_id);
 *  - no usable shape in any direction: the line through the stops of the direction-0 trip that serves the most stops
 *    (stop_sequence order), flagged approximate. Fewer than 2 located stops = no entry (the year has no shape).
 */
export function extractRouteShapes(feed: ShapeFeedInput): Map<string, RouteShape> {
  const keyByRouteId = new Map<string, string>();
  for (const r of feed.routes) {
    const key = historyRouteKey({ routeShortName: r.route_short_name, routeId: r.route_id, routeLongName: r.route_long_name }, { longNameFallback: true });
    if (key) keyByRouteId.set(r.route_id, key);
  }
  const shapeById = new Map<string, ReadonlyArray<readonly [number, number]>>();
  const shapeLen = new Map<string, number>();
  for (const s of feed.shapes) {
    if (s.points.length >= 2) shapeById.set(s.id, s.points);
  }
  // key -> direction -> { shape_id -> trip count, trip ids }
  const byKey = new Map<string, Map<string, { shapes: Map<string, number>; trips: string[] }>>();
  for (const t of feed.trips) {
    const key = keyByRouteId.get(t.route_id);
    if (!key) continue;
    let dirs = byKey.get(key);
    if (!dirs) { dirs = new Map(); byKey.set(key, dirs); }
    const d = dirOf(t.direction_id);
    let e = dirs.get(d);
    if (!e) { e = { shapes: new Map(), trips: [] }; dirs.set(d, e); }
    e.trips.push(t.trip_id);
    if (t.shape_id && shapeById.has(t.shape_id)) e.shapes.set(t.shape_id, (e.shapes.get(t.shape_id) ?? 0) + 1);
  }
  const lenOf = (sid: string): number => {
    let l = shapeLen.get(sid);
    if (l === undefined) { l = lineLengthM(shapeById.get(sid)!); shapeLen.set(sid, l); }
    return l;
  };

  const out = new Map<string, RouteShape>();
  const needStops = new Map<string, string[]>(); // key -> trip ids of the direction to derive from
  for (const [key, dirs] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const order = [...dirs.keys()].sort(byNumber);
    const withShape = order.find(d => dirs.get(d)!.shapes.size > 0);
    if (withShape !== undefined) {
      const e = dirs.get(withShape)!;
      const cands = [...e.shapes.entries()].map(([sid, trips]) => ({ sid, trips, len: lenOf(sid) }));
      const maxLen = Math.max(...cands.map(c => c.len));
      const full = cands.filter(c => c.len >= maxLen * SHORT_TURN_LEN_RATIO);
      full.sort((a, b) => b.trips - a.trips || b.len - a.len || a.sid.localeCompare(b.sid));
      const pick = full[0];
      out.set(key, { coordinates: shapeById.get(pick.sid)!.map(([lat, lon]) => [lon, lat]), approximate: false });
    } else {
      needStops.set(key, dirs.get(order[0])!.trips);
    }
  }
  if (needStops.size === 0) return out;

  // Fallback: representative trip per key = the one with the most stop_times rows.
  const wanted = new Set<string>();
  for (const trips of needStops.values()) for (const id of trips) wanted.add(id);
  const rowCount = new Map<string, number>();
  for (const st of feed.stopTimes) if (wanted.has(st.trip_id)) rowCount.set(st.trip_id, (rowCount.get(st.trip_id) ?? 0) + 1);
  const repTripByKey = new Map<string, string>();
  for (const [key, trips] of needStops) {
    let best: string | undefined;
    for (const id of trips) {
      const c = rowCount.get(id) ?? 0;
      if (c > 0 && (best === undefined || c > (rowCount.get(best) ?? 0) || (c === (rowCount.get(best) ?? 0) && id < best))) best = id;
    }
    if (best) repTripByKey.set(key, best);
  }
  const repTrips = new Set(repTripByKey.values());
  const rows = new Map<string, Array<{ seq: number; stop: string }>>();
  for (const st of feed.stopTimes) {
    if (!repTrips.has(st.trip_id)) continue;
    const list = rows.get(st.trip_id) ?? [];
    list.push({ seq: Number(st.stop_sequence), stop: st.stop_id });
    rows.set(st.trip_id, list);
  }
  const stopXY = new Map<string, [number, number]>();
  for (const s of feed.stops) {
    const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) stopXY.set(s.stop_id, [lon, lat]);
  }
  for (const [key, tripId] of [...repTripByKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const line: number[][] = [];
    for (const r of (rows.get(tripId) ?? []).sort((a, b) => a.seq - b.seq)) {
      const xy = stopXY.get(r.stop);
      if (xy && (line.length === 0 || line[line.length - 1][0] !== xy[0] || line[line.length - 1][1] !== xy[1])) line.push([xy[0], xy[1]]);
    }
    if (line.length >= 2) out.set(key, { coordinates: line, approximate: true });
  }
  return out;
}

const M_PER_DEG_LAT = 111_320;

/**
 * Douglas-Peucker in metres (a local equirectangular projection, so the tolerance means the same thing at any
 * latitude), reusing geometry.ts simplifyLine; then rounding. Returns null when fewer than 2 distinct
 * vertices remain. Endpoints are always kept.
 */
export function prepareShape(
  coords: ReadonlyArray<ReadonlyArray<number>>,
  opts: { toleranceM?: number; decimals?: number } = {},
): HistoryShapeLine | null {
  const toleranceM = opts.toleranceM ?? HISTORY_SHAPE_TOLERANCE_M;
  const decimals = opts.decimals ?? HISTORY_SHAPE_DECIMALS;
  if (coords.length < 2) return null;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LAT;
  const projected = coords.map((c, i) => [c[0] * kx, c[1] * M_PER_DEG_LAT, i]);
  const kept = toleranceM > 0 ? simplifyLine(projected, toleranceM) : projected;
  const f = 10 ** decimals;
  const out: HistoryShapeLine = [];
  for (const p of kept) {
    const c = coords[p[2]];
    const pt = [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f];
    const last = out[out.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
  }
  return out.length >= 2 ? out : null;
}

/** Stable content hash of a prepared line (build-time dedupe key; the public file refers to lines by index). */
export function shapeHash(line: HistoryShapeLine): string {
  return createHash('sha256').update(JSON.stringify(line)).digest('hex').slice(0, 16);
}

export function periodShapesKey(slug: string, periodKey: string): string {
  return `history-v2-shapes/${slug}/${periodKey}.json`;
}

/** One archived period's prepared shapes (immutable object). Routes with no shape are simply absent. */
/** How many of a feed's trips have a blank shape_id, or one with no line in shapes.txt (CIV-843). */
export function shapeTripStats(feed: Pick<ShapeFeedInput, 'trips' | 'shapes'>): ShapeTripStats {
  const known = new Set(feed.shapes.filter(s => s.points.length >= 2).map(s => s.id));
  const stats: ShapeTripStats = { total: 0, emptyShapeId: 0, unknownShapeId: 0 };
  for (const t of feed.trips) {
    stats.total++;
    const id = (t.shape_id ?? '').trim();
    if (!id) stats.emptyShapeId++;
    else if (!known.has(id)) stats.unknownShapeId++;
  }
  return stats;
}

export function buildPeriodShapes(
  slug: string, periodKey: string, refDate: string, extracted: Map<string, RouteShape>,
  opts: { toleranceM?: number; decimals?: number; trips?: ShapeTripStats } = {},
): HistoryPeriodShapes {
  const routes: HistoryPeriodShapes['routes'] = {};
  for (const [key, s] of [...extracted.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const c = prepareShape(s.coordinates, opts);
    if (c) routes[key] = s.approximate ? { c, a: true } : { c };
  }
  return {
    version: 1, slug, periodKey, refDate,
    decimals: opts.decimals ?? HISTORY_SHAPE_DECIMALS,
    toleranceM: opts.toleranceM ?? HISTORY_SHAPE_TOLERANCE_M,
    routes,
    ...(opts.trips ? { trips: opts.trips } : {}),
  };
}

/** A kept snapshot that should get a shape: the route key, its year, and the period it came from. */
export interface ShapeRouteYear {
  routeKey: string;
  year: number;
  periodKey: string;
  /** Keys to try in that period's shapes, in order (canonical key first, then aliased old keys). */
  lookupKeys?: string[];
}

export interface CompileStats {
  routeYears: number;
  withShape: number;
  /** Route-years with no stored shape (no shape in the feed, or no shapes object for the period). */
  noShape: number;
  distinctShapes: number;
  /** Route-years sharing a stored line with an earlier route-year. */
  reused: number;
  /** Periods named by a snapshot whose shapes object was not supplied (counted as noShape). */
  missingPeriods: string[];
}

/**
 * The public agency file: every distinct line once, each (year, route) referencing it. Years come from the
 * kept snapshots, so the line is the one from the same feed as that year's headway. Deterministic:
 * shapes are numbered in order of first use over (year, route key) sorted order. Mixed tolerance/decimals
 * across period objects are rejected (they were built with different settings; rebuild them).
 */
export function compileAgencyShapes(
  slug: string,
  periods: ReadonlyMap<string, HistoryPeriodShapes>,
  routeYears: ReadonlyArray<ShapeRouteYear>,
): { file: HistoryShapesFile; stats: CompileStats } {
  const settings = new Set([...periods.values()].map(p => `${p.toleranceM}/${p.decimals}`));
  if (settings.size > 1) throw new Error(`${slug}: shapes objects were built with different tolerance/decimals (${[...settings].join(', ')})`);
  const [toleranceM, decimals] = settings.size === 1
    ? [...settings][0].split('/').map(Number)
    : [HISTORY_SHAPE_TOLERANCE_M, HISTORY_SHAPE_DECIMALS];

  const indexByHash = new Map<string, number>();
  const shapes: HistoryShapeLine[] = [];
  const approx = new Set<number>();
  const years: Record<string, Record<string, number>> = {};
  const stats: CompileStats = { routeYears: 0, withShape: 0, noShape: 0, distinctShapes: 0, reused: 0, missingPeriods: [] };
  const missing = new Set<string>();

  const sorted = [...routeYears].sort((a, b) => a.year - b.year || a.routeKey.localeCompare(b.routeKey, undefined, { numeric: true }));
  for (const ry of sorted) {
    stats.routeYears++;
    const period = periods.get(ry.periodKey);
    if (!period) { missing.add(ry.periodKey); stats.noShape++; continue; }
    let rec: HistoryPeriodShapes['routes'][string] | undefined;
    for (const k of ry.lookupKeys ?? [ry.routeKey]) { rec = period.routes[k]; if (rec) break; }
    if (!rec) { stats.noShape++; continue; }
    const h = shapeHash(rec.c);
    let idx = indexByHash.get(h);
    if (idx === undefined) {
      idx = shapes.length;
      indexByHash.set(h, idx);
      shapes.push(rec.c);
      if (rec.a) approx.add(idx);
    } else {
      if (JSON.stringify(shapes[idx]) !== JSON.stringify(rec.c)) throw new Error(`${slug}: shape hash collision ${h}`);
      stats.reused++;
    }
    (years[String(ry.year)] ??= {})[ry.routeKey] = idx;
    stats.withShape++;
  }
  stats.distinctShapes = shapes.length;
  stats.missingPeriods = [...missing].sort();
  const file: HistoryShapesFile = { version: 1, slug, decimals, toleranceM, shapes, ...(approx.size ? { approx: [...approx].sort((a, b) => a - b) } : {}), years };
  return { file, stats };
}

/** One History year whose route lines are partly missing or drawn from the stop order (CIV-843). */
export interface ShapeGap {
  slug: string;
  year: number;
  periodKeys: string[];
  routes: number;
  /** Route-years with a real shapes.txt line. */
  shaped: number;
  /** Drawn as straight links between stops. */
  approximate: number;
  /** No line at all (no shape and too few located stops, or the period's shapes object is missing). */
  none: number;
  /** Summed over the year's periods that recorded trip counts; null when none did (written before CIV-843). */
  trips: ShapeTripStats | null;
}

/**
 * The years about to be published whose routes would lose their real line (CIV-843; MBTA 2010-2012, STM 2013-2014):
 * any route-year drawn from the stop order or not drawn, or any trip without a usable shape_id. Same lookups as
 * compileAgencyShapes, so it reports exactly what the published file will hold.
 */
export function shapeGaps(
  slug: string,
  periods: ReadonlyMap<string, HistoryPeriodShapes>,
  routeYears: ReadonlyArray<ShapeRouteYear>,
): ShapeGap[] {
  const byYear = new Map<number, ShapeGap>();
  for (const ry of routeYears) {
    let gap = byYear.get(ry.year);
    if (!gap) { gap = { slug, year: ry.year, periodKeys: [], routes: 0, shaped: 0, approximate: 0, none: 0, trips: null }; byYear.set(ry.year, gap); }
    gap.routes++;
    if (!gap.periodKeys.includes(ry.periodKey)) {
      gap.periodKeys.push(ry.periodKey);
      const t = periods.get(ry.periodKey)?.trips;
      if (t) gap.trips = { total: (gap.trips?.total ?? 0) + t.total, emptyShapeId: (gap.trips?.emptyShapeId ?? 0) + t.emptyShapeId, unknownShapeId: (gap.trips?.unknownShapeId ?? 0) + t.unknownShapeId };
    }
    const period = periods.get(ry.periodKey);
    let rec: HistoryPeriodShapes['routes'][string] | undefined;
    for (const k of ry.lookupKeys ?? [ry.routeKey]) { rec = period?.routes[k]; if (rec) break; }
    if (!rec) gap.none++;
    else if (rec.a) gap.approximate++;
    else gap.shaped++;
  }
  return [...byYear.values()]
    .filter(g => g.approximate > 0 || g.none > 0 || (g.trips != null && g.trips.emptyShapeId + g.trips.unknownShapeId > 0))
    .map(g => ({ ...g, periodKeys: [...g.periodKeys].sort() }))
    .sort((a, b) => a.year - b.year);
}

/** One loud build-log line per gap year. */
export function formatShapeGap(g: ShapeGap): string {
  const parts = [`${g.routes - g.shaped} of ${g.routes} routes without a real line (${g.approximate} drawn from stops, ${g.none} not drawn)`];
  if (g.trips) parts.push(`${g.trips.emptyShapeId + g.trips.unknownShapeId} of ${g.trips.total} trips without a usable shape_id (${g.trips.emptyShapeId} blank, ${g.trips.unknownShapeId} not in shapes.txt)`);
  return `WARNING shape gap ${g.slug} ${g.year}: ${parts.join('; ')}`;
}
