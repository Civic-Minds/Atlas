/**
 * Every path and address Atlas uses, in one place (rules audit 4.1, move 6): the site's page paths, its own origins
 * (public, beta, preview), the data bucket's origins and the release keys inside it. Imports only the small table of
 * moved agency pages, so any bundle can link to the pages without their data.
 */
import agencyPageRenames from '../data/agency-page-renames.json';

/** CIV-1277: agency slug → its page's slug, for members whose parent's page took their slug ("exo" → "exo-trains"). */
const PAGE_RENAMES = agencyPageRenames as Readonly<Record<string, string>>;

export const AGENCY_PATH_PREFIX = '/agency/';
/** An agency's page, by its data slug: the one mapping every agency page link goes through. */
export function agencyPagePath(slug: string): string {
  return `${AGENCY_PATH_PREFIX}${encodeURIComponent(Object.prototype.hasOwnProperty.call(PAGE_RENAMES, slug) ? PAGE_RENAMES[slug] : slug)}`;
}
/** A parent agency's page (CIV-1277), by its own slug, never mapped: /agency/exo is exo's parent page. */
export function parentAgencyPagePath(slug: string): string {
  return `${AGENCY_PATH_PREFIX}${encodeURIComponent(slug)}`;
}

export const AREA_PATH_PREFIX = '/area/';
export function areaPagePath(slug: string): string {
  return `${AREA_PATH_PREFIX}${encodeURIComponent(slug)}`;
}

export const REGION_PATH_PREFIX = '/region/';
/** A state's or province's page (CIV-976): "/region/colorado", "/region/british-columbia". */
export function regionPagePath(region: string): string {
  return `${REGION_PATH_PREFIX}${regionSlug(region)}`;
}
/** The one slug rule, for regions, areas (shared/areas areaSlug) and export file names: accents dropped, lower case, dashes. */
export function regionSlug(region: string): string {
  return region.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const AGENCY_INDEX_PATH = '/agencies';

/** The id of a country's or a state's or province's heading in the /agencies list (a country with no regions keeps its own). */
export function agencyIndexHeadingId(country: string, region?: string): string {
  return !region || region === country ? `index-${country}` : `index-${regionSlug(country)}-${regionSlug(region)}`;
}

/** #1521: a link to a country's, or a state's or province's, heading in the /agencies list (there are no country pages). */
export function agencyIndexHeadingHref(country: string, region?: string): string {
  return `${AGENCY_INDEX_PATH}#${encodeURIComponent(agencyIndexHeadingId(country, region))}`;
}

/** The fixed pages' paths: each page's route, prerender, SEO entry and every link to it read these (no path typed by hand). */
export const ABOUT_PATH = '/about';
export const DOCS_PATH = '/about/docs';
/** The For Transit Planners page (CIV-1320). */
export const PLANNERS_PATH = '/planners';
/** The For Researchers page (CIV-1709; DECISIONS.md 2026-11-16: audience pages get their own top-level address). */
export const RESEARCHERS_PATH = '/researchers';
export const TERMS_PATH = '/terms';
export const PRIVACY_PATH = '/privacy';
export const CHANGELOG_PATH = '/changelog';
export const LIVE_PATH = '/apps/live';
export const RESEARCH_PATH = '/research';
/** Atlas Studio (CIV-1693), local only: the section opens its first page, the buses-needed calculator. */
export const STUDIO_PATH = '/studio';
export const STUDIO_VEHICLES_PATH = '/studio/vehicles';
/** CIV-1715: Studio's before/after schedule comparison. */
export const STUDIO_CHANGES_PATH = '/studio/changes';
/** CIV-1871: what each agency has across the products. Local only; a plain address until the Internal menu is chosen. */
export const STUDIO_COVERAGE_PATH = '/studio/coverage';

/** CIV-1872: the local-only home page listing every local-only page; the "Internal" tag beside the Atlas name opens it. Dev server only. */
export const INTERNAL_PATH = '/internal';

/** The map's address parameter that opens an agency card (`/?operator=<slug>`); shareUrlState.ts re-exports it (CIV-1783). */
export const AGENCY_CARD_PARAM = 'operator';

/** The public site, the beta site (beta-only agencies and services) and the preview site (agencies' own previews). */
export const SITE_URL = 'https://www.transitatlas.fyi';
export const BETA_SITE_URL = 'https://beta.transitatlas.fyi';
export const PREVIEW_SITE_URL = 'https://preview.transitatlas.fyi';

/** The public data bucket's origin, and the beta bucket's (the defaults when no env setting names another). */
export const DEFAULT_R2_PUBLIC_URL = 'https://data.transitatlas.fyi';
export const DEFAULT_BETA_R2_PUBLIC_URL = 'https://pub-5f1c48f86b024c42a8d174a4a5dd69ca.r2.dev';

/** The data release pointer the app reads, and the data version the browsers' caches follow (keys in the bucket). */
export const RELEASE_POINTER_KEY = 'atlas/release.json';
export const DATA_VERSION_KEY = 'atlas/data-version.json';
