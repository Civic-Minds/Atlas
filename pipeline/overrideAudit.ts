import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';

/** Short names present in a GTFS zip's routes.txt (case preserved). */
export async function routeShortNamesInGtfsZip(buf: Buffer): Promise<Set<string>> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('routes.txt') ?? zip.file(
    Object.keys(zip.files).find(f => f.endsWith('/routes.txt') && !zip.files[f].dir) ?? '',
  );
  if (!entry) return new Set();
  const text = await entry.async('text');
  const rows = parseCsv<Record<string, string>>(text);
  return new Set(rows.map(r => r.route_short_name).filter(Boolean));
}

export function reconcileExcludeRouteShortNames(
  presentShortNames: Set<string>,
  excluded: string[],
): { stillNeeded: string[]; resolved: string[] } {
  const lowerPresent = new Set([...presentShortNames].map(s => s.toLowerCase()));
  const stillNeeded: string[] = [];
  const resolved: string[] = [];
  for (const sn of excluded) {
    if (lowerPresent.has(sn.toLowerCase())) stillNeeded.push(sn);
    else resolved.push(sn);
  }
  return { stillNeeded, resolved };
}

export function issueRefFromUrl(issueUrl?: string): string | null {
  const m = issueUrl?.match(/\/issues\/(\d+)/);
  return m ? `#${m[1]}` : null;
}

export type FeedVersionSnapshot = {
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
};

/** True when upstream feed_info differs from the last processed snapshot in index.json. */
export function upstreamFeedChanged(
  agency: FeedVersionSnapshot,
  peekedExpiry: string | null,
  peekedVersion: string | null,
): boolean {
  if (!agency.lastFeedExpiry && !agency.lastFeedVersion) return false;

  if (peekedExpiry && agency.lastFeedExpiry) {
    return peekedExpiry !== agency.lastFeedExpiry;
  }
  if (peekedVersion && agency.lastFeedVersion) {
    return peekedVersion !== agency.lastFeedVersion;
  }
  if (peekedExpiry && peekedExpiry !== agency.lastFeedExpiry) return true;
  if (peekedVersion && peekedVersion !== agency.lastFeedVersion) return true;
  return false;
}

/** Drop issueUrl when a new upstream GTFS file arrives; keep excludeRouteShortNames. */
export function clearIssueUrlOnFeedChange(
  agency: FeedVersionSnapshot & { issueUrl?: string },
  peekedExpiry: string | null,
  peekedVersion: string | null,
): string | null {
  if (!agency.issueUrl) return null;
  if (!upstreamFeedChanged(agency, peekedExpiry, peekedVersion)) return null;
  const cleared = agency.issueUrl;
  delete agency.issueUrl;
  return cleared;
}

export function formatOverrideIssueUrlClearedLog(slug: string, previousUrl: string): string {
  const issueRef = issueRefFromUrl(previousUrl) ?? 'issue link';
  return `[override] ${slug}: new upstream GTFS — cleared ${issueRef} from index.json (excludeRouteShortNames kept; re-file if override still needed)`;
}

export function formatOverrideResolvedLog(
  slug: string,
  resolved: string[],
  issueUrl?: string,
): string {
  const issueRef = issueRefFromUrl(issueUrl);
  const closeHint = issueRef
    ? ' — override may be removable; drop excludeRouteShortNames from index.json after verifying'
    : ' — override may be removable; drop excludeRouteShortNames from index.json after verifying';
  return `[override] ${slug}: ${resolved.map(s => `"${s}"`).join(', ')} no longer in upstream GTFS${closeHint}`;
}
