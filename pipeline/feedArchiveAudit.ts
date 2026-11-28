import { supplementalArchiveStem } from './agencyFeeds.js';

/**
 * CIV-3027 (Ryan, on CIV-2995: "how do we avoid this in the future"): every feed version Atlas has
 * used must have a copy in the private archive bucket. CIV-2995 found 224 public zips with no
 * archive copy, so the only copy of those feed versions sat in the public bucket.
 *
 * The feed versions Atlas has used are the ones the index records: each agency's `lastRawArchiveKey`
 * (the zip its live artifacts came from) and each `lastSupplementalFeeds[i].rawArchiveKey`. Refresh
 * writes each one to `gtfs/archive/<slug>/<key>.zip` (supplementals under `<slug>--supplemental-<n>`).
 * An active agency with no recorded key can't be matched to a zip, so it needs at least one
 * archived zip under its slug.
 */
export interface FeedArchiveAuditAgency {
  slug: string;
  lastRawArchiveKey?: string | null;
  lastSupplementalFeeds?: Array<{ rawArchiveKey?: string | null }> | null;
}

export interface FeedArchiveAuditResult {
  /** Recorded zips checked (main plus supplemental). */
  checked: number;
  /** Recorded zips with no archive copy. */
  missingRecorded: string[];
  /** Active agencies with no recorded key and no archived zip at all. */
  missingUnrecorded: string[];
  /** Active agencies with no recorded key but some archived zip (can't tell which version they used). */
  unrecordedWithArchive: string[];
}

export function auditFeedArchive(
  agencies: FeedArchiveAuditAgency[],
  isActive: (agency: FeedArchiveAuditAgency) => boolean,
  archiveKeys: Iterable<string>,
): FeedArchiveAuditResult {
  const keys = new Set(archiveKeys);
  const archivedDirs = new Set([...keys].filter(key => key.endsWith('.zip')).map(key => key.split('/')[2]));
  const result: FeedArchiveAuditResult = { checked: 0, missingRecorded: [], missingUnrecorded: [], unrecordedWithArchive: [] };
  const expect = (dir: string, stem: string) => {
    const key = `gtfs/archive/${dir}/${stem}.zip`;
    result.checked++;
    if (!keys.has(key)) result.missingRecorded.push(key);
  };
  for (const agency of agencies) {
    if (agency.lastRawArchiveKey) expect(agency.slug, agency.lastRawArchiveKey);
    agency.lastSupplementalFeeds?.forEach((feed, index) => {
      if (feed?.rawArchiveKey) expect(supplementalArchiveStem(agency.slug, index), feed.rawArchiveKey);
    });
    if (!agency.lastRawArchiveKey && isActive(agency)) {
      (archivedDirs.has(agency.slug) ? result.unrecordedWithArchive : result.missingUnrecorded).push(agency.slug);
    }
  }
  return result;
}

export function feedArchiveAuditFailures(result: FeedArchiveAuditResult): string[] {
  return [
    result.missingRecorded.length ? `${result.missingRecorded.length} recorded feed zip(s) with no archive copy` : null,
    result.missingUnrecorded.length ? `${result.missingUnrecorded.length} active agencies with no archived zip` : null,
  ].filter((line): line is string => line !== null);
}
