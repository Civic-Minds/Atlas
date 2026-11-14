/**
 * Data and wording for the /region/<slug> pages (CIV-976): one state or province, its agencies side by side, built
 * like the area pages (shared/areaPages.ts) with the place swapped. Every number is added up from the per-agency
 * summaries; nothing new is measured.
 */
import { agencyPlaces, areaAgencySummaries, areaPageStatus, formatIso, regionMembers, type AgencyPageSummary } from './agencyPages';
import { AREA_INDEX } from './areaIndex';
import { areaRegionName } from './areaRegions';
import { countryForRegion } from './regionCountry';
import { agencyGroupData, groupIntroParts, groupPageDescription, groupPageTitle, type AgencyGroupData } from './areaPages';
import { REGION_PATH_PREFIX, regionPagePath, regionSlug } from './pagePaths';
import { zoomForSpan } from './mapZoom';
import { SITE_URL, seoTitlePrefix, type SeoMode } from './seo';

export { REGION_PATH_PREFIX, regionPagePath, regionSlug };

/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const REGION_DATA_SCRIPT_ID = 'region-page-data';

/** What the place is called in "this state's routes". */
export type RegionKind = 'state' | 'province' | 'territory' | 'district';

const CANADIAN_TERRITORIES = new Set(['Yukon', 'Northwest Territories', 'Nunavut']);
const US_DISTRICTS = new Set(['Washington DC', 'District of Columbia']);
const US_TERRITORIES = new Set(['Puerto Rico', 'Guam', 'U.S. Virgin Islands', 'American Samoa', 'Northern Mariana Islands']);

export function regionKind(country: string, region: string): RegionKind {
  if (country === 'Canada') return CANADIAN_TERRITORIES.has(region) ? 'territory' : 'province';
  if (US_DISTRICTS.has(region)) return 'district';
  return US_TERRITORIES.has(region) ? 'territory' : 'state';
}

export interface RegionRef {
  slug: string;
  name: string;
  country: string;
}

/** An area page in a state or province (CIV-1298), with the routes it has there. */
export interface RegionArea {
  slug: string;
  /** Its name inside a sentence: "the Greater Toronto and Hamilton Area", "Waterloo Region". */
  name: string;
  routes: number;
}

export interface RegionPageData extends AgencyGroupData {
  region: RegionRef & { kind: RegionKind };
  /** The area pages whose home is this state or province, most routes here first (CIV-1298). */
  areas: RegionArea[];
  /** The map view that shows every listed agency: south, west, north, east. */
  bbox: [number, number, number, number] | null;
}

/** Every state or province with at least one listed agency (agencyPlaces, #1283), country then name; a slug shared by two places throws. */
export function regionPages(all: readonly AgencyPageSummary[]): RegionRef[] {
  const seen = new Map<string, RegionRef>();
  for (const a of all) {
    for (const { name } of agencyPlaces(a).regions) {
      const country = countryForRegion(name);
      if (!country) continue;
      const slug = regionSlug(name);
      const had = seen.get(slug);
      if (had && (had.name !== name || had.country !== country)) throw new Error(`Two places share the region slug ${slug}: ${had.name}, ${had.country} and ${name}, ${country}`);
      if (!had && regionMembers(country, name, all).length > 0) seen.set(slug, { slug, name, country });
    }
  }
  return [...seen.values()].sort((x, y) => x.country.localeCompare(y.country) || x.name.localeCompare(y.name));
}

type AreaRoutes = { total: number; byRegion: Map<string, number> };
const AREA_ROUTES = new WeakMap<readonly AgencyPageSummary[], Map<string, AreaRoutes>>();

/**
 * Each area page's routes as the area page counts them (areaAgencySummaries), and how many of them stop in each state or
 * province (agencyPlaces). A route over a state line counts in both states but once in the total. Memoized per list.
 */
function areaRoutesByRegion(all: readonly AgencyPageSummary[]): Map<string, AreaRoutes> {
  const cached = AREA_ROUTES.get(all);
  if (cached) return cached;
  const { pages } = areaPageStatus(all);
  const bySlug = new Map(all.map(a => [a.slug, a]));
  const out = new Map<string, AreaRoutes>();
  for (const slug of pages) {
    const area = AREA_INDEX[slug];
    if (!area) continue;
    const members = areaAgencySummaries({ slug, agencies: area.agencies }, bySlug);
    const byRegion = new Map<string, number>();
    for (const a of members) for (const { name, routes } of agencyPlaces(a).regions) byRegion.set(name, (byRegion.get(name) ?? 0) + routes.length);
    out.set(slug, { total: members.reduce((n, a) => n + a.routes.length, 0), byRegion });
  }
  AREA_ROUTES.set(all, out);
  return out;
}

/** An area counts as in a state or province when at least this share of its routes stop there (CIV-1298). */
export const REGION_AREA_MIN_SHARE = 0.2;

/**
 * The area pages a state or province contains (CIV-1298): those with at least a fifth of their routes there, so the
 * Washington, D.C. area is named on Washington DC's, Maryland's and Virginia's pages and the Ottawa area on Ontario's and
 * Quebec's, but Greater Boston is not on Maine's for two routes. Most routes here first.
 */
export function regionAreas(region: Pick<RegionRef, 'name'>, all: readonly AgencyPageSummary[]): RegionArea[] {
  const out: RegionArea[] = [];
  for (const [slug, { total, byRegion }] of areaRoutesByRegion(all)) {
    const here = byRegion.get(region.name) ?? 0;
    if (here === 0 || here < total * REGION_AREA_MIN_SHARE) continue;
    out.push({ slug, name: areaRegionName({ slug, name: AREA_INDEX[slug]?.name ?? slug }), routes: here });
  }
  return out.sort((x, y) => y.routes - x.routes || x.name.localeCompare(y.name));
}

/** At most this many areas are named after a state's intro (CIV-1298). */
const REGION_AREAS_NAMED = 3;

/**
 * The sentence after a state's intro naming its biggest area pages (CIV-1298), each linking to its page:
 * "Regions include the Greater Toronto and Hamilton Area, the Ottawa area and Waterloo Region." None with no area page.
 */
export function regionAreasSentenceParts(d: Pick<RegionPageData, 'areas'>): { lead: string; named: RegionArea[]; separators: string[]; tail: string } | null {
  if (d.areas.length === 0) return null;
  // No href here: the page reads its data back from the embedded JSON, so it builds each link from the slug at render
  // time (areaPagePath) and never puts a URL from that text in an href (CodeQL js/xss-through-dom).
  const named = d.areas.slice(0, REGION_AREAS_NAMED);
  const separators = named.map((_, i) => (i === named.length - 2 ? ' and ' : i < named.length - 2 ? ', ' : ''));
  return { lead: 'Regions include ', named, separators, tail: '.' };
}

/** The same sentence as plain text. */
export function regionAreasSentence(d: Pick<RegionPageData, 'areas'>): string {
  const p = regionAreasSentenceParts(d);
  return p ? `${p.lead}${p.named.map((a, i) => a.name + p.separators[i]).join('')}${p.tail}` : '';
}

export function buildRegionPageData(region: RegionRef, all: readonly AgencyPageSummary[], releaseDate: string | null): RegionPageData {
  const members = regionMembers(region.country, region.name, all);
  const boxes = members.map(a => a.bbox).filter((b): b is [number, number, number, number] => !!b);
  const bbox: RegionPageData['bbox'] = boxes.length > 0
    ? [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))]
    : null;
  return {
    region: { ...region, kind: regionKind(region.country, region.name) },
    areas: regionAreas(region, all),
    bbox,
    ...agencyGroupData(members, new Map(all.map(a => [a.slug, a])), releaseDate),
  };
}

export function regionPageH1(d: Pick<RegionPageData, 'region'>): string {
  return d.region.name;
}

export function regionPageTitle(d: Pick<RegionPageData, 'region' | 'agencies'>): string {
  return groupPageTitle(d.region.name, d);
}

export function regionPageDescription(d: RegionPageData): string {
  return groupPageDescription(d.region.name, d);
}

export function regionIntroParts(d: RegionPageData) {
  return groupIntroParts(d.region.name, d);
}

/** The line under the frequency bar, as on area pages with the place swapped: "The bar splits this state's routes ...". */
export function regionBarNote(d: Pick<RegionPageData, 'region'>): string {
  return `The bar splits this ${d.region.kind}’s routes by how often they run on a weekday midday. Each route is judged by its slower direction.`;
}

/** The map with every listed agency, framed on them all. */
export function regionMapHref(d: Pick<RegionPageData, 'agencies' | 'bbox'>): string {
  const params = new URLSearchParams({ agencies: d.agencies.flatMap(a => a.slugs).join(',') });
  if (d.bbox) {
    const [s, w, n, e] = d.bbox;
    const lat = (s + n) / 2;
    params.set('lat', lat.toFixed(4));
    params.set('lon', ((w + e) / 2).toFixed(4));
    params.set('z', String(zoomForSpan(Math.max(n - s, (e - w) * Math.cos((lat * Math.PI) / 180)))));
  }
  return `/?${params.toString()}`;
}

export function resolveRegionSeo(
  d: RegionPageData,
  ctx: { mode: SeoMode; origin?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const path = regionPagePath(d.region.name);
  return {
    title: `${seoTitlePrefix(ctx.mode)}${regionPageTitle(d)}`,
    description: regionPageDescription(d),
    canonicalUrl: `${origin}${path}`,
    noindex: ctx.mode !== 'public',
    matchedPath: path,
  };
}

/** BreadcrumbList and Dataset, as on area pages; the breadcrumb is not shown on the page. */
export function regionPageJsonLd(d: RegionPageData, canonicalUrl: string, origin: string): object {
  const crumbs = [{ name: 'Transit Atlas', item: `${origin}/` }, { name: d.region.country }, { name: d.region.name, item: canonicalUrl }];
  const modified = formatIso(d.newestRefresh);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...('item' in c ? { item: c.item } : {}) })),
      },
      {
        '@type': 'Dataset',
        name: `${d.region.name} transit frequency`,
        description: regionPageDescription(d),
        url: canonicalUrl,
        isAccessibleForFree: true,
        spatialCoverage: { '@type': 'Place', name: `${d.region.name}, ${d.region.country}` },
        creator: { '@type': 'Organization', name: 'Civic Minds', url: `${SITE_URL}/` },
        ...(modified ? { dateModified: modified } : {}),
      },
    ],
  };
}
