/** The split release files (CIV-1840), as [path, value] pairs: the one place both the build and the tests make them. */
import { DAY_TYPES } from '../../shared/rules/days';
import { splitPaths, type SplitRows, type SplitStop } from '../../shared/mcpSplitStore';
import type { AtlasStore, IndexedAgency, McpAgency, McpHistoryAgency } from '../../shared/mcpStore';
import { currentStore, labelsOf, rankAgencyOf, routesOn, summarize, waitsOf } from './atlasData';

type Files = Array<[string, unknown]>;

/** One agency's files: a summary per day, each route's rows with its stop names, its stops, its route names and its comparison. */
export async function agencyFiles(a: McpAgency): Promise<Files> {
  const store = currentStore();
  const stops = (await store.stops(a.slug)) ?? [];
  const stopName = new Map(stops.map(s => [s.id, s.name]));
  const files: Files = [];
  const routeNames = new Map<string, [string, string, string | null, string]>();
  for (const day of DAY_TYPES) {
    const routes = await routesOn(a, day);
    files.push([splitPaths.summary(a.slug, day), routes.map(summarize)]);
    for (const r of routes) {
      const names: Record<string, string> = {};
      for (const row of r.rows) for (const id of (row.stopOrder as string[] | undefined) ?? []) { const n = stopName.get(id); if (n != null) names[id] = n; }
      files.push([splitPaths.rows(a.slug, day, r.key), { rows: r.rows.map(row => ({ ...row })), names } satisfies SplitRows]);
      for (const row of r.rows) routeNames.set(String(row.routeId), [String(row.routeId), r.name, r.longName, r.mode]);
    }
  }
  files.push([splitPaths.routeNames(a.slug), [...routeNames.values()]]);
  files.push([splitPaths.stops(a.slug), stops.map((s): SplitStop => [s.id, s.name, s.lon, s.lat, s.routeIds])]);
  const cmp = await store.comparison(a.slug);
  if (cmp) files.push([splitPaths.comparison(a.slug), cmp]);
  return files;
}

/** The catalog with only the fields the tools use (the config behind it is about 90 fields an agency). */
export const slimCatalog = (catalog: McpAgency[]): McpAgency[] => catalog.map(a => ({
  slug: a.slug, name: a.name, ...(a.region != null ? { region: a.region } : {}), ...(a.cities ? { cities: a.cities } : {}),
  ...(a.lastFeedExpiry != null ? { lastFeedExpiry: a.lastFeedExpiry } : {}), ...(a.lastRefreshedAt != null ? { lastRefreshedAt: a.lastRefreshedAt } : {}),
  ...(a.betaOnly ? { betaOnly: a.betaOnly } : {}), ...(a.center ? { center: a.center } : {}),
}));

/** The ranking files from the index: the agency list, each day's waits, each agency's route names, and the weekday route-name text. */
export function rankFiles(index: IndexedAgency[]): Files {
  const files: Files = [[splitPaths.rankAgencies, index.map(rankAgencyOf)]];
  for (const day of DAY_TYPES) files.push([splitPaths.rankWaits(day), Object.fromEntries(index.map(a => [a.slug, waitsOf(a.days[day] ?? [])]))]);
  for (const a of index) files.push([splitPaths.rankLabels(a.slug), Object.fromEntries(DAY_TYPES.filter(d => a.days[d]).map(d => [d, labelsOf(a.days[d]!)]))]);
  files.push([splitPaths.routeNameText, Object.fromEntries(index.map(a => [a.slug, labelsOf(a.days.Weekday ?? []).map(([route, name]) => `${route}${name ? ` ${name}` : ''}`).join('\n')]))]);
  return files;
}

/** History per agency: the list of its routes, then one file a route. */
export function historyFiles(history: McpHistoryAgency[]): Files {
  const files: Files = [];
  for (const ag of history) {
    files.push([splitPaths.historyIndex(ag.slug), ag.routes.map(r => [r.routeShortName, r.routeName ?? null])]);
    ag.routes.forEach((r, i) => files.push([splitPaths.historyRoute(ag.slug, i), r]));
  }
  return files;
}

export type { AtlasStore };
