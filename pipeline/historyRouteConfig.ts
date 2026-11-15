/**
 * Two History route rules read from config (CIV-1481):
 *
 * - Period excludes (`config/history-period-excludes.json`, `{slug: {periodKey: [routeKeys]}}`): a route key left out of
 *   one archived period only. For another agency's route that an old feed listed as the agency's own (Brampton's 2013
 *   feed carried MiWay 103 and VIVA Orange 605). The archive keeps the values; build-history does not publish them.
 * - Identity splits (`config/history-route-identity.json`, `{slug: [routeKeys]}`): route keys that get the CIV-422 reused-
 *   number split (historyRouteIdentity.ts) even while ATLAS_HISTORY_ROUTE_IDENTITY is off for everything else. The
 *   split still runs its own test (long name changed and little of today's line ran before), so a listed key that is
 *   one route stays one route. Brampton 56: Springbrook in 2013-2015, Kingknoll from 2024, 0% of the line shared.
 *
 * Pure: the caller reads the files.
 */
export type HistoryPeriodExcludes = Record<string, Record<string, string[]>>;
export type HistoryIdentityKeys = Record<string, string[]>;

export function isPeriodExcluded(excludes: HistoryPeriodExcludes, slug: string, periodKey: string, routeKey: string): boolean {
  return excludes[slug]?.[periodKey]?.includes(routeKey) ?? false;
}

/** Whether build-history runs the identity split for this key: every key under the global flag, else only listed keys. */
export function identitySplitApplies(flagOn: boolean, keys: HistoryIdentityKeys, slug: string, routeKey: string): boolean {
  return flagOn || (keys[slug]?.includes(routeKey) ?? false);
}
