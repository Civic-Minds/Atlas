/**
 * Route identity for grouping: the trimmed short name, or `id:<routeId>` when the short name is
 * missing, empty or whitespace-only (#717). The prefix keeps a blank-named route's id from
 * colliding with another route's short name. Keys only; never display this.
 */
export function routeGroupKey(shortName: unknown, routeId: unknown): string {
  const name = typeof shortName === 'string' ? shortName.trim() : '';
  return name || `id:${String(routeId ?? '')}`;
}
