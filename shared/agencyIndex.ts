/**
 * The /agencies index: every area and agency page in one place. Built from the same summaries as the pages
 * themselves; nothing new is measured.
 */
import { agencyMention, agencyPagePath, agencyTitle, sharedOfficialNames, type AgencyPageSummary } from './agencyPages';
import { areaAgencySummaries } from './areaPages';
import { areaRegionTitle, areaShortName } from './areaRegions';
import { areaPagePath, areaSlug, type AreaConfig } from './areas';
import { SITE_URL, seoTitlePrefix, type SeoMode } from './seo';
import { plural } from './overflowText';
import { compareAgencyName, compareText } from './sortCompare';
import { AGENCY_INDEX_PATH } from './pagePaths';

export { AGENCY_INDEX_PATH };
/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const AGENCY_INDEX_DATA_SCRIPT_ID = 'agency-index-data';

/** The id of a state or province heading in the list; a country listed with no regions keeps its own heading's id. */
export function agencyIndexRegionId(country: string, region: string): string {
  return region === country ? `index-${country}` : `index-${areaSlug(country)}-${areaSlug(region)}`;
}

/** Link to an agency's state or province in the list (CIV-966), or null when the agency has no country and region. */
export function agencyIndexRegionHref(a: { country?: string; region?: string }): string | null {
  return a.country && a.region ? `${AGENCY_INDEX_PATH}#${encodeURIComponent(agencyIndexRegionId(a.country, a.region))}` : null;
}

export interface AgencyIndexAgency {
  slug: string;
  /** The agency's official name (#1245): "Montgomery Transit", never the registry form "Montgomery Transit (The M)"; "BC Transit · Kelowna" when others share it. */
  name: string;
  /** Its short name ("CDTA", "Muni"), for a row too tight for the full name. */
  shortName: string;

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
    .sort((x, y) => compareText(x.shortName, y.shortName));
  const tree = new Map<string, Map<string, AgencyIndexAgency[]>>();
  const shared = sharedOfficialNames(agencies);
  for (const a of agencies) {
    const country = a.country ?? OTHER;
    const region = a.country && a.region ? a.region : OTHER;
    const regions = tree.get(country) ?? tree.set(country, new Map()).get(country)!;
    (regions.get(region) ?? regions.set(region, []).get(region)!).push({ slug: a.slug, name: agencyTitle(a, shared), shortName: agencyMention(a), routes: a.routeCount });
  }
  const last = (x: string, y: string) => (x === OTHER ? 1 : 0) - (y === OTHER ? 1 : 0) || compareText(x, y);
  const groups = [...tree.entries()].sort(([x], [y]) => last(x, y)).map(([country, regions]) => ({
    country,
    regions: [...regions.entries()].sort(([x], [y]) => last(x, y)).map(([region, list]) => ({
      region,
      agencies: list.sort((x, y) => compareAgencyName(x.name, y.name)),
    })),
  }));
  return { areas: areaList, groups, agencyCount: agencies.length, releaseDate };
}

export function agencyIndexTitle(): string {
  return 'All transit agencies and regions | Transit Atlas';
}

export function agencyIndexDescription(d: Pick<AgencyIndexData, 'agencyCount' | 'areas'>): string {
  return `${d.agencyCount.toLocaleString('en-US')} transit ${plural(d.agencyCount, 'agency', 'agencies')} and ${d.areas.length} ${plural(d.areas.length, 'region')}. Each agency's page shows how often every route runs.`;
}

export function resolveAgencyIndexSeo(
  d: AgencyIndexData,
  ctx: { mode: SeoMode; origin?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = seoTitlePrefix(ctx.mode);
  return {
    title: `${prefix}${agencyIndexTitle()}`,
    description: agencyIndexDescription(d),
    canonicalUrl: `${origin}${AGENCY_INDEX_PATH}`,
    noindex: ctx.mode !== 'public',
    matchedPath: AGENCY_INDEX_PATH,
  };
}

export { agencyPagePath, areaPagePath };
