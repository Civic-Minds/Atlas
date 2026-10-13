/** Metro area config (config/areas/*.json) and its naming rules. Pure, shared by the build scripts and the pages. */

import largeMetros from './data/large-metros.json';
import { metroKey, type LargeMetro } from './largeMetros';

export type AreaType = 'MSA' | 'MicroSA' | 'CMA' | 'CA';

export interface AreaConfig {
  slug: string;
  /** The city people search for: "Toronto" (the page says "Toronto area"). */
  name: string;
  type: AreaType;
  /** Official name(s) from the US Census (CBSA) or Statistics Canada (CMA/CA). */
  officialName: string;
  country: 'United States' | 'Canada';
  /** Main cities, from the official name. */
  cities: string[];
  bbox: [number, number, number, number];
  center: [number, number];
  /** Among the largest metro areas (shared/data/large-metros.json), so a single large agency still earns a page. */
  largeMetro: boolean;
  agencies: string[];
  /** Whether this area gets a page. */
  page: boolean;
  note?: string;
}

/** Official areas folded into the region people mean. The first member names the merged area's anchor. */
export const MERGED_AREAS: ReadonlyArray<{ name: string; country: 'United States' | 'Canada'; members: string[]; note: string }> = [
  {
    name: 'Toronto',
    country: 'Canada',
    members: ['Toronto', 'Hamilton', 'Oshawa'],
    note: 'This area combines the Toronto, Hamilton and Oshawa metro areas so it matches the Greater Toronto and Hamilton Area (GTHA).',
  },
];

const KEEP_HYPHEN = ['Winston-Salem', 'Wilkes-Barre', 'Scranton', 'Port St. Lucie', 'Coeur d\'Alene'];

/** Cities named in an official name: "Boston-Cambridge-Newton, MA-NH" gives Boston, Cambridge, Newton. */
export function mainCities(officialName: string): string[] {
  let base = officialName.split(',')[0].replace(/\([^)]*\)/g, '').trim();
  const kept: string[] = [];
  for (const k of KEEP_HYPHEN) if (base.includes(k)) { kept.push(k); base = base.replace(k, '').replace(/^-|-$|--/g, '-'); }
  const rest = base.split('-').map(s => s.trim()).filter(Boolean);
  return [...kept, ...rest].slice(0, 4);
}

export function areaSlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const AREA_PATH_PREFIX = '/area/';
export function areaPagePath(slug: string): string {
  return `${AREA_PATH_PREFIX}${slug}`;
}

/**
 * Whether an area is one of the large metros (shared/data/large-metros.json: the 50 largest US
 * MSAs by Census Bureau estimates and the 10 largest Canadian CMAs by the 2021 Census, generated
 * by scripts/build-large-metros.ts). A merged area counts when any official part does.
 */
export function isLargeMetro(area: Pick<AreaConfig, 'country' | 'officialName'>): boolean {
  const keys = new Set(area.officialName.split(' + ').map(metroKey));
  return (largeMetros as LargeMetro[]).some(m => m.country === area.country && keys.has(metroKey(m.name)));
}
