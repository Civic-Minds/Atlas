export type FeedCandidateKind = 'configured' | 'mdb-latest';

export interface FeedCandidate {
  kind: FeedCandidateKind;
  url: string;
}

/** Turn a dated Mobility Database ZIP URL into its current-feed equivalent. */
export function mobilityDatabaseLatestUrl(url: string): string | null {
  const match = url.match(
    /^https:\/\/files\.mobilitydatabase\.org\/([^/]+)\/\1-\d+\/\1-\d+\.zip$/,
  );
  return match ? `https://files.mobilitydatabase.org/${match[1]}/latest.zip` : null;
}

/** Return configured sources followed by safe, automatically-derived fallbacks. */
export function buildFeedCandidates(feedUrl?: string | null, mdbFeedUrl?: string | null): FeedCandidate[] {
  const candidates: FeedCandidate[] = [];
  const add = (kind: FeedCandidateKind, url: string | null | undefined) => {
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
