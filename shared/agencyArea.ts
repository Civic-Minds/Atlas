import agencyAreas from './data/agency-area-slugs.json';
import { areaPagePath } from './areas';
import { areaRegionTitle } from './areaRegions';

/** agency slug -> [area slug, area name], for agencies in an area that has a page (config/areas). */
const AGENCY_AREAS = agencyAreas as unknown as Record<string, [string, string]>;

/**
 * The area page an agency's links should point to: only when the area pages are on (beta flag) and
 * the agency belongs to an area that actually has a page. Otherwise null, so no link is drawn.
 */
export function areaLinkFor(
  agencySlug: string,
  flagOn: boolean,
  map: Record<string, [string, string]> = AGENCY_AREAS,
): { href: string; label: string } | null {
  if (!flagOn) return null;
  const hit = map[agencySlug];
  return hit ? { href: areaPagePath(hit[0]), label: `${areaRegionTitle({ slug: hit[0], name: hit[1] })} →` } : null;
}
