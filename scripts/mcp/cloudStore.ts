/**
 * The local Atlas Studio MCP's store (CIV-2014; Ryan, 2026-11-21: "Like why doesn't it read it from the cloud", then "1"):
 * published data straight from the cloud, the release the map reads (its split MCP files, read only, no key), and this
 * Mac only for files that aren't published: dry-run output (tmp/process-preview) and Studio's own files (tmp/studio).
 *
 * - An agency in the release reads the release. An agency only in tmp/process-preview reads its route file there; the
 *   tools make its summaries from the rows (scripts/mcp/atlasData.ts falls back when a ready-made piece is null).
 * - Studio's comparison and buses-needed files read tmp/studio first (what Studio's pages show), then the release.
 * - The catalog, configs, ranking lists and History come from the release.
 *
 * When the cloud can't be reached the server reads the copy on this Mac instead (scripts/mcp/atlas-mcp.ts), with
 * staleCacheNote saying when that copy is older than the latest release.
 */
import type { AtlasStore } from '../../shared/mcpStore';

/** `cloud`: the release's split store. `local`: the disk store without the release cache. */
export function cloudFirstStore(cloud: AtlasStore, local: AtlasStore): AtlasStore {
  let cloudSlugs: Promise<Set<string>> | null = null;
  const inCloud = async (slug: string) => (await (cloudSlugs ??= cloud.available())).has(slug);
  /** A ready-made piece from the release, or null for an agency only on this Mac (the tools then use its rows). */
  const fromCloud = <A extends unknown[], T>(fn: ((slug: string, ...a: A) => Promise<T | null>) | undefined) =>
    async (slug: string, ...a: A): Promise<T | null> => (fn && (await inCloud(slug)) ? fn.call(cloud, slug, ...a) : null);
  return {
    catalog: () => cloud.catalog(),
    async available() { return new Set([...(await cloud.available()), ...(await local.available())]); },
    meta: () => cloud.meta(),
    async routeFeatures(slug) { return (await inCloud(slug)) ? cloud.routeFeatures(slug) : local.routeFeatures(slug); },
    async stops(slug) { return (await inCloud(slug)) ? cloud.stops(slug) : local.stops(slug); },
    index: () => cloud.index(),
    historyIndex: slug => cloud.historyIndex(slug),
    historyRoute: (slug, i) => cloud.historyRoute(slug, i),
    async comparison(slug) { return (await local.comparison(slug)) ?? cloud.comparison(slug); },
    async vehicles(slug) { return (await local.vehicles(slug)) ?? cloud.vehicles(slug); },
    ...(local.newestFeedName ? { newestFeedName: (slug: string) => local.newestFeedName!(slug) } : {}),
    summaries: fromCloud(cloud.summaries),
    routeRows: fromCloud(cloud.routeRows),
    stopNames: fromCloud(cloud.stopNames),
    routeNames: fromCloud(cloud.routeNames),
    ...(cloud.rankAgencies ? { rankAgencies: () => cloud.rankAgencies!() } : {}),
    ...(cloud.rankWaits ? { rankWaits: (day: Parameters<NonNullable<AtlasStore['rankWaits']>>[0]) => cloud.rankWaits!(day) } : {}),
    ...(cloud.rankLabels ? { rankLabels: (slug: string) => cloud.rankLabels!(slug) } : {}),
    ...(cloud.routeNameText ? { routeNameText: () => cloud.routeNameText!() } : {}),
    evict(slug) { cloud.evict?.(slug); local.evict?.(slug); },
  };
}
