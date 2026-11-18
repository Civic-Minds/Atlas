/**
 * Pairs a schedule comparison's removed and added routes that are the same route under a differently written name
 * ("KING" before, "King" after) into one changed route (CIV-1864). The MCP's schedule_changes reads it; Studio's page
 * switches to it after the open UI-review branches merge (CIV-1868), which fixes Studio listing such a route as removed
 * and added.
 */
export interface PairableChange<D> { route: string; before: D | null; after: D | null }

/** The key two names of one route share: trimmed, case ignored. */
export const routePairKey = (route: string) => route.trim().toLowerCase();

/** The changes with each removed-and-added pair under one key merged into one change (the added side's fields, both days). */
export function pairChanges<D, C extends PairableChange<D>>(changes: readonly C[]): C[] {
  const removed = new Map(changes.filter(c => !c.after && c.before).map(c => [routePairKey(c.route), c] as const));
  const added = new Map(changes.filter(c => !c.before && c.after).map(c => [routePairKey(c.route), c] as const));
  const merged = new Set([...removed.keys()].filter(k => added.has(k)));
  const out = changes.filter(c => !merged.has(routePairKey(c.route)) || (c.before && c.after));
  for (const k of merged) { const r = removed.get(k)!, a = added.get(k)!; out.push({ ...a, before: r.before, after: a.after }); }
  return out;
}
