import agencyAreas from './data/agency-area-slugs.json';
import { areaPagePath } from './areas';
import { areaRegionTitle } from './areaRegions';

/** agency slug -> [area slug, area name], for agencies in an area that has a page (config/areas). */
const AGENCY_AREAS = agencyAreas as unknown as Record<string, [string, string]>;

/** The agency's region as a title ("Greater Toronto and Hamilton Area", "Metro Vancouver"), or null when it is in no area. */
export function agencyRegionTitle(agencySlug: string, map: Record<string, [string, string]> = AGENCY_AREAS): string | null {
  const hit = map[agencySlug];
  return hit ? areaRegionTitle({ slug: hit[0], name: hit[1] }) : null;
}

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
  // Says what the link opens (Ryan, 2026-10-20): "All Metro Atlanta agencies"; the arrow comes from ArrowLink.
  return hit ? { href: areaPagePath(hit[0]), label: `All ${areaRegionTitle({ slug: hit[0], name: hit[1] })} agencies` } : null;
}

/**
 * About how many characters of area name fit on the agency card's links line (CIV-523): the 280px card's line runs under
 * the report flag, and 12px text averages about 6px a character, leaving room for about 29 beside "· About →" and about
 * 20 when "· Source →" follows too.
 */
export const AREA_LINK_MAX_CHARS = { about: 29, aboutAndSource: 20 } as const;

/** Area names that are proper names ending in "Area", never shortened ("Bay Area" without it would read "Bay"). */
const PROPER_AREA_NAMES: ReadonlySet<string> = new Set(['Bay Area']);

/**
 * The area link's text (CIV-523, Ryan): the region's full name where it fits in `maxChars`; else the name without its
 * trailing "area" ("Greater Toronto and Hamilton"), which still names the region. A name that is still too long is cut
 * with an ellipsis by the card, with the full name on hover.
 */
export function areaLinkName(title: string, maxChars: number): string {
  if (title.length <= maxChars || PROPER_AREA_NAMES.has(title)) return title;
  return title.replace(/ (metropolitan area|metro area|area)$/i, '');
}
