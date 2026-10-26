/**
 * Data and wording for the /area/<slug> pages: one metro area, its agencies side by side. Every
 * number is added up from the per-agency summaries (shared/agencyPages.ts); nothing new is measured.
 */
import {
  agencyStats,
  bandCounts,
  bestRoute,
  formatDataDate,
  hasMiddayService,
  headwayEvery,
  modesText,
  modeLabel,
  type AgencyPageSummary,
} from './agencyPages';
import { MODE_DEFINITIONS, VIRTUAL_LRT_MODE, modeLabelSortIndex } from './modes';
import { BETA_BUILD } from './config';
import { AREA_INDEX, AREA_PARAM } from './areaIndex';
import { AREA_PATH_PREFIX, areaPagePath, type AreaConfig } from './areas';
import { areaRegionName, areaRegionSentenceStart, areaRegionTitle } from './areaRegions';
import { SITE_URL } from './seo';
import { compareAgencyName } from './sortCompare';
import { DESCRIPTION_MAX, TITLE_MAX, firstThatFits, truncateAtWord } from './seoText';

export { AREA_PATH_PREFIX, areaPagePath };

/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const AREA_DATA_SCRIPT_ID = 'area-page-data';

export interface AreaAgencyRow {
  slug: string;
  name: string;
  /** The agency's short display name ("WETA (San Francisco Bay)"), for a narrow names column. */
  displayName: string;
  totalRoutes: number;
  /** Route counts by table column (AREA_TABLE_MODES, rarer modes added into "Other"), only the columns the agency has. */
  modes: Record<string, number>;
}

export interface AreaPageData {
  area: Pick<AreaConfig, 'slug' | 'name' | 'type' | 'officialName' | 'country' | 'cities' | 'bbox' | 'center' | 'note'>;
  totalRoutes: number;
  /** Route counts per weekday-midday frequency band (see FREQUENCY_BANDS), no-midday last. */
  bands: number[];
  /** The route with the shortest weekday-midday headway, with its agency. */
  best: { name: string; headway: number; agency: string } | null;
  byMode: Array<{ label: string; routes: number }>;
  span: { first: number; last: number } | null;
  /** True when agencies' first or last departures differ by 3 hours or more. */
  spanVaries: boolean;
  /** Saturday and Sunday: every agency has it, none do, or it varies. */
  weekend: 'both' | 'sat' | 'sun' | 'none' | 'varies' | null;
  agencies: AreaAgencyRow[];
  /** Mode columns for the agency table: the same fixed set on every area page (AREA_TABLE_MODES), then "Other" when an agency has a rarer mode. */
  modeColumns: string[];
  /** Newest schedule refresh among the area's agencies, and the data release the numbers come from. */
  newestRefresh: string | null;
  releaseDate: string | null;
}

const SPAN_VARIES_HOURS = 3;

/**
 * The agency table's mode columns, the same on every area page and in the shared mode order, so a mode's column never
 * moves from page to page; a missing mode shows a dash (CIV-973, Ryan: "the columns should never move").
 */
export const AREA_TABLE_MODES: readonly string[] = [1, VIRTUAL_LRT_MODE, 0, 2, 3, 4, 6]
  .map(id => MODE_DEFINITIONS.find(m => m.id === id)!.label);
/** One last column for the rarer modes (monorail, cable car, funicular, ...), shown only where an area has one. */
export const AREA_TABLE_OTHER = 'Other';
/** Trolleybus routes count in this table's Bus column (Ryan, CIV-973); every other surface keeps them separate. */
const TROLLEYBUS_LABEL = MODE_DEFINITIONS.find(m => m.id === 11)!.label;
const BUS_LABEL = MODE_DEFINITIONS.find(m => m.id === 3)!.label;

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

/** An agency's route counts by table column: the fixed modes as they are, trolleybus added into Bus, every other mode into "Other". */
function tableModes(byMode: ReadonlyArray<{ label: string; routes: readonly unknown[] }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of byMode) {
    const key = m.label === TROLLEYBUS_LABEL ? BUS_LABEL : AREA_TABLE_MODES.includes(m.label) ? m.label : AREA_TABLE_OTHER;
    out[key] = (out[key] ?? 0) + m.routes.length;
  }
  return out;
}

export function buildAreaPageData(area: AreaConfig, all: ReadonlyMap<string, AgencyPageSummary>, releaseDate: string | null): AreaPageData {
  const members = areaAgencySummaries(area, all);
  const allRoutes = members.flatMap(a => a.routes);
  const modeCounts = new Map<string, number>();
  let firstMin = Infinity, firstMax = -Infinity, lastMin = Infinity, lastMax = -Infinity;
  let newest: string | null = null;
  const rows: AreaAgencyRow[] = [];
  for (const a of members) {
    const s = agencyStats(a);
    for (const m of s.byMode) modeCounts.set(m.label, (modeCounts.get(m.label) ?? 0) + m.routes.length);
    if (a.span) {
      firstMin = Math.min(firstMin, a.span.first); firstMax = Math.max(firstMax, a.span.first);
      lastMin = Math.min(lastMin, a.span.last); lastMax = Math.max(lastMax, a.span.last);
    }
    if (a.lastRefreshedAt && (!newest || a.lastRefreshedAt > newest)) newest = a.lastRefreshedAt;
    rows.push({
      slug: a.slug,
      name: a.name,
      displayName: a.displayName,
      totalRoutes: s.totalRoutes,
      modes: tableModes(s.byMode),
    });
  }
  rows.sort((x, y) => y.totalRoutes - x.totalRoutes || compareAgencyName(x.name, y.name) || x.slug.localeCompare(y.slug));
  const known = members.filter(a => a.sat !== undefined || a.sun !== undefined);
  const all2 = (k: 'sat' | 'sun') => known.length > 0 && known.every(a => a[k]);
  const any2 = (k: 'sat' | 'sun') => known.some(a => a[k]);
  const weekend: AreaPageData['weekend'] = known.length === 0 ? null
    : all2('sat') && all2('sun') ? 'both'
    : !any2('sat') && !any2('sun') ? 'none'
    : all2('sat') && !any2('sun') ? 'sat'
    : all2('sun') && !any2('sat') ? 'sun'
    : 'varies';
  const best = bestRoute(members.flatMap(a => a.routes.map(r => ({ ...r, agency: a.displayName }))));
  const { slug, name, type, officialName, country, cities, bbox, center, note } = area;
  const byMode = [...modeCounts.entries()].map(([label, routes]) => ({ label, routes }))
    .sort((x, y) => modeLabelSortIndex(x.label) - modeLabelSortIndex(y.label));
  return {
    area: { slug, name, type, officialName, country, cities, bbox, center, ...(note ? { note } : {}) },
    totalRoutes: allRoutes.length,
    bands: bandCounts(allRoutes),
    best: best ? { name: best.route.name, headway: best.headway, agency: best.route.agency } : null,
    byMode,
    span: Number.isFinite(firstMin) ? { first: firstMin, last: lastMax } : null,
    spanVaries: Number.isFinite(firstMin) && (firstMax - firstMin >= SPAN_VARIES_HOURS || lastMax - lastMin >= SPAN_VARIES_HOURS),
    weekend,
    agencies: rows,
    modeColumns: [...AREA_TABLE_MODES, ...(rows.some(r => r.modes[AREA_TABLE_OTHER]) ? [AREA_TABLE_OTHER] : [])],
    newestRefresh: newest,
    releaseDate,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function areaPageTitle(d: Pick<AreaPageData, 'area' | 'agencies'>): string {
  const region = areaRegionTitle(d.area);
  const across = `how often transit runs across ${plural(d.agencies.length, 'agency', 'agencies')}`;
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

export function areaSubtitle(d: Pick<AreaPageData, 'area'>): string {
  return d.area.cities.join(', ');
}

/** One sentence that stands alone, used as the meta description's opening. */
export function areaLeadSentence(d: AreaPageData): string {
  return `${plural(d.totalRoutes, 'weekday route', 'weekday routes')} across ${plural(d.agencies.length, 'transit agency', 'transit agencies')} in ${areaRegionName(d.area)}.`;
}

export function areaPageDescription(d: AreaPageData): string {
  const n = d.agencies.length;
  const where = areaRegionName(d.area);
  return firstThatFits([
    `Compare ${plural(n, 'transit agency', 'transit agencies')} in ${where} side by side: routes and weekday waits by time of day, from published schedules.`,
    `Compare ${plural(n, 'transit agency', 'transit agencies')} in ${where}: routes and weekday waits by time of day.`,
    `${areaLeadSentence(d)} Compare each agency's routes and frequency.`,
    areaLeadSentence(d),
  ], DESCRIPTION_MAX);
}

function hourLabel(h: number): string {
  const hour = h % 24;
  return `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
}

/** Stat text for the span: "24 h" or "5am–2am". */
export function areaSpanShort(d: Pick<AreaPageData, 'span'>): string | null {
  if (!d.span) return null;
  return d.span.last + 1 - d.span.first >= 24 ? '24 h' : `${hourLabel(d.span.first)}–${hourLabel(d.span.last + 1)}`;
}

/** Sub-label under the hours: weekend service, and "varies by agency" when the span is wide. */
export function areaHoursLabel(d: Pick<AreaPageData, 'weekend' | 'spanVaries'>): string {
  const weekend = d.weekend === 'both' ? 'Runs Sat & Sun' : d.weekend === 'sat' ? 'Runs Saturdays' : d.weekend === 'sun' ? 'Runs Sundays'
    : d.weekend === 'none' ? 'Weekdays only' : d.weekend === 'varies' ? 'Weekends vary by agency' : '';
  return ['weekday service', d.spanVaries ? 'varies by agency' : '', weekend].filter(Boolean).join(' · ');
}

/** One plain sentence, the same template for every area. */
export function areaAboutParagraph(d: AreaPageData): string {
  const n = d.agencies.length;
  const out: string[] = [`${areaRegionSentenceStart(d.area)} has ${plural(n, 'transit agency', 'transit agencies')} running ${plural(d.totalRoutes, 'route', 'routes')}${d.byMode.length > 1 ? ` (${modesText(d.byMode, ', ')})` : ''}.`];
  return out.join(' ');
}

export function areaDatesText(d: Pick<AreaPageData, 'newestRefresh' | 'releaseDate'>): string {
  const refreshed = formatDataDate(d.newestRefresh);
  const release = formatDataDate(d.releaseDate);
  return ["Based on the agencies' published timetables, not live arrivals.", refreshed ? `Newest timetable published ${refreshed}.` : '', release ? `Atlas last updated this page ${release}.` : ''].filter(Boolean).join(' ');
}

/** The map link: `?area=<slug>` selects the area's agencies and fits the map to it (the app does the framing). */
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
  ctx: { mode: 'public' | 'preview' | 'beta' | 'dev'; origin?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = ctx.mode === 'preview' ? '[Preview] ' : ctx.mode === 'public' ? '' : '[Beta] ';
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
  const m = d.newestRefresh ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(d.newestRefresh) : null;
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
        ...(m ? { dateModified: `${m[1]}-${m[2]}-${m[3]}` } : {}),
      },
    ],
  };
}

export { modeLabel };
