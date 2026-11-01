/**
 * Data and wording for the /region/<slug> pages (CIV-976): one state or province, its agencies side by side, built
 * like the area pages (shared/areaPages.ts) with the place swapped. Every number is added up from the per-agency
 * summaries; nothing new is measured.
 */
import { formatIso, regionMembers, type AgencyPageSummary } from './agencyPages';
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

export interface RegionPageData extends AgencyGroupData {
  region: RegionRef & { kind: RegionKind };
  /** The map view that shows every listed agency: south, west, north, east. */
  bbox: [number, number, number, number] | null;
}

/** Every state or province with at least one listed agency, country then name; a slug shared by two places throws. */
export function regionPages(all: readonly AgencyPageSummary[]): RegionRef[] {
  const seen = new Map<string, RegionRef>();
  for (const a of all) {
    if (!a.country || !a.region) continue;
    const slug = regionSlug(a.region);
    const had = seen.get(slug);
    if (had && (had.name !== a.region || had.country !== a.country)) throw new Error(`Two places share the region slug ${slug}: ${had.name}, ${had.country} and ${a.region}, ${a.country}`);
    if (!had && regionMembers(a.country, a.region, all).length > 0) seen.set(slug, { slug, name: a.region, country: a.country });
  }
  return [...seen.values()].sort((x, y) => x.country.localeCompare(y.country) || x.name.localeCompare(y.name));
}

export function buildRegionPageData(region: RegionRef, all: readonly AgencyPageSummary[], releaseDate: string | null): RegionPageData {
  const members = regionMembers(region.country, region.name, all);
  const boxes = members.map(a => a.bbox).filter((b): b is [number, number, number, number] => !!b);
  const bbox: RegionPageData['bbox'] = boxes.length > 0
    ? [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))]
    : null;
  return {
    region: { ...region, kind: regionKind(region.country, region.name) },
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
  return `The bar splits this ${d.region.kind}'s routes by how often they run on a weekday midday. Each route is judged by its slower direction.`;
}

/** The map with every listed agency, framed on them all. */
export function regionMapHref(d: Pick<RegionPageData, 'agencies' | 'bbox'>): string {
  const params = new URLSearchParams({ agencies: d.agencies.map(a => a.slug).join(',') });
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
