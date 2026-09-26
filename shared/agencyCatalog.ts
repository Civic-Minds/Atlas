import { isAgencyVisibleInBrowser, type BrowserAgencyVisibility } from './agencyVisibility';
import type { AtlasMode } from './config';

/** Fields the browser needs; pipeline feed URLs and source credentials never ship here. */
export interface AgencyCatalogEntry extends BrowserAgencyVisibility {
  slug: string;
  name: string;
  center: [number, number];
  url?: string;
  stopsUrl?: string;
  corridorsUrl?: string;
  bbox?: [number, number, number, number];
  displayArea?: string;
  lastFeedExpiry?: string | null;
  lastRefreshedAt?: string | null;
  lastFeedCheckAt?: string | null;
  expiredFeedCheckCount?: number;
  expiredFeedCheckSince?: string | null;
  expiredFeedCheckExpiry?: string | null;
  excludeRouteShortNames?: string[];
  rolloutNotice?: string;
  rolloutIssueUrl?: string;
  pmtilesPending?: boolean;
  issueUrl?: string;
  issueUrls?: string[];
  overrideNote?: string;
  overrideNoteRoutes?: string[];
  feedReviewStatus?: 'review' | 'verified';
  feedQuality?: unknown;
  fare?: number;
  gtfsFares?: boolean;
  fareUrl?: string;
  websiteUrl?: string;
  searchAliases?: string[];
  cities?: string[];
  timezone?: string | null;
}

export interface AgencyCatalogFile {
  mode: AtlasMode;
  agencyCount: number;
  agencies: AgencyCatalogEntry[];
}

/** Build the browser catalog from the full pipeline registry without leaking source fields. */
export function buildAgencyCatalog(
  source: Array<Record<string, unknown>>,
  mode: AtlasMode,
): AgencyCatalogFile {
  const agencies = source
    .filter(agency => isAgencyVisibleInBrowser(agency, { mode }))
    .map(({ feedUrl: _feedUrl, mdbFeedUrl: _mdbFeedUrl, supplementalFeedUrls: _supplementalFeedUrls, ...agency }) => agency as unknown as AgencyCatalogEntry);

  return { mode, agencyCount: agencies.length, agencies };
}
