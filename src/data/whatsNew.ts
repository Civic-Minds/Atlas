/**
 * "What's new" list shown from the map's bottom bar (CIV-83).
 *
 * Hand-maintained. One short, plain sentence per change that a visitor would notice, no
 * technical terms or issue numbers. Newest release first, newest item first within a release.
 * Only list things that are live on the public site; mark beta-only changes with `beta: true`
 * so they show on the beta site only. When a beta change graduates, drop its `beta` flag.
 * Keep past releases in the list: the panel shows only the latest, /changelog shows them all.
 * Add each new release at the top instead of replacing the previous one.
 */

export interface WhatsNewItem {
  text: string;
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
      { text: 'Pick a route to fade the rest of the map, so your route stands out.' },
      { text: 'On phones, search results, settings and the About page fit better, stop names no longer break mid-word and the search bar stays on one line.' },
      { text: 'Compare two maps side by side, each with its own day and time.', beta: true },
      { text: 'On-demand zones show their hours and whether they are running right now.', beta: true },
      { text: 'On phones, tapping a route opens its details at the bottom of the screen.', beta: true },
      { text: 'Anyone can now save the map as an image that names the place, explains what is shown, includes a colour key, draws your chosen route in bold and links back to the map.' },
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
