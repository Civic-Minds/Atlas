/**
 * Pairs a schedule comparison's removed and added routes that are the same route under a differently written name
 * ("KING" before, "King" after) into one changed route (CIV-1864). The MCP's schedule_changes reads it, and the Studio
 * file is built with it (studioBeforeAfterFile), so Studio's Schedules page no longer lists such a route as removed and
 * added.
 */
export interface PairableChange<D> { route: string; name?: string | null; before: D | null; after: D | null }

/** The key two names of one route share: trimmed, case ignored. */
export const routePairKey = (route: string) => route.trim().toLowerCase();

/**
 * The looser key for a name whose spacing or punctuation changed (#1631: HSR's "X-IND" became "X IND"): letters and
 * digits only. It pairs two routes only when their long names also match, and only one route on each side has it.
 */
export const routeLooseKey = (route: string) => route.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const sameName = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The changes with each removed-and-added pair merged into one change (the added side's fields, both days). */
export function pairChanges<D, C extends PairableChange<D>>(changes: readonly C[]): C[] {
  const removed = changes.filter(c => !c.after && c.before);
  const added = changes.filter(c => !c.before && c.after);
  const pairs = new Map<C, C>();
  const taken = new Set<C>();
  // Exact pairs first: the same name, case and outer spaces aside.
  const addedByKey = new Map(added.map(c => [routePairKey(c.route), c] as const));
  for (const r of removed) {
    const a = addedByKey.get(routePairKey(r.route));
    if (a && !taken.has(a)) { pairs.set(r, a); taken.add(a); }
  }
  // Then spacing or punctuation only, where the long names agree and the loose key is unique on both sides.
  const unique = (list: C[]) => {
    const by = new Map<string, C[]>();
    for (const c of list) { const k = routeLooseKey(c.route); by.set(k, [...(by.get(k) ?? []), c]); }
    return by;
  };
  const looseRemoved = unique(removed.filter(r => !pairs.has(r)));
  const looseAdded = unique(added.filter(a => !taken.has(a)));
  for (const [k, rs] of looseRemoved) {
    const as = looseAdded.get(k);
    if (!k || rs.length !== 1 || as?.length !== 1 || !sameName(rs[0].name, as[0].name)) continue;
    pairs.set(rs[0], as[0]); taken.add(as[0]);
  }
  const out = changes.filter(c => !pairs.has(c) && !taken.has(c));
  for (const [r, a] of pairs) out.push({ ...a, before: r.before, after: a.after });
  return out;
}
