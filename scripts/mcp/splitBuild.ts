/** The split release files for one agency (CIV-1840), as [path, value] pairs: the one place both the build and the tests make them. */
import { DAY_TYPES } from '../../shared/rules/days';
import { splitPaths } from '../../shared/mcpSplitStore';
import type { McpAgency, RouteSummary } from '../../shared/mcpStore';
import { currentStore, routesOn, summarize } from './atlasData';

export async function agencyFiles(a: McpAgency): Promise<Array<[string, unknown]>> {
  const store = currentStore();
  const files: Array<[string, unknown]> = [];
  const summaries: Record<string, RouteSummary[]> = {};
  for (const day of DAY_TYPES) {
    const routes = await routesOn(a, day);
    if (!routes.length) continue;
    summaries[day] = routes.map(summarize);
    for (const r of routes) files.push([splitPaths.rows(a.slug, day, r.key), r.rows]);
  }
  files.push([splitPaths.summary(a.slug), summaries], [splitPaths.stops(a.slug), await store.stops(a.slug)]);
  const cmp = await store.comparison(a.slug);
  if (cmp) files.push([splitPaths.comparison(a.slug), cmp]);
  return files;
}
