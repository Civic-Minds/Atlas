/** Paths of the agency, area and all-agencies pages. Imports nothing, so any bundle can link to the pages without their data. */

export const AGENCY_PATH_PREFIX = '/agency/';
export function agencyPagePath(slug: string): string {
  return `${AGENCY_PATH_PREFIX}${encodeURIComponent(slug)}`;
}

export const AREA_PATH_PREFIX = '/area/';
export function areaPagePath(slug: string): string {
  return `${AREA_PATH_PREFIX}${encodeURIComponent(slug)}`;
}

export const AGENCY_INDEX_PATH = '/agencies';
