export type FeedCandidateKind = 'configured' | 'fallback' | 'mdb-latest';

export interface FeedCandidate {
  kind: FeedCandidateKind;
  url: string;
}

/**
 * Turn a dated Mobility Database ZIP URL, or a URL on the retired Google-hosted
 * mdb-latest mirror (frozen since 2026-06-04, #627), into its current-feed
 * equivalent on files.mobilitydatabase.org.
 */
export function mobilityDatabaseLatestUrl(url: string): string | null {
  const dated = url.match(
    /^https:\/\/files\.mobilitydatabase\.org\/([^/]+)\/\1-\d+\/\1-\d+\.zip$/,
  );
  if (dated) return `https://files.mobilitydatabase.org/${dated[1]}/latest.zip`;
  const mirror = url.match(
    /^https:\/\/storage\.googleapis\.com\/(?:storage\/v1\/b\/)?mdb-latest\/(?:o\/)?[^/?]*-gtfs-(\d+)\.zip(?:\?alt=media)?$/,
  );
  return mirror ? `https://files.mobilitydatabase.org/mdb-${mirror[1]}/latest.zip` : null;
}

/** True for URLs on the retired Google-hosted Mobility Database mirror (#627). */
export function isRetiredMobilityDatabaseMirror(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'storage.googleapis.com' && parsed.pathname.includes('mdb-latest');
  } catch {
    return false;
  }
}

/** True for a dated snapshot that never picks up newer schedules (#629). */
export function isDatedMobilityDatabaseSnapshot(url: string): boolean {
  return /^https:\/\/files\.mobilitydatabase\.org\/([^/]+)\/\1-\d+\/\1-\d+\.zip$/.test(url);
}

/** Return configured sources followed by safe, automatically-derived fallbacks. */
export function buildFeedCandidates(
  feedUrl?: string | null,
  mdbFeedUrl?: string | null,
  fallbackUrls: string[] = [],
): FeedCandidate[] {
  const candidates: FeedCandidate[] = [];
  const add = (kind: FeedCandidateKind, url: string | null | undefined) => {
    if (!url || candidates.some(candidate => candidate.url === url)) return;
    candidates.push({ kind, url });
  };

  add('configured', feedUrl);
  for (const url of fallbackUrls) add('fallback', url);
  add('configured', mdbFeedUrl);
  for (const url of [feedUrl, mdbFeedUrl]) {
    const latest = url ? mobilityDatabaseLatestUrl(url) : null;
    if (latest) add('mdb-latest', latest);
  }
  return candidates;
}
