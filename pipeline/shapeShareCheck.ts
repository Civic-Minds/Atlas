/**
 * CIV-1657 (CIV-1138, #771, #1211): report-only check for a direction whose drawn shape carries
 * under half of its headsign's trips while its headline reads slower than its own time-of-day
 * values. CCTA 1 Weekday to Downtown Transit Center drew p_1440971 (12 of 31 trips) and read 32
 * against a direction running every 30: the 18-trip shape swaps one stop near the end, so the
 * #690 destination pool left it out. The feed changed and it reads right today; this catches a
 * switch back. Nothing here changes an artifact: it only reads them and the feed.
 */
import type { GtfsTrip, GtfsStopTime } from '../types/gtfs.js';
import { DAYTIME_PERIOD_KEYS } from '../shared/rules/periods.js';

export const PERIOD_KEYS_DAYTIME = DAYTIME_PERIOD_KEYS;

/** The drawn shape carries "under half" when its trips are below this share of the headsign's. */
export const MAX_DRAWN_SHARE = 0.5;
/** The drawn shape is the headsign's shape whose stops best match the row's stopOrder; below this Jaccard score the row is skipped, never guessed. */
export const MIN_SHAPE_MATCH = 0.8;

export type PeriodValues = Partial<Record<string, number | null>> | null | undefined;

/**
 * The time-of-day value the headline is compared against: midday when the row has one (the
 * headline is a daytime reading), otherwise the fastest daytime period. Null when the row has
 * no daytime period value.
 */
export function comparisonPeriodValue(headwayByPeriod: PeriodValues): { period: string; value: number } | null {
  if (!headwayByPeriod) return null;
  const midday = headwayByPeriod.midday;
  if (typeof midday === 'number' && midday > 0) return { period: 'midday', value: midday };
  let best: { period: string; value: number } | null = null;
  for (const period of PERIOD_KEYS_DAYTIME) {
    const v = headwayByPeriod[period];
    if (typeof v === 'number' && v > 0 && (best == null || v < best.value)) best = { period, value: v };
  }
  return best;
}

/** The published-data half of the rule: the headline reads slower than the row's own time-of-day value. */
export function headlineSlowerThanPeriods(headway: unknown, headwayByPeriod: PeriodValues): boolean {
  const cmp = comparisonPeriodValue(headwayByPeriod);
  return typeof headway === 'number' && cmp != null && headway > cmp.value;
}

export interface ShapeShareInput {
  headway: number | null | undefined;
  headwayByPeriod: PeriodValues;
  drawnShapeTrips: number;
  headsignTrips: number;
}

export interface ShapeShareFlag {
  share: number;
  drawnShapeTrips: number;
  headsignTrips: number;
  headway: number;
  period: string;
  periodValue: number;
  /** headline / period value, for sorting. */
  ratio: number;
}

/** Both halves: drawn shape under half the headsign's trips, and the headline slower than its time-of-day value. */
export function checkShapeShare(input: ShapeShareInput): ShapeShareFlag | null {
  const { headway, headwayByPeriod, drawnShapeTrips, headsignTrips } = input;
  if (typeof headway !== 'number' || headsignTrips <= 0) return null;
  if (drawnShapeTrips >= headsignTrips * MAX_DRAWN_SHARE) return null;
  const cmp = comparisonPeriodValue(headwayByPeriod);
  if (cmp == null || headway <= cmp.value) return null;
  return {
    share: drawnShapeTrips / headsignTrips,
    drawnShapeTrips,
    headsignTrips,
    headway,
    period: cmp.period,
    periodValue: cmp.value,
    ratio: headway / cmp.value,
  };
}

export interface DrawnShapeShare {
  drawnShapeId: string;
  matchScore: number;
  drawnShapeTrips: number;
  headsignTrips: number;
  /** Trips per shape, largest first, for the report. */
  shapes: Array<{ shapeId: string; trips: number }>;
}

export type ShareResult = { ok: true; value: DrawnShapeShare } | { ok: false; reason: string };

/**
 * Count one row's headsign trips by shape on the active services, and find the drawn shape by
 * matching each shape's stop list (its longest trip's) against the row's published stopOrder.
 */
export function drawnShapeShare(input: {
  trips: readonly GtfsTrip[];
  stopIdsByTrip: ReadonlyMap<string, readonly string[]>;
  activeServiceIds: ReadonlySet<string>;
  routeIds: ReadonlySet<string>;
  directionId: number;
  headsign: string | null | undefined;
  stopOrder: readonly string[];
  /** Child stop -> parent station, so a published parent id matches its platforms. */
  parentOf?: ReadonlyMap<string, string>;
}): ShareResult {
  const { trips, stopIdsByTrip, activeServiceIds, routeIds, directionId, stopOrder, parentOf } = input;
  const headsign = input.headsign?.trim() ?? '';
  const rowTrips = trips.filter(t => routeIds.has(t.route_id)
    && activeServiceIds.has(t.service_id)
    && Number(t.direction_id ?? 0) === directionId
    && (t.trip_headsign?.trim() ?? '') === headsign);
  if (rowTrips.length === 0) return { ok: false, reason: 'no matching headsign trips on the day' };
  const byShape = new Map<string, GtfsTrip[]>();
  for (const t of rowTrips) {
    const key = t.shape_id?.trim() || '';
    if (!key) continue;
    const list = byShape.get(key) ?? [];
    list.push(t);
    byShape.set(key, list);
  }
  if (byShape.size === 0) return { ok: false, reason: 'trips carry no shape_id' };
  const drawn = new Set(stopOrder);
  const norm = (id: string) => (drawn.has(id) ? id : parentOf?.get(id) ?? id);
  let best: { shapeId: string; score: number } | null = null;
  for (const [shapeId, list] of byShape) {
    let longest: readonly string[] = [];
    for (const t of list) {
      const ids = stopIdsByTrip.get(t.trip_id) ?? [];
      if (ids.length > longest.length) longest = ids;
    }
    const own = new Set(longest.map(norm));
    let inter = 0;
    for (const id of own) if (drawn.has(id)) inter++;
    const union = own.size + drawn.size - inter;
    const score = union === 0 ? 0 : inter / union;
    if (best == null || score > best.score) best = { shapeId, score };
  }
  if (best == null || best.score < MIN_SHAPE_MATCH) return { ok: false, reason: `no shape matches the drawn stops (best ${best?.score.toFixed(2) ?? '0'})` };
  const shapes = [...byShape].map(([shapeId, list]) => ({ shapeId, trips: list.length })).sort((a, b) => b.trips - a.trips);
  return {
    ok: true,
    value: {
      drawnShapeId: best.shapeId,
      matchScore: best.score,
      drawnShapeTrips: byShape.get(best.shapeId)!.length,
      headsignTrips: rowTrips.length,
      shapes,
    },
  };
}

/** trip_id -> stop ids in stop_sequence order. */
export function stopIdsByTrip(stopTimes: readonly GtfsStopTime[], tripIds?: ReadonlySet<string>): Map<string, string[]> {
  const rows = new Map<string, Array<{ seq: number; stopId: string }>>();
  for (const st of stopTimes) {
    if (tripIds && !tripIds.has(st.trip_id)) continue;
    const list = rows.get(st.trip_id) ?? [];
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id });
    rows.set(st.trip_id, list);
  }
  const out = new Map<string, string[]>();
  for (const [tripId, list] of rows) out.set(tripId, list.sort((a, b) => a.seq - b.seq).map(r => r.stopId));
  return out;
}

export interface ShapeShareReportRow extends ShapeShareFlag {
  slug: string;
  route: string;
  directionId: number;
  day: string;
  headsign: string | null;
  drawnShapeId: string;
  shapes: Array<{ shapeId: string; trips: number }>;
}

export function formatShapeShareLine(row: ShapeShareReportRow): string {
  return `${row.slug} ${row.route} d${row.directionId} ${row.day} to ${row.headsign ?? '(no headsign)'}: `
    + `drawn shape ${row.drawnShapeId} carries ${row.drawnShapeTrips} of ${row.headsignTrips} trips; `
    + `headline ${row.headway} vs ${row.period} ${row.periodValue}`;
}
