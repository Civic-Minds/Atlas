import { historyV2FromEnv } from './historyV2Flag.js';

export interface HistoryRouteKeyOptions {
  /**
   * Also fall back to the route long name when the short name and route_id are blank.
   * Default: on only when ATLAS_HISTORY_V2=1, so a normal refresh creates no new keys.
   */
  longNameFallback?: boolean;
}

/**
 * Return the stable route key used by History snapshots.
 *
 * Most feeds provide route_short_name. Some rail feeds leave it blank but
 * still provide a route_id, so keep those routes instead of dropping them.
 *
 * History v2 (ATLAS_HISTORY_V2=1, or `longNameFallback: true`) adds a last fallback to the
 * long name for the few feeds that provide only that. Without the flag this is exactly the
 * pre-v2 key function, so the weekly refresh and build make no new keys.
 */
export function historyRouteKey(properties: Record<string, unknown>, options: HistoryRouteKeyOptions = {}): string | null {
  const shortName = String(properties.routeShortName ?? '').trim();
  if (shortName) return shortName;

  const routeId = String(properties.routeId ?? '').trim();
  if (routeId) return routeId;

  if (options.longNameFallback ?? historyV2FromEnv()) {
    const longName = String(properties.routeLongName ?? '').trim();
    return longName || null;
  }
  return null;
}

/**
 * Route key for the legacy (mdb, gcrta, cdta, mbta, norta) backfills. Default is their
 * original behaviour: a route with a blank short name is skipped, and the key is the short
 * name as-is. With ATLAS_HISTORY_V2=1 they use the full key function instead and no longer
 * skip such routes.
 */
export function backfillRouteKey(properties: Record<string, unknown>): string | null {
  if (historyV2FromEnv()) return historyRouteKey(properties, { longNameFallback: true });
  return properties.routeShortName ? String(properties.routeShortName) : null;
}
