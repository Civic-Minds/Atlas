/**
 * Which service pattern each live vehicle runs (CIV-2047, Ryan: "should we group vehicles by what part/service pattern
 * theyre running on"). A vehicle runs a card row's pattern once its trip update lists a stop only that pattern serves
 * (past the split); until then it counts only in the shared stretch. No distance rule: the stops are the route's own
 * Live analysis patterns (their stop ids), each tied to the card row whose destination its last stop names. One shared
 * calculation for the Live route card in the main app and Studio (CIV-2021), and later the MCP (CIV-2055).
 */
export interface StopPattern { stops: ReadonlyArray<{ stopId: string; name: string }> }
export interface PatternRow { key: string; headsign: string | null }

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Each card row's branch-only stops: the stops of the direction's pattern whose last stop names the row's destination
 * ("Neville Park" in "Queen St East at Neville Park Blvd"), less every stop another pattern of the direction serves.
 * A row no pattern ends at gets none (its vehicles stay in the shared stretch).
 */
export function branchOnlyStops(patterns: readonly StopPattern[], rows: readonly PatternRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const h = r.headsign ? norm(r.headsign) : '';
    if (!h) continue;
    const mine = patterns.filter(p => p.stops.length && norm(p.stops[p.stops.length - 1].name).includes(h));
    if (mine.length !== 1) continue;
    const others = new Set(patterns.filter(p => p !== mine[0]).flatMap(p => p.stops.map(s => s.stopId)));
    const only = new Set(mine[0].stops.map(s => s.stopId).filter(id => !others.has(id)));
    if (only.size) out.set(r.key, only);
  }
  return out;
}

/** The row whose branch-only stops the vehicle's upcoming stops reach; null when none, or more than one, do. */
export function patternOf(upcoming: readonly string[] | null | undefined, only: ReadonlyMap<string, ReadonlySet<string>>): string | null {
  if (!upcoming?.length) return null;
  const hits = [...only].filter(([, set]) => upcoming.some(id => set.has(id))).map(([k]) => k);
  return hits.length === 1 ? hits[0] : null;
}

/** Vehicles by pattern row; a vehicle with no branch-only stop ahead is left out (it counts in the shared stretch only). */
export function vehiclesByPattern<V extends { upcomingStops?: readonly string[] | null }>(vehicles: readonly V[], only: ReadonlyMap<string, ReadonlySet<string>>): Map<string, V[]> {
  const out = new Map<string, V[]>();
  for (const v of vehicles) {
    const k = patternOf(v.upcomingStops, only);
    if (k) (out.get(k) ?? out.set(k, []).get(k)!).push(v);
  }
  return out;
}
