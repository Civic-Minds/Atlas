/** Search for metro areas by name, city or region name, for the map search's "Areas" group. */
import { AREA_INDEX, type AreaIndex } from './areaIndex';
import { areaRegionTitle, areaShortName } from './areaRegions';
import agencyPageSlugs from './data/agency-page-slugs.json';

export interface AreaSearchResult {
  slug: string;
  /** The city people search for, short enough for one line: "Montréal", "San Francisco". */
  name: string;
  agencyCount: number;
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
}

/** Lower case with accents removed, so "montreal" finds "Montréal". */
export function searchFold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const PAGE_SLUGS = new Set<string>(agencyPageSlugs as string[]);

/**
 * Areas that match the query, best first: names that start with it, then names that contain it,
 * then cities and region names. Only the regions /agencies lists (a page and an agency with a page),
 * and only those with an agency in the catalog, so beta-only areas stay out of public builds.
 */
export function searchAreas(
  query: string,
  catalogSlugs: ReadonlySet<string>,
  limit = 3,
  index: AreaIndex = AREA_INDEX,
  pageSlugs: ReadonlySet<string> = PAGE_SLUGS,
): AreaSearchResult[] {
  const q = searchFold(query);
  if (q.length < 2) return [];
  const ranked: Array<{ rank: number; result: AreaSearchResult }> = [];
  for (const [slug, area] of Object.entries(index)) {
    if (!area.page || !area.name) continue;
    if (!area.agencies.some(a => pageSlugs.has(a))) continue;
    const visible = area.agencies.filter(a => catalogSlugs.has(a));
    if (visible.length === 0) continue;
    const ref = { slug, name: area.name };
    const name = searchFold(areaShortName(ref));
    const names = [name, searchFold(area.name), searchFold(areaRegionTitle(ref))];
    const aliases = (area.cities ?? []).map(searchFold);
    const rank = names.some(n => n === q) ? 0
      : names.some(n => n.startsWith(q)) ? 1
      : names.some(n => n.includes(q)) ? 2
      : aliases.some(c => c === q || c.startsWith(q)) ? 3
      : aliases.some(c => c.includes(q)) ? 4
      : -1;
    if (rank < 0) continue;
    ranked.push({ rank, result: { slug, name: area.name, agencyCount: visible.length, bbox: area.bbox } });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || b.result.agencyCount - a.result.agencyCount || a.result.name.localeCompare(b.result.name, 'en'))
    .slice(0, limit)
    .map(r => r.result);
}
