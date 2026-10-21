import { routesForYear, snapshotValue, type HistorySnapshotLike, type HistoryRouteLike } from '../../shared/historyV2Reader';
import { isDrawableLineCoordinates } from '../../shared/routeGeometry';
import { localRouteHeadwayColor } from '../components/Interval/map/routeStyle';
import type { ColorVisionMode } from './colors';

/**
 * One route drawn in History's year view (#1028 batch A). Only routes with a snapshot in the year
 * are drawn (routesForYear: no fallback to another year). The colour is that year's weekday value in
 * the shared tier colours; a limited or unknown value takes the map's no-value colour (never hidden,
 * per the reader contract). `coordinates` is the
 * snapshot's own shape when it has one; otherwise the route is drawn on today's map line.
 */
export interface HistoryYearRoute {
  routeShortName: string;
  color: string;
  /** The year's weekday minutes, or null for a limited or unknown value. */
  headway: number | null;
  coordinates?: number[][];
}

type Snapshot = HistorySnapshotLike & { geometry?: number[][] };

export function historyYearRoutes(
  agency: { routes: Array<HistoryRouteLike<Snapshot>> },
  year: number,
  colorMode: ColorVisionMode,
): HistoryYearRoute[] {
  const out: HistoryYearRoute[] = [];
  for (const { route, snapshot } of routesForYear<Snapshot, HistoryRouteLike<Snapshot>>(agency, year)) {
    const value = snapshotValue(snapshot, 'weekday');
    const headway = value.kind === 'value' ? value.min : null;
    out.push({
      routeShortName: route.routeShortName,
      headway,
      color: localRouteHeadwayColor(headway, colorMode),
      ...(isDrawableLineCoordinates(snapshot.geometry) ? { coordinates: snapshot.geometry } : {}),
    });
  }
  return out;
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
