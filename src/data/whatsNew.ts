/**
 * "What's new" list shown from the map's bottom bar (CIV-83).
 *
 * Hand-maintained. One short, plain sentence per change that a visitor would notice, no
 * technical terms or issue numbers. Newest release first, newest item first within a release.
 * Style: bold `lead`, then one short `text` clause. Order by importance: big launches first (`isNew`), small fixes last. Keep it to about six items.
 * Only list things that are live on the public site; mark beta-only changes with `beta: true`
 * so they show on the beta site only. When a beta change graduates, drop its `beta` flag.
 * One bullet = one audience: tag it beta or leave it public; never mix both in one bullet.
 * A change that is partly public and partly beta becomes two bullets.
 * Keep past releases in the list: the panel shows only the latest, /changelog shows them all.
 * Add each new release at the top instead of replacing the previous one.
 */

export interface WhatsNewItem {
  /** Short bold lead shown before a colon, e.g. "Compare two maps". */
  lead?: string;
  /** One short clause after the lead. */
  text: string;
  /** Big launch: shows a small "New" tag. */
  isNew?: boolean;
  /** Only on the beta site for now. */
  beta?: boolean;
}

export interface WhatsNewRelease {
  /** App version from package.json this release ships as, e.g. "3.3.0". */
  version: string;
  /** Month the changes went out, e.g. "October 2026". */
  month: string;
  /** Day the release went out (YYYY-MM-DD), from the CHANGELOG release header. Orders the public changelog. */
  date: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: WhatsNewRelease[] = [
  {
    version: '3.3.0',
    month: 'October 2026',
    date: '2026-10-12',
    items: [
      { lead: 'Compare mode', text: 'put any two days, times or frequencies side by side', isNew: true, beta: true },
      { lead: 'Save the map as an image', text: 'it names the place, explains what is shown and links back to the map', isNew: true },
      { lead: 'On-demand zones', text: 'see their hours and whether they are running right now', isNew: true, beta: true },
      { lead: 'Better on phones', text: 'search results, settings and About fit the screen better, and stop names no longer break mid-word' },
    ],
  },
];

/** Releases with beta-only items removed unless `includeBeta`; empty releases are dropped. */
export function visibleWhatsNew(includeBeta: boolean, releases: WhatsNewRelease[] = WHATS_NEW): WhatsNewRelease[] {
  return releases
    .map(release => ({ ...release, items: release.items.filter(item => includeBeta || !item.beta) }))
    .filter(release => release.items.length > 0);
}

/** "3.3.0" -> "3.3". */
export function shortVersion(version: string): string {
  const [major, minor] = version.split('.');
  return minor === undefined ? version : `${major}.${minor}`;
}
