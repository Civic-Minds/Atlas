import { periodKeyForHour } from '../../shared/config';
import { routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { localRouteHeadwayColor } from '../components/Interval/map/routeStyle';
import type { ColorVisionMode } from './colors';

/**
 * CIV-2191 (Ryan: "Live shows routes as grey should we colour them based on live frequency or smth" → "Sure" to step 1):
 * each Live route's colour on the main map for the period the agency's clock is in now, from the main map's own reading
 * of the route shapes (routeFilterHeadway, the expression the map's lines are drawn with) and its tier colours. A route
 * with several shapes (branches, directions) takes its most frequent one, as its line reads where they overlap. A route
 * with no service this period, or none in the shapes, is left out (drawn grey). No rule of its own.
 */
export function liveRouteColours(
  fc: GeoJSON.FeatureCollection | undefined,
  routes: readonly string[],
  hour: number,
  mode: ColorVisionMode,
): Map<string, string> {
  const out = new Map<string, string>();
  const period = periodKeyForHour(hour);
  if (!fc || !period) return out;
  const wanted = new Set(routes);
  const best = new Map<string, number>();
  for (const f of fc.features) {
    const p = f.properties as Record<string, unknown> | null;
    const r = p?.routeShortName == null ? null : String(p.routeShortName);
    if (!p || !r || !wanted.has(r)) continue;
    const h = routeFilterHeadway(p, period);
    if (h != null && h < (best.get(r) ?? Infinity)) best.set(r, h);
  }
  for (const [r, h] of best) out.set(r, localRouteHeadwayColor(h, mode));
  return out;
}
