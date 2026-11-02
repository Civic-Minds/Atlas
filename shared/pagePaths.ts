/** Paths of the agency, area, state or province and all-agencies pages. Imports nothing, so any bundle can link to the pages without their data. */

export const AGENCY_PATH_PREFIX = '/agency/';
export function agencyPagePath(slug: string): string {
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
