/**
 * "What's new" list shown from the map's bottom bar (CIV-83).
 *
 * Hand-maintained. One short, plain sentence per change that a visitor would notice, no
 * technical terms or issue numbers. Newest first, most important first within a release.
 * Style: bold `lead`, then one short `text` clause. Order by importance: big launches first (`isNew`), small fixes last. Keep it to about six items a release.
 *
 * One entry per feature, with a line per site (Ryan, 2026-11-20, CIV-1999: "the what's new needs to depend on whether
 * the user is on public beta or local site"):
 * - `public`: the version it reached the public site and how it reads there. Beta and local show it too, unless the
 *   entry has its own `beta` line.
 * - `beta`: the version it reached beta and how it reads there, shown with a Beta tag. Local follows beta
 *   (FEATURES.whatsNewBetaItems).
 * Each site lists a feature once, under the version it arrived there, in its own words. When a beta feature goes public,
 * add its `public` line to the same entry, written as a launch for public readers ("for public users its not that compare
 * is now available on the public map its that compare mode is launched"); never add a second entry.
 * A public line never mentions beta.
 * Keep past releases: the panel shows only the latest, /changelog shows them all. Add each new release to RELEASES.
 */

import { EXPLORE_LABEL, TRY_IT_LABEL } from '../content/noticeCopy';
import { AGENCY_INDEX_PATH, COMPARE_PATH } from '../../shared/pagePaths';

/** Where and how one site lists a feature. */
export interface WhatsNewLine {
  /** App version it arrived in on this site, e.g. "3.4.0" (one of RELEASES). */
  version: string;
  /** One short clause after the lead. */
  text: string;
}

/** One feature, as each site lists it. */
export interface WhatsNewFeature {
  /** Short bold lead shown before a colon, e.g. "Compare mode". */
  lead?: string;
  public?: WhatsNewLine;
  beta?: WhatsNewLine;
  /** Big launch. */
  isNew?: boolean;
  /**
   * A text link with an arrow after the item, to the feature it describes (CIV-1999). Only for items that open a
   * feature; `desktopOnly` hides it on phones, where the feature isn't offered.
   */
  link?: { label: string; to: string; desktopOnly?: boolean };
}

/** One bullet as a site shows it. */
export interface WhatsNewItem {
  lead?: string;
  text: string;
  isNew?: boolean;
  /** From the feature's beta line: shows a Beta tag. */
  beta?: boolean;
  link?: WhatsNewFeature['link'];
}

export interface WhatsNewRelease {
  /** App version from package.json this release ships as, e.g. "3.3.0". */
  version: string;
  /** Day the release went out (YYYY-MM-DD), from the CHANGELOG release header. Orders the public changelog. */
  date: string;
  items: WhatsNewItem[];
}

/** App releases, newest first. */
export const RELEASES: { version: string; date: string }[] = [
  { version: '3.5.0', date: '2026-11-21' },
  { version: '3.4.0', date: '2026-11-09' },
  { version: '3.3.0', date: '2026-10-12' },
];

export const WHATS_NEW: WhatsNewFeature[] = [
  { lead: 'Clearer branches', isNew: true, public: { version: '3.5.0', text: "a slow branch no longer hides a frequent route, and each branch shows its own frequency on the route card" } },
  { lead: 'Agencies with several feeds', isNew: true, public: { version: '3.5.0', text: "now one agency everywhere, like MTA New York's subway, buses and railroads" } },
  { lead: 'History by day', isNew: true, beta: { version: '3.5.0', text: 'switch between Weekday, Saturday and Sunday' } },
  { lead: 'Frequent filter', public: { version: '3.5.0', text: 'counts the wait for the first and last bus in each time of day, so a route that starts late or ends early no longer passes' } },
  { lead: 'Faster pages', public: { version: '3.5.0', text: 'switching between Atlas pages is instant, without reloading the site' } },
  { lead: 'Data saver', beta: { version: '3.5.0', text: 'a prompt offers it on slow connections' } },
  {
    lead: 'Compare mode', isNew: true,
    beta: { version: '3.3.0', text: 'put any two days, times or frequencies side by side' },
    public: { version: '3.4.0', text: 'put two maps side by side, each with its own place, day and time' },
    link: { label: TRY_IT_LABEL, to: COMPARE_PATH, desktopOnly: true },
  },
  { lead: 'Route cards on phones', isNew: true, public: { version: '3.4.0', text: 'slide up from the bottom, with the route shown above' } },
  {
    lead: 'Agency and area pages', isNew: true,
    public: { version: '3.4.0', text: 'agencies, metro areas, states and provinces have their own frequency pages' },
    link: { label: EXPLORE_LABEL, to: AGENCY_INDEX_PATH },
  },
  { lead: 'Simpler route filters', public: { version: '3.4.0', text: 'two switches hide occasional and part-time routes' } },
  { lead: 'Save the map as an image', isNew: true, public: { version: '3.3.0', text: 'it names the place, explains what is shown and links back to the map' } },
  { lead: 'On-demand zones', isNew: true, beta: { version: '3.3.0', text: 'see their hours and whether they are running right now' } },
  { lead: 'Better on phones', public: { version: '3.3.0', text: 'search results, settings and About fit the screen better, and stop names no longer break mid-word' } },
];

/** The site's line for a feature: public reads `public`; beta and local read `beta`, else `public`. */
function lineFor(feature: WhatsNewFeature, includeBeta: boolean): { line: WhatsNewLine; beta: boolean } | null {
  if (includeBeta && feature.beta) return { line: feature.beta, beta: true };
  return feature.public ? { line: feature.public, beta: false } : null;
}

/** Releases as one site shows them (beta and local when `includeBeta`), each feature once; empty releases are dropped. */
export function visibleWhatsNew(includeBeta: boolean, features: WhatsNewFeature[] = WHATS_NEW, releases = RELEASES): WhatsNewRelease[] {
  return releases
    .map(release => ({
      ...release,
      items: features.flatMap(feature => {
        const site = lineFor(feature, includeBeta);
        if (!site || site.line.version !== release.version) return [];
        const item: WhatsNewItem = { lead: feature.lead, text: site.line.text };
        if (feature.isNew) item.isNew = true;
        if (site.beta) item.beta = true;
        if (feature.link) item.link = feature.link;
        return [item];
      }),
    }))
    .filter(release => release.items.length > 0);
}

/** "3.3.0" -> "3.3". */
export function shortVersion(version: string): string {
  const [major, minor] = version.split('.');
  return minor === undefined ? version : `${major}.${minor}`;
}
