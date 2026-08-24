import { createHash } from 'node:crypto';

export interface FeedCandidate {
  kind: 'configured' | 'mdb-latest';
  url: string;
}

export interface FeedCandidateResult {
  kind: FeedCandidate['kind'];
  url: string;
  status: 'current' | 'expired' | 'missing-metadata' | 'unavailable';
  feedExpiry: string | null;
  feedVersion: string | null;
  feedInfoEnd: string | null;
  calendarExpiry: string | null;
  sha256: string | null;
  agencyNames: string[];
  routeCount: number | null;
  stopCount: number | null;
  error?: string;
}

/** Turn a dated Mobility Database ZIP URL into its current-feed equivalent. */
export function mobilityDatabaseLatestUrl(url: string): string | null {
  const match = url.match(
    /^https:\/\/files\.mobilitydatabase\.org\/([^/]+)\/\1-\d+\/\1-\d+\.zip$/,
  );
  return match ? `https://files.mobilitydatabase.org/${match[1]}/latest.zip` : null;
}

export function buildFeedCandidates(feedUrl?: string | null, mdbFeedUrl?: string | null): FeedCandidate[] {
  const candidates: FeedCandidate[] = [];
  const add = (kind: FeedCandidate['kind'], url: string | null | undefined) => {
    if (!url || candidates.some(candidate => candidate.url === url)) return;
    candidates.push({ kind, url });
  };

  add('configured', feedUrl);
  add('configured', mdbFeedUrl);
  for (const url of [feedUrl, mdbFeedUrl]) {
    const latest = url ? mobilityDatabaseLatestUrl(url) : null;
    if (latest) add('mdb-latest', latest);
  }
  return candidates;
}

export function classifyExpiredCandidates(
  baselineExpiry: string,
  today: string,
  candidates: FeedCandidateResult[],
): 'newer-source-found' | 'genuinely-expired' | 'metadata-only-expiry' | 'source-unavailable' | 'needs-manual-source-review' {
  const usable = candidates.filter(candidate => candidate.status !== 'unavailable');
  const current = usable.filter(candidate => candidate.status === 'current');
  if (current.some(candidate => candidate.feedExpiry !== null && candidate.feedExpiry > baselineExpiry)) {
    return 'newer-source-found';
  }
  if (current.length > 0) return 'metadata-only-expiry';
  if (usable.length === 0) return 'source-unavailable';
  if (usable.every(candidate => candidate.status === 'expired' && (candidate.feedExpiry ?? '') < today)) {
    return 'genuinely-expired';
  }
  return 'needs-manual-source-review';
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
