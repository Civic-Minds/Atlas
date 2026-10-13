/** Public list of every published data release, newest last. Written by publish-data-release. */
export const RELEASE_HISTORY_KEY = 'atlas/release-history.json';

export interface ReleaseHistoryEntry {
  releaseId: string;
  generatedAt: string;
}

/** Keeps only well-formed entries; anything else (including a non-array file) yields []. */
export function parseReleaseHistory(value: unknown): ReleaseHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ReleaseHistoryEntry[] = [];
  for (const item of value) {
    const entry = item as Partial<ReleaseHistoryEntry> | null;
    if (!entry || typeof entry.releaseId !== 'string' || !entry.releaseId) continue;
    if (typeof entry.generatedAt !== 'string' || Number.isNaN(Date.parse(entry.generatedAt))) continue;
    out.push({ releaseId: entry.releaseId, generatedAt: entry.generatedAt });
  }
  return out;
}

/** Adds entries to the history, de-duplicating by releaseId (the existing entry wins) and sorting by date. */
export function appendReleaseHistory(existing: unknown, ...added: Array<Partial<ReleaseHistoryEntry>>): ReleaseHistoryEntry[] {
  const byId = new Map<string, ReleaseHistoryEntry>();
  for (const entry of [...parseReleaseHistory(existing), ...parseReleaseHistory(added)]) {
    if (!byId.has(entry.releaseId)) byId.set(entry.releaseId, entry);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
}
