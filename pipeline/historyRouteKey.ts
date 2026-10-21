/**
 * Return the stable route key used by History snapshots: the single key function
 * every History writer and reader uses (refresh, every backfill, build-history).
 *
 * Order: route short name, else route_id, else long name. Most feeds provide a
 * short name. Some rail feeds leave it blank but still provide a route_id, and a
 * few provide only a long name, so keep those routes instead of dropping them.
 * Writers must call this and never skip a route because its short name is blank
 * (pipeline/__tests__/historyRouteKey.test.ts fails on a short-name skip).
 */
export function historyRouteKey(properties: Record<string, unknown>): string | null {
  const shortName = String(properties.routeShortName ?? '').trim();
  if (shortName) return shortName;

  const routeId = String(properties.routeId ?? '').trim();
  if (routeId) return routeId;

  const longName = String(properties.routeLongName ?? '').trim();
  return longName || null;
}
