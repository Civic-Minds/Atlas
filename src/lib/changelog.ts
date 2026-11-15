import { shortVersion, type WhatsNewItem, type WhatsNewRelease } from '../data/whatsNew';
import { shortDate } from '../../shared/dateText';

export type ChangelogEntry = { key: string; date: string; label: string; dateLabel: string | null; items: WhatsNewItem[] };

/** App versions, newest first. Map data refreshes are not listed: they happen far more often than code changes. */
export function buildChangelog(releases: WhatsNewRelease[]): ChangelogEntry[] {
  return releases
    .map(release => ({
      key: `app-${release.version}`,
      date: release.date,
      label: `Version ${shortVersion(release.version)}`,
      dateLabel: shortDate(release.date),
      items: release.items,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
