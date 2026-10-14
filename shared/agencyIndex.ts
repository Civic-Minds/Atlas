/**
 * The /agencies index: every area and agency page in one place. Built from the same summaries as the pages
 * themselves; nothing new is measured.
 */
import { agencyPagePath, type AgencyPageSummary } from './agencyPages';
import { areaAgencySummaries } from './areaPages';
import { areaRegionTitle, areaShortName } from './areaRegions';
import { areaPagePath, type AreaConfig } from './areas';
import { SITE_URL } from './seo';

export const AGENCY_INDEX_PATH = '/agencies';
/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const AGENCY_INDEX_DATA_SCRIPT_ID = 'agency-index-data';

export interface AgencyIndexAgency {
  slug: string;
  name: string;
  routes: number;
}

export interface AgencyIndexData {
  areas: Array<{ slug: string; title: string; shortName: string }>;
  /** Country, then state or province, each sorted by name; agencies with no known place go last under "Other". */
  groups: Array<{ country: string; regions: Array<{ region: string; agencies: AgencyIndexAgency[] }> }>;
  agencyCount: number;
  releaseDate: string | null;
}

const OTHER = 'Other';
const byName = (a: string, b: string) => a.localeCompare(b, 'en');

/** Areas with a page and at least one agency page, region names A to Z; agencies grouped by country, then region. */
export function buildAgencyIndexData(
  agencies: readonly AgencyPageSummary[],
  areas: readonly Pick<AreaConfig, 'slug' | 'name' | 'agencies' | 'page'>[],
  releaseDate: string | null,
): AgencyIndexData {
  const bySlug = new Map(agencies.map(a => [a.slug, a]));
  const areaList = areas
    .filter(a => a.page && areaAgencySummaries(a, bySlug).length > 0)
    .map(a => ({ slug: a.slug, title: areaRegionTitle(a), shortName: areaShortName(a) }))
    .sort((x, y) => byName(x.shortName, y.shortName));
  const tree = new Map<string, Map<string, AgencyIndexAgency[]>>();
  for (const a of agencies) {
    const country = a.country ?? OTHER;
    const region = a.country && a.region ? a.region : OTHER;
    const regions = tree.get(country) ?? tree.set(country, new Map()).get(country)!;
    (regions.get(region) ?? regions.set(region, []).get(region)!).push({ slug: a.slug, name: a.name, routes: a.routeCount });
  }
  const last = (x: string, y: string) => (x === OTHER ? 1 : 0) - (y === OTHER ? 1 : 0) || byName(x, y);
  const groups = [...tree.entries()].sort(([x], [y]) => last(x, y)).map(([country, regions]) => ({
    country,
    regions: [...regions.entries()].sort(([x], [y]) => last(x, y)).map(([region, list]) => ({
      region,
      agencies: list.sort((x, y) => byName(x.name, y.name)),
    })),
  }));
  return { areas: areaList, groups, agencyCount: agencies.length, releaseDate };
}

export function agencyIndexTitle(): string {
  return 'All transit agencies and regions | Transit Atlas';
}

export function agencyIndexDescription(d: Pick<AgencyIndexData, 'agencyCount' | 'areas'>): string {
  return `${d.agencyCount.toLocaleString('en-US')} transit ${d.agencyCount === 1 ? 'agency' : 'agencies'} and ${d.areas.length} ${d.areas.length === 1 ? 'region' : 'regions'}, each with a page of route-by-route frequency from the published schedule.`;
}

export function resolveAgencyIndexSeo(
  d: AgencyIndexData,
  ctx: { mode: 'public' | 'preview' | 'beta' | 'dev'; origin?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = ctx.mode === 'preview' ? '[Preview] ' : ctx.mode === 'public' ? '' : '[Beta] ';
  return {
    title: `${prefix}${agencyIndexTitle()}`,
    description: agencyIndexDescription(d),
    canonicalUrl: `${origin}${AGENCY_INDEX_PATH}`,
    noindex: ctx.mode !== 'public',
    matchedPath: AGENCY_INDEX_PATH,
  };
}

export { agencyPagePath, areaPagePath };
