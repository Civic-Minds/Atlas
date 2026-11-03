/**
 * Paths of the agency, area, state or province and all-agencies pages. Imports only the small table of moved agency
 * pages, so any bundle can link to the pages without their data.
 */
import agencyPageRenames from './data/agency-page-renames.json';

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
/** The same slug rule as area slugs (shared/areas areaSlug): accents dropped, lower case, dashes. */
export function regionSlug(region: string): string {
  return region.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const AGENCY_INDEX_PATH = '/agencies';
