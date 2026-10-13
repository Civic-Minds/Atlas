import { formatStoredDate } from '../utils/format';
import { shortVersion, type WhatsNewItem, type WhatsNewRelease } from '../data/whatsNew';

export type ChangelogEntry =
  | { kind: 'app'; key: string; date: string; label: string; month: string; /** Label of the newest map data update inside this version's period, e.g. "Oct 13, 2026". */ dataUpdated?: string; items: WhatsNewItem[] }
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
    label: `Version ${shortVersion(release.version)}`,
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
  // A data update belongs to the version whose period it falls in: from that version's date up to
  // the next newer version. The newest one per version goes on the version's heading; the rest,
  // and updates older than every version, stay as their own small lines.
  const apps = entries.filter((e): e is Extract<ChangelogEntry, { kind: 'app' }> => e.kind === 'app');
  const claimed = new Set<string>();
  for (const app of apps) {
    const newer = apps.filter(other => other.date > app.date).map(other => other.date).sort()[0];
    const inPeriod = entries
      .filter(e => e.kind === 'data' && e.date >= app.date && (!newer || e.date < newer))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (inPeriod) {
      app.dataUpdated = inPeriod.label.replace('Map data updated ', '');
      claimed.add(inPeriod.key);
    }
  }
  const order = (entry: ChangelogEntry) => (entry.kind === 'app' ? 1 : 0);
  return entries.filter(e => !claimed.has(e.key)).sort((a, b) => b.date.localeCompare(a.date) || order(b) - order(a));
}
