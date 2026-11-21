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

/**
 * Period-scoped key remaps (CIV-437, `config/history-period-remaps.json`, `{slug: [{key, before, to}]}`): an item filed
 * under `key` in a period whose key sorts before `before` (an 8-digit date, e.g. "20230101") is filed under `to`
 * instead. For a feed that reuses one route key for different lines over time (LA Metro rail: 804 was the Gold Line
 * until 2022 and the E Line from 2023, while Expo was 806). Every rule reads the item's ORIGINAL key, so one run can
 * swap keys ("804 before 2023 to L Gold" and "806 before 2023 to 804" do not chain). Runs before the alias fold and the
 * identity split. Pure.
 */
export type HistoryPeriodRemaps = Record<string, Array<{ key: string; before: string; to: string }>>;

export function remapKeysByPeriod<T>(
  routes: Record<string, T[]>,
  rules: HistoryPeriodRemaps[string] | undefined,
  periodKey: (item: T) => string,
): { routes: Record<string, T[]>; moved: number } {
  if (!rules?.length) return { routes, moved: 0 };
  const out: Record<string, T[]> = {};
  let moved = 0;
  for (const [key, items] of Object.entries(routes)) {
    const mine = rules.filter(r => r.key === key);
    if (mine.length === 0) { (out[key] ??= []).push(...items); continue; }
    if (items.length === 0) out[key] ??= [];
    for (const item of items) {
      const hit = mine.find(r => periodKey(item) < r.before);
      if (hit) moved++;
      (out[hit ? hit.to : key] ??= []).push(item);
    }
  }
  return { routes: out, moved };
}

/**
 * CIV-437: a remap can create a key only the sidecars have (LA Metro "L Gold": 804's pre-2023 sidecar entries). The
 * build lists only keys in the archive map, so each such key gets an empty change list, as sidecar-only keys do
 * before the remap. Returns the keys added. Mutates `archive`.
 */
export function seedSidecarOnlyKeys(archive: Record<string, unknown[]>, sidecar: Record<string, unknown[]> | undefined): string[] {
  const added: string[] = [];
  for (const key of Object.keys(sidecar ?? {})) if (!(key in archive)) { archive[key] = []; added.push(key); }
  return added;
}
