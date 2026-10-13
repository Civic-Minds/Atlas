/**
 * Data and wording for the /area/<slug> pages: one metro area, its agencies side by side. Every
 * number is added up from the per-agency summaries (shared/agencyPages.ts); nothing new is measured.
 */
import {
  agencyStats,
  bandCounts,
  bestRoute,
  formatDataDate,
  headwayEvery,
  modeLabel,
  type AgencyPageSummary,
} from './agencyPages';
import { AREA_PATH_PREFIX, areaPagePath, type AreaConfig } from './areas';
import { SITE_URL } from './seo';

export { AREA_PATH_PREFIX, areaPagePath };

/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const AREA_DATA_SCRIPT_ID = 'area-page-data';

export interface AreaAgencyRow {
  slug: string;
  displayName: string;
  totalRoutes: number;
  /** Route counts by mode label (only modes the agency has). */
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
  /** Mode columns for the agency table: modes at least one agency has, in display order. */
  modeColumns: string[];
  /** Newest schedule refresh among the area's agencies, and the data release the numbers come from. */
  newestRefresh: string | null;
  releaseDate: string | null;
}

const MODE_ORDER = ['Subway', 'Light rail', 'Streetcar', 'Rail', 'Monorail', 'Bus', 'Trolleybus', 'Ferry', 'Cable car', 'Gondola', 'Funicular'];
const SPAN_VARIES_HOURS = 3;

/** Agencies of the area that have a page (weekday midday service), in the area's own order. */
export function areaAgencySummaries(area: Pick<AreaConfig, 'agencies'>, all: ReadonlyMap<string, AgencyPageSummary>): AgencyPageSummary[] {
  return area.agencies.map(s => all.get(s)).filter((a): a is AgencyPageSummary => !!a && a.routes.some(r => r.midday != null));
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
      displayName: a.displayName,
      totalRoutes: s.totalRoutes,
      modes: Object.fromEntries(s.byMode.map(m => [m.label, m.routes.length])),
    });
  }
  rows.sort((x, y) => y.totalRoutes - x.totalRoutes || x.displayName.localeCompare(y.displayName));
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
    .sort((x, y) => (MODE_ORDER.indexOf(x.label) + 1 || 99) - (MODE_ORDER.indexOf(y.label) + 1 || 99));
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
    modeColumns: byMode.map(m => m.label),
    newestRefresh: newest,
    releaseDate,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function areaPageTitle(d: Pick<AreaPageData, 'area' | 'agencies'>): string {
  return `${d.area.name} area frequency map: ${plural(d.agencies.length, 'transit agency', 'transit agencies')} compared | Transit Atlas`;
}

export function areaPageH1(d: Pick<AreaPageData, 'area'>): string {
  return `${d.area.name} area`;
}

export function areaSubtitle(d: Pick<AreaPageData, 'area'>): string {
  return d.area.cities.join(', ');
}

/** One sentence that stands alone, used as the meta description's opening. */
export function areaLeadSentence(d: AreaPageData): string {
  return `${plural(d.totalRoutes, 'weekday route', 'weekday routes')} across ${plural(d.agencies.length, 'transit agency', 'transit agencies')} in the ${d.area.name} area.`;
}

export function areaPageDescription(d: AreaPageData): string {
  return `${areaLeadSentence(d)} Compare each agency's routes and frequency.`;
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
  const out: string[] = [`The ${d.area.name} area has ${plural(n, 'transit agency', 'transit agencies')} running ${plural(d.totalRoutes, 'route', 'routes')}.`];
  return out.join(' ');
}

export function areaDatesText(d: Pick<AreaPageData, 'newestRefresh' | 'releaseDate'>): string {
  const refreshed = formatDataDate(d.newestRefresh);
  const release = formatDataDate(d.releaseDate);
  return [refreshed ? `Newest schedule refresh ${refreshed}` : '', release ? `Atlas data release ${release}` : ''].filter(Boolean).join('. ') + '.';
}

/** The map link: framed on the area's bounds with only its agencies on (the app's `agencies` include list). */
export function areaMapHref(d: Pick<AreaPageData, 'area' | 'agencies'>): string {
  const [s, w, n, e] = d.area.bbox;
  const [lat, lon] = d.area.center;
  const span = Math.max(n - s, (e - w) * Math.cos((lat * Math.PI) / 180));
  const z = span > 3 ? 7 : span > 1.5 ? 8 : span > 0.7 ? 9 : span > 0.35 ? 10 : 11;
  const params = new URLSearchParams({ agencies: d.agencies.map(a => a.slug).join('.'), lat: lat.toFixed(4), lon: lon.toFixed(4), z: String(z) });
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
  const crumbs = [{ name: 'Transit Atlas', item: `${origin}/` }, { name: d.area.country }, { name: `${d.area.name} area`, item: canonicalUrl }];
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
        name: `${d.area.name} area transit frequency`,
        description: areaPageDescription(d),
        url: canonicalUrl,
        isAccessibleForFree: true,
        spatialCoverage: { '@type': 'Place', name: `${d.area.name} area, ${d.area.country}` },
        creator: { '@type': 'Organization', name: 'Civic Minds', url: `${SITE_URL}/` },
        ...(m ? { dateModified: `${m[1]}-${m[2]}-${m[3]}` } : {}),
      },
    ],
  };
}

export { modeLabel };
