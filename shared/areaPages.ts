/**
 * Data and wording for the /area/<slug> pages: one metro area, its agencies side by side. Every
 * number is added up from the per-agency summaries (shared/agencyPages.ts); nothing new is measured.
 */
import {
  agencyStats,
  bandCounts,
  bestRoute,
  formatDataDate,
  formatIso,
  hasMiddayService,
  agencyTitle,
  sharedOfficialNames,
  modesText,
  type AgencyPageSummary,
} from './agencyPages';
import { MODE_DEFINITIONS, ON_DEMAND_MODE, VIRTUAL_LRT_MODE, modeLabel, modeLabelSortIndex } from './modes';
import { BETA_BUILD } from './config';
import { AREA_INDEX, AREA_PARAM } from './areaIndex';
import { AREA_PATH_PREFIX, areaPagePath, type AreaConfig } from './areas';
import { areaRegionName, areaRegionSentenceStart, areaRegionTitle } from './areaRegions';
import { SITE_URL, seoTitlePrefix, type SeoMode } from './seo';
import { countOf } from './overflowText';
import { capitalizeFirst } from './headwayText';
import { compareAgencyName } from './sortCompare';
import { DESCRIPTION_MAX, TITLE_MAX, firstThatFits, truncateAtWord } from './seoText';

export { AREA_PATH_PREFIX, areaPagePath };

/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const AREA_DATA_SCRIPT_ID = 'area-page-data';

export interface AreaAgencyRow {
  slug: string;
  name: string;
  /** Its name in the intro and table: agencyTitle, told apart from same-named agencies (#1245). */
  title: string;
  /** The agency's short display name ("WETA (San Francisco Bay)"), for a narrow names column. */
  displayName: string;
  totalRoutes: number;
  /** Route counts by table column (AREA_TABLE_MODES, rarer modes added into "Other"), only the columns the agency has. */
  modes: Record<string, number>;
}

/** The numbers an area or a state or province page (CIV-976) shows for its agencies, counted the same way on both. */
export interface AgencyGroupData {
  totalRoutes: number;
  /** Route counts per weekday-midday frequency band (see FREQUENCY_BANDS), no-midday last. */
  bands: number[];
  /** The route with the shortest weekday-midday headway, with its agency. */
  best: { name: string; headway: number; agency: string } | null;
  byMode: Array<{ label: string; routes: number }>;
  agencies: AreaAgencyRow[];
  /** Mode columns for the agency table: the same fixed set on every area page (AREA_TABLE_MODES), then "Other" when an agency has a rarer mode. */
  modeColumns: string[];
  /** Newest schedule refresh among the area's agencies, and the data release the numbers come from. */
  newestRefresh: string | null;
  releaseDate: string | null;
}

export interface AreaPageData extends AgencyGroupData {
  area: Pick<AreaConfig, 'slug' | 'name' | 'type' | 'officialName' | 'country' | 'cities' | 'bbox' | 'center' | 'note'>;
  /** States or provinces of the area's own listed agencies, most routes first (CIV-968: the subtitle when the cities only repeat the title). */
  regions?: string[];
}

/**
 * The agency table's mode columns, the same on every area page and in the shared mode order, so a mode's column never
 * moves from page to page; a missing mode shows a dash (CIV-973, Ryan: "the columns should never move").
 */
export const AREA_TABLE_MODES: readonly string[] = [1, VIRTUAL_LRT_MODE, 0, 2, 3, 4].map(modeLabel);
/** One last column for every other mode (gondola/aerial tram, cable car, funicular, ...), shown only where an area has one. */
export const AREA_TABLE_OTHER = 'Other';
/**
 * Modes this table counts in another mode's column (Ryan picked seven columns, CIV-973): monorail with subway/metro,
 * trolleybus with bus. Every other surface keeps them separate.
 */
const AREA_TABLE_GROUPED: Readonly<Record<string, string>> = {
  [modeLabel(12)]: modeLabel(1),
  [modeLabel(11)]: modeLabel(3),
};

/** The table column a mode's routes count in. */
export function areaTableColumn(modeLabel: string): string {
  return AREA_TABLE_GROUPED[modeLabel] ?? (AREA_TABLE_MODES.includes(modeLabel) ? modeLabel : AREA_TABLE_OTHER);
}

/** The header tooltip for a column that counts more than its own mode; undefined for the rest. */
export function areaTableColumnTitle(column: string): string | undefined {
  const sentence = (labels: string[], last: string) => {
    const words = labels.map(l => l.toLowerCase());
    return capitalizeFirst(`${words.join(', ')} and ${last} routes`);
  };
  if (column === AREA_TABLE_OTHER) {
    return sentence(MODE_DEFINITIONS.filter(m => m.id !== ON_DEMAND_MODE && areaTableColumn(m.label) === AREA_TABLE_OTHER).map(m => m.label), 'other');
  }
  const extra = Object.entries(AREA_TABLE_GROUPED).filter(([, to]) => to === column).map(([from]) => from.toLowerCase());
  return extra.length > 0 ? sentence([column], extra.join(' and ')) : undefined;
}

/**
 * The agencies counted on an area page (they have a page: weekday midday service), each with only the
 * routes counted there. CIV-274: a route counts in every area where it stops at two places (more than
 * AREA_SAME_PLACE_METERS apart) inside the official boundary (`areas`, from build-agency-page-summaries), whichever
 * agency runs it; an agency is listed when one of its routes counts. Summaries without area tags
 * (older files) fall back to the area's own agency list.
 */
export function areaAgencySummaries(area: Pick<AreaConfig, 'agencies' | 'slug'>, all: ReadonlyMap<string, AgencyPageSummary>): AgencyPageSummary[] {
  const hasPage = hasMiddayService;
  const tagged = [...all.values()].some(a => a.routes.some(r => r.areas !== undefined));
  if (!tagged) return area.agencies.map(s => all.get(s)).filter((a): a is AgencyPageSummary => !!a && hasPage(a));
  const out: AgencyPageSummary[] = [];
  for (const a of all.values()) {
    if ((a.betaOnly && !BETA_BUILD) || !hasPage(a)) continue;
    const routes = a.routes.filter(r => r.areas?.includes(area.slug));
    if (routes.length > 0) out.push({ ...a, routes, routeCount: routes.length });
  }
  return out;
}

/** An agency's route counts by table column (areaTableColumn): the fixed modes, the grouped ones added in, the rest in "Other". */
function tableModes(byMode: ReadonlyArray<{ label: string; routes: readonly unknown[] }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of byMode) {
    const key = areaTableColumn(m.label);
    out[key] = (out[key] ?? 0) + m.routes.length;
  }
  return out;
}

/** The page numbers for a set of agencies, each with only the routes the page counts: the rows, bar, mode counts and dates. */
export function agencyGroupData(members: readonly AgencyPageSummary[], all: ReadonlyMap<string, AgencyPageSummary>, releaseDate: string | null): AgencyGroupData {
  const shared = sharedOfficialNames([...all.values()]);
  const allRoutes = members.flatMap(a => a.routes);
  const modeCounts = new Map<string, number>();
  let newest: string | null = null;
  const rows: AreaAgencyRow[] = [];
  for (const a of members) {
    const s = agencyStats(a);
    for (const m of s.byMode) modeCounts.set(m.label, (modeCounts.get(m.label) ?? 0) + m.routes.length);
    if (a.lastRefreshedAt && (!newest || a.lastRefreshedAt > newest)) newest = a.lastRefreshedAt;
    rows.push({
      slug: a.slug,
      name: a.name,
      title: agencyTitle(a, shared),
      displayName: a.displayName,
      totalRoutes: s.totalRoutes,
      modes: tableModes(s.byMode),
    });
  }
  rows.sort((x, y) => y.totalRoutes - x.totalRoutes || compareAgencyName(x.name, y.name) || x.slug.localeCompare(y.slug));
  const best = bestRoute(members.flatMap(a => a.routes.map(r => ({ ...r, agency: a.displayName }))));
  const byMode = [...modeCounts.entries()].map(([label, routes]) => ({ label, routes }))
    .sort((x, y) => modeLabelSortIndex(x.label) - modeLabelSortIndex(y.label));
  return {
    totalRoutes: allRoutes.length,
    bands: bandCounts(allRoutes),
    best: best ? { name: best.route.name, headway: best.headway, agency: best.route.agency } : null,
    byMode,
    agencies: rows,
    modeColumns: [...AREA_TABLE_MODES, ...(rows.some(r => r.modes[AREA_TABLE_OTHER]) ? [AREA_TABLE_OTHER] : [])],
    newestRefresh: newest,
    releaseDate,
  };
}

export function buildAreaPageData(area: AreaConfig, all: ReadonlyMap<string, AgencyPageSummary>, releaseDate: string | null): AreaPageData {
  const members = areaAgencySummaries(area, all);
  const { slug, name, type, officialName, country, cities, bbox, center, note } = area;
  const regionRoutes = new Map<string, number>();
  for (const a of members) {
    if (a.region && area.agencies.includes(a.slug)) regionRoutes.set(a.region, (regionRoutes.get(a.region) ?? 0) + a.routes.length);
  }
  const regions = [...regionRoutes.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([r]) => r);
  const group = agencyGroupData(members, all, releaseDate);
  const { totalRoutes, bands, best, byMode, agencies, modeColumns, newestRefresh } = group;
  return {
    area: { slug, name, type, officialName, country, cities, bbox, center, ...(note ? { note } : {}) },
    totalRoutes,
    bands,
    best,
    byMode,
    agencies,
    regions,
    modeColumns,
    newestRefresh,
    releaseDate,
  };
}

export function areaPageTitle(d: Pick<AreaPageData, 'area' | 'agencies'>): string {
  return groupPageTitle(areaRegionTitle(d.area), d);
}

/** A page title for agencies in one place (an area's title, a state's or province's name). */
export function groupPageTitle(region: string, d: Pick<AgencyGroupData, 'agencies'>): string {
  const across = `how often transit runs across ${countOf(d.agencies.length, 'agency', 'agencies')}`;
  return firstThatFits([
    `${region}: ${across} | Transit Atlas`,
    `${region}: ${across}`,
    `${region} transit frequency | Transit Atlas`,
    `${region} transit frequency`,
    `${truncateAtWord(region, TITLE_MAX - ' transit frequency'.length)} transit frequency`,
  ], TITLE_MAX);
}

export function areaPageH1(d: Pick<AreaPageData, 'area'>): string {
  return areaRegionTitle(d.area);
}

/**
 * The line under the title: the area's cities, or when the title already names every one of them (CIV-968: "Pittsburgh
 * area" over "Pittsburgh"), its states or provinces instead; '' when the title is just the state or province.
 * A state inside a city's name still adds the state ("Iowa City area" over "Iowa").
 */
export function areaSubtitle(d: Pick<AreaPageData, 'area' | 'regions'>): string {
  const title = areaRegionTitle(d.area).toLowerCase();
  if (d.area.cities.some(c => !title.includes(c.toLowerCase()))) return d.area.cities.join(', ');
  const titlePlace = title.replace(/\b(greater|metro|metropolitan|area|region)\b/g, '').replace(/\s+/g, ' ').trim();
  return (d.regions ?? []).filter(r => r.toLowerCase() !== titlePlace).join(', ');
}

/** One sentence that stands alone, used as the meta description's opening. */
export function areaLeadSentence(d: AreaPageData): string {
  return groupLeadSentence(areaRegionName(d.area), d);
}

/** The lead sentence for agencies in one place, named as inside a sentence ("the Calgary area", "Colorado"). */
export function groupLeadSentence(where: string, d: Pick<AgencyGroupData, 'totalRoutes' | 'agencies'>): string {
  return `${countOf(d.totalRoutes, 'weekday route', 'weekday routes')} across ${countOf(d.agencies.length, 'transit agency', 'transit agencies')} in ${where}.`;
}

export function areaPageDescription(d: AreaPageData): string {
  return groupPageDescription(areaRegionName(d.area), d);
}

/** The meta description for agencies in one place, named as inside a sentence. */
export function groupPageDescription(where: string, d: Pick<AgencyGroupData, 'totalRoutes' | 'agencies'>): string {
  const n = d.agencies.length;
  return firstThatFits([
    `Compare ${countOf(n, 'transit agency', 'transit agencies')} in ${where} side by side: routes and weekday waits by time of day, from published schedules.`,
    `Compare ${countOf(n, 'transit agency', 'transit agencies')} in ${where}: routes and weekday waits by time of day.`,
    `${groupLeadSentence(where, d)} Compare each agency's routes and frequency.`,
    groupLeadSentence(where, d),
  ], DESCRIPTION_MAX);
}

/** An area with more agencies than this names its two biggest and counts the rest (CIV-968); a smaller one names none (Ryan). */
const AREA_INTRO_NAME_NONE_MAX = 3;
const AREA_INTRO_NAMED = 2;

/**
 * The intro's agencies, by route count (the table's order): none when there are at most three (the sentence ends after
 * the route breakdown), else the two biggest plus how many others there are. `lead` is the counting sentence up to where
 * the names start.
 */
export function areaIntroParts(d: AreaPageData): { lead: string; named: AreaAgencyRow[]; others: number } {
  return groupIntroParts(areaRegionSentenceStart(d.area), d);
}

/** The same intro for agencies in one place, named as at the start of a sentence ("The Calgary area", "Colorado"). */
export function groupIntroParts(placeStart: string, d: Pick<AgencyGroupData, 'agencies' | 'totalRoutes' | 'byMode'>): { lead: string; named: AreaAgencyRow[]; others: number } {
  const n = d.agencies.length;
  const lead = `${placeStart} has ${countOf(n, 'transit agency', 'transit agencies')} running ${countOf(d.totalRoutes, 'route', 'routes')}${d.byMode.length > 1 ? ` (${modesText(d.byMode, ', ')})` : ''}`;
  if (n <= AREA_INTRO_NAME_NONE_MAX) return { lead, named: [], others: 0 };
  const named = d.agencies.slice(0, AREA_INTRO_NAMED);
  return { lead, named, others: n - named.length };
}

/** The joiners around the intro's names, after "including" (Ryan): "including A, B and 7 others."; just "." with no names. */
export function areaIntroJoiners(parts: Pick<ReturnType<typeof areaIntroParts>, 'named' | 'others'>): { opener: string; separators: string[]; tail: string } {
  const count = parts.named.length + (parts.others > 0 ? 1 : 0);
  const separators = parts.named.map((_, i) => (i === count - 2 ? ' and ' : i < count - 2 ? ', ' : ''));
  return {
    opener: parts.named.length === 0 ? '' : ', including ',
    separators,
    tail: parts.others > 0 ? `${countOf(parts.others, 'other', 'others')}.` : '.',
  };
}

/** An agency's name in the intro: its card title, as agency intros use (#1245: "TheRide", not "TheRide (Ann Arbor)"). */
export function areaIntroName(_d: Pick<AreaPageData, 'area'>, a: Pick<AreaAgencyRow, 'title'>): string {
  return a.title;
}

/** The intro as plain text (the page links each name to its agency page). */
export function areaAboutParagraph(d: AreaPageData): string {
  const parts = areaIntroParts(d);
  const j = areaIntroJoiners(parts);
  return `${parts.lead}${j.opener}${parts.named.map((a, i) => areaIntroName(d, a) + j.separators[i]).join('')}${j.tail}`;
}

/** The line under an area page's frequency bar. */
export const AREA_BAR_NOTE = "The bar splits this area's routes by how often they run on a weekday midday. Each route is judged by its slower direction.";

export function areaDatesText(d: Pick<AreaPageData, 'newestRefresh' | 'releaseDate'>): string {
  const refreshed = formatDataDate(d.newestRefresh);
  const release = formatDataDate(d.releaseDate);
  return ["Based on the agencies' published schedules, not live arrivals.", refreshed ? `Newest schedule published ${refreshed}.` : '', release ? `This page was last updated ${release}.` : ''].filter(Boolean).join(' ');
}

/**
 * The map link for an area page: the area's own agencies (`?area=`), plus `agencies=` listing every
 * agency counted on the page when that adds one (CIV-274: Fraser Valley on Vancouver), so the map
 * shows the same service the page counts. The map reads `agencies` first and still fits to the area.
 */
export function areaMapHref(d: Pick<AreaPageData, 'area'> & Partial<Pick<AreaPageData, 'agencies'>>, areas = AREA_INDEX): string {
  const params = new URLSearchParams({ [AREA_PARAM]: d.area.slug });
  const listed = areas[d.area.slug]?.agencies ?? [];
  const extra = (d.agencies ?? []).map(a => a.slug).filter(s => !listed.includes(s));
  if (extra.length > 0) params.set('agencies', [...listed, ...extra].join(','));
  return `/?${params.toString()}`;
}

export function resolveAreaSeo(
  d: AreaPageData,
  ctx: { mode: SeoMode; origin?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = seoTitlePrefix(ctx.mode);
  return {
    title: `${prefix}${areaPageTitle(d)}`,
    description: areaPageDescription(d),
    canonicalUrl: `${origin}${areaPagePath(d.area.slug)}`,
    noindex: ctx.mode !== 'public',
    matchedPath: areaPagePath(d.area.slug),
  };
}

/** BreadcrumbList and Dataset; the breadcrumb is not shown on the page. */
export function areaPageJsonLd(d: AreaPageData, canonicalUrl: string, origin: string): object {
  const crumbs = [{ name: 'Transit Atlas', item: `${origin}/` }, { name: d.area.country }, { name: areaRegionTitle(d.area), item: canonicalUrl }];
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
        name: `${areaRegionTitle(d.area)} transit frequency`,
        description: areaPageDescription(d),
        url: canonicalUrl,
        isAccessibleForFree: true,
        spatialCoverage: { '@type': 'Place', name: `${areaRegionTitle(d.area)}, ${d.area.country}` },
        creator: { '@type': 'Organization', name: 'Civic Minds', url: `${SITE_URL}/` },
        ...(modified ? { dateModified: modified } : {}),
      },
    ],
  };
}

