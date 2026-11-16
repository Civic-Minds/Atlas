/**
 * Every page's one name (Ryan, 2026-11-15, the page-names refactor): the header, the footer, back and close links, the
 * page's own heading and the start of its browser tab all read these, so a page is never called two things. Names are
 * title case (docs/style/VISUAL.md). A link to a page says its name, except where Ryan set a one-word link: the footer's
 * "About" (the page is "About Atlas").
 */
export const SITE_NAME = 'Transit Atlas';

export const PAGE_NAMES = {
  map: 'Map',
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
} as const;

/** The footer's link-column headings (CIV-1699, Ryan: For Planners gets its own "Product" column, Studio joins it later). */
export const FOOTER_HEADINGS = {
  explore: 'Explore',
  learn: 'Learn',
  product: 'Product',
  /** Ryan: the column is "Atlas" and its link "About" (link names are one word). */
  atlas: 'Atlas',
} as const;

/** Browser tab titles stay within this many characters (search results cut the rest). */
export const TAB_TITLE_MAX = 60;

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
