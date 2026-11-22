import { TAB_TITLE_MAX } from './rules/limits';
/**
 * Every page's one name (Ryan, 2026-11-15, the page-names refactor): the header, the footer, back and close links, the
 * page's own heading and the start of its browser tab all read these, so a page is never called two things. Names are
 * title case (docs/style/VISUAL.md). A link to a page says its name, except where Ryan set a one-word link: the footer's
 * "About" (the page is "About Atlas").
 */
export const SITE_NAME = 'Transit Atlas';
/** What Atlas is, in one clause; ATLAS_MAP_SUMMARY is the sentence (the About hero, the Researchers search description). */
export const ATLAS_MAP_CLAUSE = 'Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency and place';
export const ATLAS_MAP_SUMMARY = `${ATLAS_MAP_CLAUSE}.`;

export const PAGE_NAMES = {
  map: 'Map',
  /** A Live route page's name in its tab (CIV-284, Ryan's pick: "Live Reports"). */
  liveReports: 'Live Reports',
  /** The all-agencies page's links. */
  agencies: 'Agencies',
  /** The all-agencies page's heading and tab (CIV-1614: "area", not "region"). */
  agencyIndex: 'All Agencies and Areas',
  research: 'Research',
  /** CIV-1697 (Ryan, 2026-11-15): "Docs" on links, heading and tab, back from the page-names refactor's "Documentation". */
  docs: 'Docs',
  /** The footer's one-word link to the About page (Ryan: link names are one word). */
  about: 'About',
  aboutPage: 'About Atlas',
  /** The release notes, at /changelog: one name for the page, its link and the map's panel (Ryan). */
  whatsNew: 'What’s New',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  /** The footer's legal links, one word each. */
  termsLink: 'Terms',
  privacyLink: 'Privacy',
  /** CIV-1630 (Ryan, option 1): the public footer's link to the beta site, first in the legal row. */
  betaLink: 'Beta',
  serviceHistory: 'Service History',
  /** CIV-1320: the page for planners, and its footer link (Ryan: "For Planners" to keep it shorter). */
  planners: 'For Transit Planners',
  plannersLink: 'For Planners',
  /** CIV-1709: the page for researchers, and its footer link. Proposed, waiting on Ryan's OK. */
  researchers: 'For Researchers',
  /** CIV-1694: the header link to Atlas Studio (local only). Proposed, waiting on Ryan's OK. */
  studio: 'Studio',
  /** CIV-1693: Studio's buses-needed calculator. Proposed, waiting on Ryan's OK. */
  studioVehicles: 'Buses Needed',
  /** CIV-1715: Studio's before/after schedule comparison. Ryan, 2026-11-19 (CIV-1922): "I said to make a page called Schedules". */
  studioSchedules: 'Schedules',
  /** CIV-1871: the local agency status table (StudioCoveragePage). Renamed from Coverage to Status on Strategy's naming call (2026-11-21; Agencies is the public footer page). */
  studioCoverage: 'Status',
} as const;

/** The footer's link-column headings (CIV-1699, Ryan: For Planners gets its own "Product" column, Studio joins it later). */
export const FOOTER_HEADINGS = {
  explore: 'Explore',
  learn: 'Learn',
  product: 'Product',
  /** Ryan: the column is "Atlas" and its link "About" (link names are one word). */
  atlas: 'Atlas',
} as const;

/** Browser tab titles stay within this many characters (shared/rules/limits.ts). */
export { TAB_TITLE_MAX };

/**
 * The one browser tab format: "<page name> | Transit Atlas", with an optional detail after the name
 * ("Docs: Data, Frequency and Methods | Transit Atlas"). A title that would pass TAB_TITLE_MAX drops the detail,
 * then the brand, never the page name. Only the home page leads with the brand.
 */
export function tabTitle(name: string, detail?: string): string {
  const options = [
    ...(detail ? [`${name}: ${detail} | ${SITE_NAME}`] : []),
    `${name} | ${SITE_NAME}`,
  ];
  return options.find(t => t.length <= TAB_TITLE_MAX) ?? name;
}
