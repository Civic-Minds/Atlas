/**
 * Return the stable route key used by History snapshots.
 *
 * Most feeds provide route_short_name. Some rail feeds leave it blank but
 * still provide a route_id, so keep those routes instead of dropping them.
 */
export function historyRouteKey(properties: Record<string, unknown>): string | null {
  const shortName = String(properties.routeShortName ?? '').trim();
  if (shortName) return shortName;

  const routeId = String(properties.routeId ?? '').trim();
  return routeId || null;
}
