/**
 * Prints a release's GitHub notes in the one format every Atlas release uses (Ryan, 2026-11-14):
 * "- **Lead**: what it does" bullets from that version's public What's new items (src/data/whatsNew.ts), then the
 * tag-pinned changelog link. Beta-only items are left out: a GitHub release is public.
 *
 *   gh release create v3.5.0 --title "Atlas 3.5.0" --notes "$(npx tsx scripts/release-notes.ts 3.5.0)"
 */
import { visibleWhatsNew, WHATS_NEW, type WhatsNewRelease } from '../src/data/whatsNew';

export function releaseNotes(version: string, releases: WhatsNewRelease[] = WHATS_NEW): string {
  const release = visibleWhatsNew(false, releases).find(r => r.version === version);
  if (!release) throw new Error(`No public What's new entry for ${version} in src/data/whatsNew.ts: add one before the release.`);
  const bullets = release.items.map(item => (item.lead ? `- **${item.lead}**: ${item.text}` : `- ${item.text}`));
  return [...bullets, '', `Full list of changes: [CHANGELOG.md](https://github.com/Civic-Minds/Atlas/blob/v${version}/CHANGELOG.md)`].join('\n');
}

export const releaseTitle = (version: string): string => `Atlas ${version}`;

if (process.argv[1]?.endsWith('release-notes.ts')) {
  const version = process.argv[2]?.replace(/^v/, '');
  if (!version) { console.error('usage: npx tsx scripts/release-notes.ts <version>'); process.exit(2); }
  console.log(releaseNotes(version));
}
