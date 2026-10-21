import { routesForYear, shapeForYear, snapshotValue, type HistoryShapesFile, type HistorySnapshotLike, type HistoryRouteLike, type SnapshotValue } from '../../shared/historyV2Reader';
import type { HeadwayByPeriod } from '../../shared/config';
import type { TimePeriod } from '../hooks/useIntervalStats';
import { isDrawableLineCoordinates } from '../../shared/routeGeometry';
import { localRouteHeadwayColor } from '../components/Interval/map/routeStyle';
import type { ColorVisionMode } from './colors';

/**
 * One route drawn in History's year view (#1028 batch A). Only routes with a snapshot in the year
 * are drawn (routesForYear: no fallback to another year). The colour is that year's weekday value in
 * the shared tier colours; a limited or unknown value takes the map's no-value colour (never hidden,
 * per the reader contract). `coordinates` is that year's own line from the shapes file (CIV-456) when it
 * has one; otherwise, and always for the latest year, the route is drawn on today's map line.
 */
export interface HistoryYearRoute {
  routeShortName: string;
  color: string;
  /** The year's weekday minutes, or null for a limited or unknown value. */
  headway: number | null;
  /** That year's own line (shapeForYear); absent = drawn on today's map line. */
  coordinates?: number[][];
  /** The line is drawn from the stop order (straight links between stops), not a published shape. */
  approximate?: boolean;
}

type Snapshot = HistorySnapshotLike & { headwayByPeriod?: HeadwayByPeriod };

/** What History shows: a time period ('all' = the weekday all-day value) and a frequency limit (Infinity = All). */
export interface HistoryView {
  period: TimePeriod;
  maxHeadway: number;
}
export const HISTORY_VIEW_ALL: HistoryView = { period: 'all', maxHeadway: Infinity };

/**
 * A snapshot's value in a period (CIV-389): 'all' is the weekday all-day value (snapshotValue);
 * a period reads the snapshot's own per-period headway (v2 rep.p, else the v1 headwayByPeriod).
 * A period the snapshot doesn't have is blank, never borrowed from another period or day.
 */
export function historyPeriodValue(snapshot: Snapshot, period: TimePeriod): SnapshotValue {
  if (period === 'all') return snapshotValue(snapshot, 'weekday');
  const min = snapshot.v2?.rep?.p?.[period] ?? snapshot.headwayByPeriod?.[period];
  return typeof min === 'number' && Number.isFinite(min) && min > 0 ? { kind: 'value', min } : { kind: 'blank' };
}

/**
 * Whether a value passes the frequency limit (CIV-392), by the map filter's comparison (frequency at
 * or under the limit). "All" passes everything; a limited or unknown value fails any limit.
 */
export function passesHistoryLimit(value: SnapshotValue, maxHeadway: number): boolean {
  if (!Number.isFinite(maxHeadway)) return true;
  return value.kind === 'value' && value.min <= maxHeadway;
}

export function historyYearRoutes(
  agency: { routes: Array<HistoryRouteLike<Snapshot>> },
  year: number,
  colorMode: ColorVisionMode,
  view: HistoryView = HISTORY_VIEW_ALL,
  /** The agency's per-year shapes file (CIV-456), or null when there is none. */
  shapes: HistoryShapesFile | null = null,
  /** The latest year: it uses today's map lines, as the map does, so no year shape is read for it. */
  latestYear?: number,
): HistoryYearRoute[] {
  const out: HistoryYearRoute[] = [];
  for (const { route, snapshot } of routesForYear<Snapshot, HistoryRouteLike<Snapshot>>(agency, year)) {
    const value = historyPeriodValue(snapshot, view.period);
    if (!passesHistoryLimit(value, view.maxHeadway)) continue;
    const headway = value.kind === 'value' ? value.min : null;
    out.push({
      routeShortName: route.routeShortName,
      headway,
      color: localRouteHeadwayColor(headway, colorMode),
      // The year's own line when it has one (not for the latest year); otherwise today's map line.
      // Snapshots' old v1 `geometry` is not used (reader contract).
      ...yearShape(shapes, route.routeShortName, year, latestYear),
    });
  }
  return out;
}

function yearShape(shapes: HistoryShapesFile | null, routeKey: string, year: number, latestYear?: number): { coordinates?: number[][]; approximate?: boolean } {
  if (year === latestYear) return {};
  const shape = shapeForYear(shapes, routeKey, year);
  return shape.kind === 'shape' && isDrawableLineCoordinates(shape.coordinates)
    ? { coordinates: shape.coordinates, ...(shape.approximate ? { approximate: true } : {}) }
    : {};
}

/** The year's routes drawn on today's map lines (those without their own shape). */
export function onTodaysLines(routes: readonly HistoryYearRoute[]): HistoryYearRoute[] {
  return routes.filter(r => !r.coordinates);
}

/** A MapLibre colour for an agency's tile lines: each year route's colour by route number. */
export function historyYearColorExpression(routes: readonly HistoryYearRoute[], fallback: unknown): unknown {
  const tiled = onTodaysLines(routes);
  if (tiled.length === 0) return fallback;
  return ['match', ['to-string', ['get', 'routeShortName']], ...tiled.flatMap(r => [r.routeShortName, r.color]), fallback];
}
