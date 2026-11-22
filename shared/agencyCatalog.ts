import { isAgencyVisibleInBrowser, type BrowserAgencyVisibility } from './agencyVisibility';
import type { AtlasMode } from './config';
import type { SupplementalFeedMeta } from './feedAvailability';
import type { HiddenAgencyReason } from './hiddenAgencyNote';
import type { CorrectionNotice } from './correctionNotices';

/**
 * CIV-461: the agency's own data licence page, as read on `checkedOn`. `credit` is the page's own wording, verbatim,
 * and is set only where the page gives one. `unread` means the page could not be read; check it before relying on it.
 */
export interface AgencyDataLicense {
  url: string;
  attribution: 'required' | 'optional' | 'none' | 'unread';
  name?: string;
  credit?: string;
  /** The page's own words before the data's last-updated date, where it asks for one (STO: "Dernière mise à jour :"); the
   *  credit then ends with that label and the date Atlas last took the feed (lastRefreshedAt). */
  updatedLabel?: string;
  checkedOn: string;
}

/** Fields the browser needs; pipeline feed URLs, source credentials and internal notes never ship here. */
export interface AgencyCatalogEntry extends BrowserAgencyVisibility {
  slug: string;
  name: string;
  center: [number, number];
  url?: string;
  stopsUrl?: string;
  corridorsUrl?: string;
  bbox?: [number, number, number, number];
  displayArea?: string;
  /** CIV-1277: its parent agency (config/parent-agencies.json), one row in the map's agency picker. */
  parentAgency?: string;
  lastFeedExpiry?: string | null;
  /** CIV-1011: the date most routes stopped being listed with nothing replacing them (YYYYMMDD); the agency shows Ryan's notice. Absent otherwise. */
  listingEndedOn?: string | null;
  lastSupplementalFeeds?: SupplementalFeedMeta[];
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
  /** CIV-1639: Atlas's own notes about fixes to this agency's data (shared/correctionNotices.ts), shown on the routes they name. */
  correctionNotices?: CorrectionNotice[];
  /** CIV-1060: why a hidden agency shows nothing; the card shows hiddenAgencyNoteFor(hiddenReason). */
  hiddenReason?: HiddenAgencyReason;
  feedReviewStatus?: 'review' | 'verified';
  feedQuality?: unknown;
  fare?: number;
  gtfsFares?: boolean;
  fareUrl?: string;
  websiteUrl?: string;
  dataLicense?: AgencyDataLicense;
  searchAliases?: string[];
  cities?: string[];
  timezone?: string | null;
  /** CIV-251: wins over the feed's agency_timezone (see shared/agencyTimezone.ts). */
  timezoneOverride?: string;
  manualFeedSource?: boolean;
}

export interface AgencyCatalogFile {
  mode: AtlasMode;
  agencyCount: number;
  agencies: AgencyCatalogEntry[];
}

/**
 * Build the browser catalog from the full pipeline registry without leaking source fields.
 * `shortName` and `labelPlace` are read only by the agency page build, so it stays out of the catalog.
 * `internalNote` is engineering detail for maintainers (CIV-1060), never shown to users.
 */
export function buildAgencyCatalog(
  source: Array<Record<string, unknown>>,
  mode: AtlasMode,
): AgencyCatalogFile {
  const agencies = source
    .filter(agency => isAgencyVisibleInBrowser(agency, { mode }))
    .map(({ feedUrl: _feedUrl, mdbFeedUrl: _mdbFeedUrl, supplementalFeedUrls: _supplementalFeedUrls, nextServiceDatesFeedUrls: _nextServiceDatesFeedUrls, nextServiceDatesSkipWeekendEvents: _nextServiceDatesSkipWeekendEvents, supplementalIdPrefixes: _supplementalIdPrefixes, formerSlugs: _formerSlugs, shortName: _shortName, labelPlace: _labelPlace, internalNote: _internalNote, ...agency }) => agency as unknown as AgencyCatalogEntry);

  return { mode, agencyCount: agencies.length, agencies };
}
