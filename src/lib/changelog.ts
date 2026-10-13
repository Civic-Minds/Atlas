import { formatStoredDate } from '../utils/format';
import { shortVersion, type WhatsNewItem, type WhatsNewRelease } from '../data/whatsNew';

export type ChangelogEntry =
  | { kind: 'app'; key: string; date: string; label: string; month: string; items: WhatsNewItem[] }
  | { kind: 'data'; key: string; date: string; label: string };

/** "2026-10-09" from a manifest timestamp, or null when it carries no usable date. */
export function manifestDay(generatedAt: string | undefined): string | null {
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) return null;
  return generatedAt.slice(0, 10);
}

/**
 * App versions and map data releases in one list, newest first. Data releases come from the
 * release manifests the app already loads, so nobody writes them by hand. On the same day the
 * app version is listed first.
 */
export function buildChangelog(
  releases: WhatsNewRelease[],
  dataReleases: Array<{ releaseId?: string; generatedAt?: string }>,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = releases.map(release => ({
    kind: 'app' as const,
    key: `app-${release.version}`,
    date: release.date,
    label: `App version ${shortVersion(release.version)}`,
    month: release.month,
    items: release.items,
  }));
  const seen = new Set<string>();
  for (const data of dataReleases) {
    const day = manifestDay(data.generatedAt);
    if (!day) continue;
    const key = `data-${data.releaseId ?? day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ kind: 'data', key, date: day, label: `Map data updated ${formatStoredDate(day)}` });
  }
  const order = (entry: ChangelogEntry) => (entry.kind === 'app' ? 1 : 0);
  return entries.sort((a, b) => b.date.localeCompare(a.date) || order(b) - order(a));
}
