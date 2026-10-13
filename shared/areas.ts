/** Metro area config (config/areas/*.json) and its naming rules. Pure, shared by the build scripts and the pages. */

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
  /** Among the largest metro areas (LARGE_METROS), so a single large agency still earns a page. */
  largeMetro: boolean;
  agencies: string[];
  /** Whether this area gets a page. */
  page: boolean;
  note?: string;
}

/**
 * About the 50 largest US metropolitan statistical areas (2020 Census) and the 10 largest Canadian
 * CMAs (2021 Census), by the name an area carries here. A committed list, so it is reviewable; a
 * one-agency area gets a page only when it is on it.
 */
/** An entry may carry a state ("Columbus, OH") where other metros share the name. */
export const LARGE_METROS: readonly string[] = [
  'New York', 'Los Angeles', 'Chicago', 'Dallas', 'Houston', 'Washington', 'Philadelphia', 'Miami', 'Atlanta', 'Boston',
  'Phoenix', 'San Francisco', 'Riverside', 'Detroit', 'Seattle', 'Minneapolis', 'San Diego', 'Tampa', 'Denver', 'Baltimore',
  'St. Louis', 'Orlando', 'Charlotte', 'San Antonio', 'Portland, OR', 'Sacramento', 'Pittsburgh', 'Austin', 'Las Vegas', 'Cincinnati',
  'Kansas City', 'Columbus, OH', 'Indianapolis', 'Cleveland', 'San Jose', 'Nashville', 'Virginia Beach', 'Providence', 'Jacksonville, FL', 'Milwaukee',
  'Oklahoma City', 'Raleigh', 'Memphis', 'Richmond, VA', 'Louisville', 'New Orleans', 'Salt Lake City', 'Hartford', 'Buffalo', 'Birmingham, AL',
  // Canada
  'Toronto', 'Montréal', 'Vancouver', 'Ottawa', 'Calgary', 'Edmonton', 'Winnipeg', 'Québec', 'Hamilton', 'Kitchener',
];

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

/** Whether an area is one of LARGE_METROS: by name, and by state where the entry names one. */
export function isLargeMetro(name: string, officialName: string): boolean {
  const states = (officialName.split(',')[1] ?? '').trim().split('-');
  return LARGE_METROS.some(entry => {
    const [n, st] = entry.split(',').map(x => x.trim());
    return n === name && (!st || states.includes(st));
  });
}
