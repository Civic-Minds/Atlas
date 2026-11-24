/**
 * CIV-2073: what the cloud recorder (atlas.live.v2) polls for each Live agency, read from the lists that already hold it:
 * the archive feeds (shared/liveArchiveFeeds.ts) where an agency is archived, else its Live polling config
 * (shared/livePollingConfig.ts). Its pace is shared/rules/live.ts's. No URL, filter or pace is typed here.
 */
import { LIVE_ARCHIVE_POSITION_FEEDS, LIVE_ARCHIVE_TRIP_FEEDS, LIVE_RECORDER_ONLY_FEEDS } from './liveArchiveFeeds.js';
import { LIVE_POLLING_ROUTES } from './livePollingConfig.js';
import { LIVE_POSITIONS_ONLY_SLUGS, LIVE_RECORDER_ROUTE_IDS, livePaceSec } from './rules/live.js';

export interface LiveRecorderFeed {
  slug: string;
  positionsUrl: string;
  /** Null for a positions-only agency (LIVE_POSITIONS_ONLY_SLUGS) or one with no trip feed. */
  tripsUrl: string | null;
  /** Only vehicles whose route_id matches are kept. */
  routeFilterSource: string;
  paceSec: number;
  /** The key, by its Worker secret's name, and how the feed takes it. */
  apiKey?: { env: string; param?: string; header?: true };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idsFilter = (ids: readonly string[]) => `^(${ids.map(escapeRe).join('|')})$`;

export function liveRecorderFeed(slug: string): LiveRecorderFeed | null {
  const positionsOnly = LIVE_POSITIONS_ONLY_SLUGS.includes(slug);
  const archived = LIVE_ARCHIVE_POSITION_FEEDS.find(f => f.slug === slug);
  if (archived) {
    const trips = LIVE_ARCHIVE_TRIP_FEEDS.find(f => f.slug === slug);
    return {
      slug,
      positionsUrl: archived.url,
      tripsUrl: positionsOnly ? null : trips?.url ?? null,
      routeFilterSource: LIVE_RECORDER_ROUTE_IDS[slug] ? idsFilter(LIVE_RECORDER_ROUTE_IDS[slug]) : archived.routeFilterSource,
      paceSec: livePaceSec(slug),
      ...(archived.apiKeyHeader ? { apiKey: { env: archived.apiKeyHeader, header: true as const } } : {}),
    };
  }
  const only = LIVE_RECORDER_ONLY_FEEDS.find(f => f.slug === slug);
  if (only) return { ...only, tripsUrl: positionsOnly ? null : only.tripsUrl, paceSec: livePaceSec(slug) };
  const routes = LIVE_POLLING_ROUTES.filter(r => r.slug === slug);
  const cfg = routes[0];
  if (!cfg) return null;
  const ids = [...new Set(routes.flatMap(r => r.routeIds))];
  return {
    slug,
    positionsUrl: cfg.vehiclePositionsUrl,
    tripsUrl: positionsOnly ? null : cfg.tripUpdatesUrl,
    routeFilterSource: idsFilter(LIVE_RECORDER_ROUTE_IDS[slug] ?? ids),
    paceSec: livePaceSec(slug),
    ...(cfg.apiKeyParamEnvVar ? { apiKey: { env: cfg.apiKeyParamEnvVar, param: cfg.apiKeyParamName ?? 'apikey' } }
      : cfg.apiKeyHeaderEnvVar ? { apiKey: { env: cfg.apiKeyHeaderEnvVar, header: true as const } } : {}),
  };
}
