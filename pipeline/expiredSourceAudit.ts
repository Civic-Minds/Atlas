import { createHash } from 'node:crypto';
import { buildFeedCandidates, mobilityDatabaseLatestUrl, type FeedCandidate } from './feedSourceCandidates.js';

export { buildFeedCandidates, mobilityDatabaseLatestUrl } from './feedSourceCandidates.js';
export type { FeedCandidate } from './feedSourceCandidates.js';

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

export function classifyExpiredCandidates(
  baselineExpiry: string,
  today: string,
  candidates: FeedCandidateResult[],
): 'newer-source-found' | 'genuinely-expired' | 'metadata-only-expiry' | 'source-unavailable' | 'needs-manual-source-review' {
  const usable = candidates.filter(candidate => candidate.status !== 'unavailable');
  const current = usable.filter(candidate => candidate.status === 'current');
  const unavailable = candidates.some(candidate => candidate.status === 'unavailable');
  if (current.some(candidate => candidate.feedExpiry !== null && candidate.feedExpiry > baselineExpiry)) {
    return 'newer-source-found';
  }
  if (current.length > 0) return 'metadata-only-expiry';
  if (usable.length === 0) return 'source-unavailable';
  if (unavailable) return 'needs-manual-source-review';
  if (usable.every(candidate => candidate.status === 'expired' && (candidate.feedExpiry ?? '') < today)) {
    return 'genuinely-expired';
  }
  return 'needs-manual-source-review';
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
