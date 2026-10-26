/**
 * Prototype (CIV-942): where delay starts, by stop. Each stop gets the typical minutes vehicles add between the previous
 * stop and this one (the analysis's build-up stretches, for the chosen time of day) that are still there over the next
 * HOLDS_STOPS stops: time made back right away is not a delay start (the "Where delays start" rule, shared/stopDelay.ts).
 * Stops where vehicles are already late but not getting later add nothing, so they stay cool. Terminal stretches (loop and layover time), stretches with too
 * few trips and the less exact first stops are left out, as everywhere else in Live.
 */
import { LIVE_DASHBOARD_UNCERTAIN_START, type DashboardBand, type LiveV3, type UncertainStart } from '../../../shared/liveDashboard';
import { titleCase } from '../../utils/format';
import { HOLDS_STOPS } from '../../../shared/stopDelay';

/** The analysis's own minimum: a stretch with fewer runs is listed but never ranked (shared/stopDelay.ts MIN_SAMPLES). */
export const HEAT_MIN_TRIPS = 30;

export interface HeatPoint {
  stopId: string;
  directionId: number;
  name: string;
  lonLat: [number, number];
  /** Typical minutes added since the previous stop that stay over the next stops, never below 0 (the most of the routes that share the stop). Unrounded. */
  addedMin: number;
  /** The typical minutes added since the previous stop, made back later or not (the segment card's "Typical added"). */
  rawAddedMin: number;
  /** The stretch into this stop (one route's, the busiest, when several share it). */
  fromStopId: string;
  /** Trips behind the figure (the route it comes from). */
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
 * route (the picked route). Routes that share a stop take the route that adds the most there, so a shared stop is drawn
 * once. `uncertain` defaults to the analysis's own list of less exact starts.
 */
export function delayHeatPoints(
  routes: ReadonlyMap<string, LiveV3>,
  band: DashboardBand,
  { only = null, agency = 'ttc', uncertain = (r: string) => LIVE_DASHBOARD_UNCERTAIN_START[`${agency}::${r}`] ?? [] }: {
    only?: { route: string; directionId: number } | null; agency?: string; uncertain?: (route: string) => readonly UncertainStart[];
  } = {},
): HeatPoint[] {
  const acc = new Map<string, { kept: number; raw: number; n: number; point: HeatPoint }>();
  for (const [route, v3] of routes) {
    if (only && only.route !== route) continue;
    const data = v3.bands[band];
    if (!data) continue;
    const skip = lessExactStops(v3, band, uncertain(route));
    const where = new Map(data.stops.filter(s => s.lonLat).map(s => [`${s.directionId}|${s.stopId}`, s]));
    for (const b of data.buildup) {
      if (only && only.directionId !== b.directionId) continue;
      b.stretches.forEach((x, i) => {
        if (x.terminal || x.n < HEAT_MIN_TRIPS) return;
        const k = `${b.directionId}|${x.toStopId}`;
        if (skip.has(k) || skip.has(`${b.directionId}|${x.fromStopId}`)) return;
        const stop = where.get(k);
        if (!stop) return;
        // What stays: the lowest delay over this stop and the next HOLDS_STOPS (with enough trips), above the delay before.
        const before = x.medianDelayMin - x.medianAddedMin;
        const later = b.stretches.slice(i, i + 1 + HOLDS_STOPS).filter(t => t.n >= HEAT_MIN_TRIPS).map(t => t.medianDelayMin);
        // Measured against the timetable like the "Where delays start" panel: falling back from early running counts too.
        const added = Math.max(0, Math.min(x.medianAddedMin, Math.min(...later) - before));
        // A stop id is one side of the street, so routes are combined by stop id (their direction numbers need not agree).
        const hit = acc.get(x.toStopId) ?? acc.set(x.toStopId, { kept: -1, raw: 0, n: 0, point: { stopId: x.toStopId, directionId: b.directionId, name: titleCase(stop.name), lonLat: stop.lonLat as [number, number], addedMin: 0, rawAddedMin: 0, fromStopId: x.fromStopId, n: 0, routes: [] } }).get(x.toStopId)!;
        // Routes sharing a stop: the one that adds the most (a quieter route never hides another route's delay start).
        if (added > hit.kept) { hit.kept = added; hit.raw = x.medianAddedMin; hit.n = x.n; hit.point.fromStopId = x.fromStopId; }
        if (!hit.point.routes.includes(route)) hit.point.routes.push(route);
      });
    }
  }
  // Unrounded, so the colour step is the true value's; text rounds when it shows it.
  return [...acc.values()].map(({ kept, raw, n, point }) => ({ ...point, addedMin: kept, rawAddedMin: raw, n }));
}
