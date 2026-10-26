/**
 * Prototype (CIV-942): where delay starts, by stop. Each stop gets the typical minutes vehicles add between the previous
 * stop and this one (the analysis's build-up stretches, for the chosen time of day). Stops where vehicles are already late
 * but not getting later add nothing, so they stay cool. Terminal stretches (loop and layover time), stretches with too
 * few trips and the less exact first stops are left out, as everywhere else in Live.
 */
import { LIVE_DASHBOARD_UNCERTAIN_START, type DashboardBand, type LiveV3, type UncertainStart } from '../../../shared/liveDashboard';
import { titleCase } from '../../utils/format';

/** The analysis's own minimum: a stretch with fewer runs is listed but never ranked (shared/stopDelay.ts MIN_SAMPLES). */
export const HEAT_MIN_TRIPS = 30;

export interface HeatPoint {
  stopId: string;
  directionId: number;
  name: string;
  lonLat: [number, number];
  /** Typical minutes added since the previous stop, never below 0 (trip-weighted across routes that share the stop). */
  addedMin: number;
  /** Trips behind the figure. */
  n: number;
  routes: string[];
}

/** The stops whose figures are less exact (vehicles report their location less often there), per direction. */
function lessExactStops(v3: LiveV3, band: DashboardBand, uncertain: readonly UncertainStart[]): Set<string> {
  const out = new Set<string>();
  for (const u of uncertain) for (const s of v3.bands[band].stops) if (s.directionId === u.directionId && s.order >= 0 && s.order < u.stops) out.add(`${s.directionId}|${s.stopId}`);
  return out;
}

/**
 * One point per stop (a stop id is one side of the street, so one direction). `routes` maps a route name to its analysis; `only` limits it to one direction of one
 * route (the picked route). Routes that share a stop are combined by trip-weighted mean, so a shared stop is not counted
 * twice. `uncertain` defaults to the analysis's own list of less exact starts.
 */
export function delayHeatPoints(
  routes: ReadonlyMap<string, LiveV3>,
  band: DashboardBand,
  { only = null, agency = 'ttc', uncertain = (r: string) => LIVE_DASHBOARD_UNCERTAIN_START[`${agency}::${r}`] ?? [] }: {
    only?: { route: string; directionId: number } | null; agency?: string; uncertain?: (route: string) => readonly UncertainStart[];
  } = {},
): HeatPoint[] {
  const acc = new Map<string, { sum: number; n: number; point: HeatPoint }>();
  for (const [route, v3] of routes) {
    if (only && only.route !== route) continue;
    const data = v3.bands[band];
    if (!data) continue;
    const skip = lessExactStops(v3, band, uncertain(route));
    const where = new Map(data.stops.filter(s => s.lonLat).map(s => [`${s.directionId}|${s.stopId}`, s]));
    for (const b of data.buildup) {
      if (only && only.directionId !== b.directionId) continue;
      for (const x of b.stretches) {
        if (x.terminal || x.n < HEAT_MIN_TRIPS) continue;
        const k = `${b.directionId}|${x.toStopId}`;
        if (skip.has(k) || skip.has(`${b.directionId}|${x.fromStopId}`)) continue;
        const stop = where.get(k);
        if (!stop) continue;
        const added = Math.max(0, x.medianAddedMin);
        // A stop id is one side of the street, so routes are combined by stop id (their direction numbers need not agree).
        const hit = acc.get(x.toStopId) ?? acc.set(x.toStopId, { sum: 0, n: 0, point: { stopId: x.toStopId, directionId: b.directionId, name: titleCase(stop.name), lonLat: stop.lonLat as [number, number], addedMin: 0, n: 0, routes: [] } }).get(x.toStopId)!;
        hit.sum += added * x.n;
        hit.n += x.n;
        if (!hit.point.routes.includes(route)) hit.point.routes.push(route);
      }
    }
  }
  return [...acc.values()].map(({ sum, n, point }) => ({ ...point, addedMin: Math.round((sum / n) * 10) / 10, n }));
}
