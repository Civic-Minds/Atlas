/**
 * The /agencies index: every area and agency page in one place. Built from the same summaries as the pages
 * themselves; nothing new is measured.
 */
import { agencyMention, agencyPagePath, agencyPlaces, agencyTitle, areaPageStatus, regionPageHref, sharedOfficialNames, type AgencyPageSummary } from './agencyPages';
import { countryForRegion } from './regionCountry';
import { areaRegionTitle, areaShortName } from './areaRegions';
import { areaPagePath, areaSlug, type AreaConfig } from './areas';
import { SITE_URL, seoTitlePrefix, type SeoMode } from './seo';
import { plural } from './overflowText';
import { compareAgencyName, compareText } from './sortCompare';
import { AGENCY_INDEX_PATH, parentAgencyPagePath } from './pagePaths';
import { parentMembers, parentRoutes, parentsWithMembers } from './parentAgencies';

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
  /** CIV-1277: a parent agency's row, listed once in place of its members, with its own page. */
  parent?: { href: string };
}

export interface AgencyIndexData {
  areas: Array<{ slug: string; title: string; shortName: string }>;
  /** Country, then state or province, each sorted by name; agencies with no known place go last under "Other". */
  groups: Array<{ country: string; regions: Array<{ region: string; agencies: AgencyIndexAgency[]; /** Its state or province page (CIV-976), when it has one. */ href?: string }> }>;
  agencyCount: number;
  releaseDate: string | null;
}

const OTHER = 'Other';

/** Areas with a page (areaPageStatus: at least two agencies), region names A to Z; agencies grouped by country, then region. */
export function buildAgencyIndexData(
  agencies: readonly AgencyPageSummary[],
  areas: readonly Pick<AreaConfig, 'slug' | 'name' | 'agencies' | 'page'>[],
  releaseDate: string | null,
): AgencyIndexData {
  const { pages } = areaPageStatus(agencies, areas);
  const areaList = areas
    .filter(a => pages.has(a.slug))
    .map(a => ({ slug: a.slug, title: areaRegionTitle(a), shortName: areaShortName(a) }))
    .sort((x, y) => compareText(x.shortName, y.shortName));
  const tree = new Map<string, Map<string, AgencyIndexAgency[]>>();
  const shared = sharedOfficialNames(agencies);
  const put = (country: string, region: string, row: AgencyIndexAgency) => {
    const regions = tree.get(country) ?? tree.set(country, new Map()).get(country)!;
    const list = regions.get(region) ?? regions.set(region, []).get(region)!;
    if (!list.some(x => x.slug === row.slug)) list.push(row);
  };
  /**
   * #1306: an agency is listed under every state or province its routes serve (agencyPlaces), as the state pages count
   * it, so Sioux City Transit is under Iowa and Nebraska. One with no route in a known state or province stays under its
   * home one, or "Other". For a parent, a member with no known state adds none once another member has one.
   */
  const add = (places: readonly Pick<AgencyPageSummary, 'country' | 'region' | 'routes'>[], row: AgencyIndexAgency) => {
    const served = places.flatMap(a => agencyPlaces(a).regions.map(r => r.name)).filter(name => countryForRegion(name));
    if (served.length > 0) for (const name of served) put(countryForRegion(name)!, name, row);
    else for (const a of places) put(a.country ?? OTHER, a.country && a.region ? a.region : OTHER, row);
  };
  // CIV-1277: a parent agency is one row in place of its members, under every state or province one of them serves.
  const parents = parentsWithMembers(agencies);
  const grouped = new Set(parents.map(p => p.slug));
  for (const a of agencies) if (!a.parentAgency || !grouped.has(a.parentAgency)) add([a], { slug: a.slug, name: agencyTitle(a, shared), shortName: agencyMention(a), routes: a.routeCount });
  for (const p of parents) {
    const members = parentMembers(p, agencies);
    add(members, { slug: p.slug, name: p.name, shortName: p.name, routes: parentRoutes(members).length, parent: { href: parentAgencyPagePath(p.slug) } });
  }
  // An agency listed under two states still counts once.
  const rows = new Set([...tree.values()].flatMap(regions => [...regions.values()].flatMap(list => list.map(x => x.slug)))).size;
  const last = (x: string, y: string) => (x === OTHER ? 1 : 0) - (y === OTHER ? 1 : 0) || compareText(x, y);
  const groups = [...tree.entries()].sort(([x], [y]) => last(x, y)).map(([country, regions]) => ({
    country,
    regions: [...regions.entries()].sort(([x], [y]) => last(x, y)).map(([region, list]) => {
      const href = regionPageHref({ country, region }, agencies);
      return { region, agencies: list.sort((x, y) => compareAgencyName(x.name, y.name)), ...(href ? { href } : {}) };
    }),
  }));
  // The count says how many agencies the list shows: a parent agency counts once (CIV-1277), as does one listed under two states (#1306).
  return { areas: areaList, groups, agencyCount: rows, releaseDate };
}

export function agencyIndexTitle(): string {
  return 'All transit agencies and regions | Transit Atlas';
}

export function agencyIndexDescription(d: Pick<AgencyIndexData, 'agencyCount' | 'areas'>): string {
  return `${d.agencyCount.toLocaleString('en-US')} transit ${plural(d.agencyCount, 'agency', 'agencies')} and ${d.areas.length} ${plural(d.areas.length, 'region')}. Each agency’s page shows how often every route runs.`;
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
