import { metresBetween } from './geoDistance.js';
import { LIVE_PATTERN_END_M } from './rules/live.js';

/**
 * Which service pattern each live vehicle runs (CIV-2047, Ryan: "should we group vehicles by what part/service pattern
 * theyre running on"): the route card row whose shape ends nearest the vehicle's trip end, within LIVE_PATTERN_END_M.
 * One shared calculation for the Live route card in the main app and Studio (CIV-2021), and later the MCP (CIV-2055).
 * A vehicle with no trip end, or none near a row's end, belongs to no pattern: it counts only in the route's total.
 */
export interface PatternEnd { key: string; end: [number, number] | null }

export function patternOf(tripEnd: [number, number] | null | undefined, rows: readonly PatternEnd[]): string | null {
  if (!tripEnd) return null;
  let best: { key: string; d: number } | null = null;
  for (const r of rows) {
    if (!r.end) continue;
    const d = metresBetween({ lon: tripEnd[0], lat: tripEnd[1] }, { lon: r.end[0], lat: r.end[1] });
    if (d <= LIVE_PATTERN_END_M && (!best || d < best.d)) best = { key: r.key, d };
  }
  return best?.key ?? null;
}

/** Vehicle ids by pattern key, every vehicle once at most (the unmatched ones are left out). */
export function vehiclesByPattern<V extends { id: string; tripEnd?: [number, number] | null }>(vehicles: readonly V[], rows: readonly PatternEnd[]): Map<string, V[]> {
  const out = new Map<string, V[]>();
  for (const v of vehicles) {
    const k = patternOf(v.tripEnd, rows);
    if (k) (out.get(k) ?? out.set(k, []).get(k)!).push(v);
  }
  return out;
}

/** A line's last point: a shape's end, the stop its trips finish at. */
export function lineEnd(g: GeoJSON.Geometry | null | undefined): [number, number] | null {
  if (!g) return null;
  if (g.type === 'LineString') return (g.coordinates.at(-1) as [number, number]) ?? null;
  if (g.type === 'MultiLineString') return (g.coordinates.at(-1)?.at(-1) as [number, number]) ?? null;
  return null;
}
