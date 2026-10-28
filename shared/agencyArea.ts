import agencyAreas from './data/agency-area-slugs.json';
import { areaPagePath } from './areas';
import { areaRegionTitle, areaShortName } from './areaRegions';

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
): { href: string; label: string; shortLabel: string } | null {
  if (!flagOn) return null;
  const hit = map[agencySlug];
  // Says what the link opens (Ryan, 2026-10-20): "All Metro Atlanta agencies"; the arrow comes from ArrowLink.
  // PREVIEW (Ryan 2026-10-24): one row of links, region by its short name, e.g. "Toronto area".
  const shortLabel = hit && hit[0] === 'toronto' ? 'Toronto area' : hit ? `${areaShortName({ slug: hit[0], name: hit[1] })} area` : '';
  return hit ? { href: areaPagePath(hit[0]), label: `All ${areaRegionTitle({ slug: hit[0], name: hit[1] })} agencies`, shortLabel } : null;
}
