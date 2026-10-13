/**
 * Data and wording for the /agency/<slug> pages. Pure and DOM-free so the build scripts, the
 * browser page and the tests all share one definition. Every number on a page is counted from
 * the per-route headways already published in the data release (see
 * scripts/build-agency-page-summaries.ts); nothing here measures anything new.
 */
import { headwayEvery } from './headwayText';
import { areaRegionName, areaRegionTitle } from './areaRegions';
import { SITE_URL } from './seo';

export { headwayEvery };
export const MAX_NEARBY = 8;

export interface AgencyPageRoute {
  name: string;
  longName: string | null;
  /** effectiveMode(): 0 streetcar, 1 subway, 2 rail, 3 bus, 4 ferry, 100 light rail, ... */
  mode: number;
  /** Weekday headway in minutes (worst direction, like the map filter); null with no sustained service. */
  midday: number | null;
  am: number | null;
  pm: number | null;
  evening: number | null;
  overnight: number | null;
  /** Periods where the route runs but has no trustworthy cadence (the route card says "limited"). */
  limited?: Array<'am' | 'midday' | 'pm' | 'evening' | 'overnight'>;
}

export interface AgencyPageIdentity {
  slug: string;
  name: string;
  region?: string;
  cities?: string[];
  center?: [number, number];
  bbox?: [number, number, number, number];
  websiteUrl?: string;
}

/** Another agency whose stops are within walking distance of this one's, with the routes that serve them. */
export interface AgencyConnection {
  slug: string;
  /** Short name, e.g. "GO Transit". */
  name: string;
  /** Route labels as the map lists them (see getRouteLabel), natural order. */
  routes: string[];
}

export interface AgencyPageSummary extends AgencyPageIdentity {
  /** Name plus its city in brackets, e.g. "TTC (Toronto)". */
  displayName: string;
  /** Display city for the breadcrumb and areaServed. */
  city: string;
  country?: string;
  /** Distinct weekday routes in the release. */
  routeCount: number;
  /** Unique stops and stations (same-name stops within 150 m count once). */
  stops?: number;
  /** Other agencies with a stop within 150 m of one of this agency's stops, most routes first. */
  connections?: AgencyConnection[];
  routes: AgencyPageRoute[];
  /** First and last hour (0-28, past 24 is after midnight) with weekday headways. */
  span: { first: number; last: number } | null;
  lastRefreshedAt: string | null;
  /** Last day the published feed covers (the catalog's lastFeedExpiry), yyyymmdd. */
  validThrough?: string | null;
  /** Whether the release has Saturday / Sunday service for this agency (published day types). */
  sat?: boolean;
  sun?: boolean;
}

export interface AgencyPageSummaries {
  releaseId: string;
  generatedAt: string;
  agencies: AgencyPageSummary[];
}

/** A page's own numbers plus links to nearby agencies: all one page needs, embedded in its HTML. */
export interface AgencyPageData {
  agency: AgencyPageSummary;
  nearby: Array<{ slug: string; name: string }>;
  /** generatedAt of the data release the numbers come from. */
  releaseDate: string | null;
  /** The metro area page this agency belongs to, when it has one. */
  area?: { slug: string; name: string };
  /** The one-sentence introduction, also the opening of the meta description. */
  intro: string;
  /** Connecting agencies (stops within 150 m), with whether each has a page to link to. */
  connections: Array<AgencyConnection & { page: boolean }>;
}

type AreaRef = { slug: string; name: string; bbox?: [number, number, number, number] };

/** True when the agency's bounding box covers most of the area's in both directions (GO across the Toronto area). */
export function agencySpansArea(agencyBbox: readonly number[] | undefined, areaBbox: readonly number[] | undefined): boolean {
  if (!agencyBbox || !areaBbox) return false;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / (b1 - b0 || 1);
  return overlap(agencyBbox[0], agencyBbox[2], areaBbox[0], areaBbox[2]) >= 0.6 && overlap(agencyBbox[1], agencyBbox[3], areaBbox[1], areaBbox[3]) >= 0.6;
}

/** The first three connecting agencies by name and how many more there are. */
export function connectionNames<T>(connections: readonly T[], named = 3): { named: T[]; others: number } {
  return { named: connections.slice(0, named), others: Math.max(0, connections.length - named) };
}

/** The literal the intro sentence puts before the connecting agencies (the page splits on it to link the names). */
export const CONNECTS_WITH = ' and connects with ';

/** "A", "A and B", "A, B and C", "A, B, C and 4 others": the first three named, the rest counted. */
export function namesList(names: readonly string[], named = 3): string {
  if (names.length <= named) return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const rest = names.length - named;
  return `${names.slice(0, named).join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

/**
 * One plain sentence, the same template for every agency (the mode split appears when there is more than one mode):
 * "Hamilton Street Railway operates 31 routes in Hamilton with 1,980 stops and connects with GO Transit and Burlington Transit."
 * Stops are unique places (same-name stops within 150 m count once); the connects-with clause drops when there are none.
 */
export function agencyIntroSentence(
  a: Pick<AgencyPageSummary, 'name' | 'city' | 'routes' | 'stops'>,
  place: string,
  connections: ReadonlyArray<{ name: string }> = [],
  modes: ReadonlyArray<{ label: string; routes: number }> = [],
): string {
  const n = a.routes.length;
  if (n === 0) return `${a.name} has no weekday routes in the data.`;
  let s = `${a.name} operates ${n.toLocaleString('en-US')} ${n === 1 ? 'route' : 'routes'}${modes.length > 1 ? ` (${modesText(modes, ', ')})` : ''} in ${place}`;
  if (a.stops) s += ` with ${a.stops.toLocaleString('en-US')} ${a.stops === 1 ? 'stop' : 'stops'}`;
  if (connections.length) s += `${CONNECTS_WITH}${namesList(connections.map(c => c.name))}`;
  return `${s}.`;
}

/** The prerendered HTML carries its data in <script type="application/json" id=...>. */
export const AGENCY_DATA_SCRIPT_ID = 'agency-page-data';

export function agencyPageData(
  a: AgencyPageSummary,
  all: readonly AgencyPageSummary[],
  releaseDate: string | null = null,
  area?: AreaRef,
  areaMembers?: readonly AgencyPageSummary[],
): AgencyPageData {
  // With an area page, the list is the area's other agencies (nearest first); otherwise same-region neighbours.
  const others = areaMembers
    ? areaMembers.filter(o => o.slug !== a.slug)
        .sort((x, y) => (a.center && x.center ? distanceKm(a.center, x.center) : 0) - (a.center && y.center ? distanceKm(a.center, y.center) : 0))
        .slice(0, MAX_AREA_LIST)
    : nearbyAgencies(a, all);
  const hasPage = new Set(all.filter(o => o.routes.some(r => r.midday != null)).map(o => o.slug));
  const connections = (a.connections ?? []).map(c => ({ ...c, page: hasPage.has(c.slug) }));
  const place = area && agencySpansArea(a.bbox, area.bbox) ? areaRegionName(area) : a.city;
  const areaRef = area ? { slug: area.slug, name: area.name } : undefined;
  const { connections: _drop, ...agency } = a;
  return { agency, releaseDate, ...(areaRef ? { area: areaRef } : {}), nearby: others.map(o => ({ slug: o.slug, name: o.name })), intro: agencyIntroSentence(a, place, connections, agencyStats(a).byMode.map(m => ({ label: m.label, routes: m.routes.length }))), connections };
}

const MAX_AREA_LIST = 12;

export const AGENCY_PATH_PREFIX = '/agency/';

export function agencyPagePath(slug: string): string {
  return `${AGENCY_PATH_PREFIX}${encodeURIComponent(slug)}`;
}

export function agencyPageTitle(a: Pick<AgencyPageSummary, 'displayName'>): string {
  return `${a.displayName} frequency map: frequent routes and service levels | Transit Atlas`;
}

/** Visible heading: short name plus city, "TTC · Toronto". The long SEO wording lives in <title>. */
export function agencyPageH1(a: Pick<AgencyPageSummary, 'displayName'>): string {
  const m = /^(.*\S)\s+\(([^)]+)\)$/.exec(a.displayName);
  return m ? `${m[1]} · ${m[2]}` : a.displayName;
}

const MODE_LABELS: Record<number, [singular: string, plural: string]> = {
  1: ['Subway', 'Subway'],
  100: ['Light rail', 'Light rail'],
  0: ['Streetcar', 'Streetcar'],
  2: ['Rail', 'Rail'],
  3: ['Bus', 'Bus'],
  11: ['Trolleybus', 'Trolleybus'],
  4: ['Ferry', 'Ferry'],
  12: ['Monorail', 'Monorail'],
  5: ['Cable car', 'Cable car'],
  6: ['Gondola', 'Gondola'],
  7: ['Funicular', 'Funicular'],
};
const MODE_ORDER = [1, 100, 0, 2, 12, 3, 11, 4, 5, 6, 7];

export function modeLabel(mode: number): string {
  return MODE_LABELS[mode]?.[0] ?? 'Other';
}

/** Weekday-midday frequency bands, best first; the last one is routes with no regular midday service. */
export const FREQUENCY_BANDS = [
  { key: 'b10', phrase: 'every 10 min or better', test: (m: number) => m <= 10 },
  { key: 'b15', phrase: 'every 11–15 min', test: (m: number) => m <= 15 },
  { key: 'b20', phrase: 'every 16–20 min', test: (m: number) => m <= 20 },
  { key: 'b30', phrase: 'every 21–30 min', test: (m: number) => m <= 30 },
  { key: 'b60', phrase: 'every 31–60 min', test: (m: number) => m <= 60 },
  { key: 'b60plus', phrase: 'less often than every 60 min', test: () => true },
] as const;
export const NO_MIDDAY_PHRASE = 'with no regular midday service';

/** Route counts per band (same order as FREQUENCY_BANDS), then routes with no midday cadence last. */
export function bandCounts(routes: ReadonlyArray<Pick<AgencyPageRoute, 'midday'>>): number[] {
  const counts = new Array<number>(FREQUENCY_BANDS.length + 1).fill(0);
  for (const r of routes) {
    if (r.midday == null) { counts[FREQUENCY_BANDS.length]++; continue; }
    counts[FREQUENCY_BANDS.findIndex(b => b.test(r.midday!))]++;
  }
  return counts;
}

export interface AgencyPageStats {
  /** Distinct weekday routes in the release. */
  totalRoutes: number;
  byMode: Array<{ mode: number; label: string; routes: AgencyPageRoute[] }>;
}

function modeOrder(modes: Iterable<number>): number[] {
  return [...new Set(modes)].sort((x, y) => {
    const ix = MODE_ORDER.indexOf(x);
    const iy = MODE_ORDER.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x - y;
  });
}

export function agencyStats(a: Pick<AgencyPageSummary, 'routes'>): AgencyPageStats {
  return {
    totalRoutes: a.routes.length,
    byMode: modeOrder(a.routes.map(r => r.mode)).map(mode => ({ mode, label: modeLabel(mode), routes: a.routes.filter(r => r.mode === mode) })),
  };
}

/** The route with the shortest weekday-midday headway (ties: first listed); null with none. */
export function bestRoute<R extends Pick<AgencyPageRoute, 'midday' | 'name'>>(routes: readonly R[]): { route: R; headway: number } | null {
  let best: { route: R; headway: number } | null = null;
  for (const r of routes) if (r.midday != null && (!best || r.midday < best.headway)) best = { route: r, headway: r.midday };
  return best;
}

/** "3 subway · 2 light rail · 209 bus" */
export function modesText(byMode: ReadonlyArray<{ label: string; routes: number }>, separator = ' · '): string {
  return byMode.map(m => `${m.routes} ${m.label.toLowerCase()}`).join(separator);
}

/** What the release has for Saturday and Sunday: a short sub-label, or null when unknown. */
export function weekendLabel(sat: boolean | undefined, sun: boolean | undefined): string | null {
  if (sat === undefined && sun === undefined) return null;
  if (sat && sun) return 'Runs Sat & Sun';
  if (sat) return 'Runs Saturdays';
  if (sun) return 'Runs Sundays';
  return 'Weekdays only';
}

/** One sentence that stands alone: "210 weekday routes." */
export function agencyLeadSentence(a: Pick<AgencyPageSummary, 'routes'>): string {
  const n = a.routes.length;
  return `${n} weekday ${n === 1 ? 'route' : 'routes'}.`;
}

export function agencyPageDescription(a: AgencyPageSummary, intro?: string): string {
  return `${intro ?? agencyLeadSentence(a)} Route-by-route frequency for ${a.displayName}, from the published schedule.`;
}

function hourLabel(h: number): string {
  const hour = h % 24;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

export function agencySpanText(a: Pick<AgencyPageSummary, 'span'>): string | null {
  if (!a.span) return null;
  if (a.span.last + 1 - a.span.first >= 24) return 'Runs 24 hours';
  return `${hourLabel(a.span.first)} to ${hourLabel(a.span.last + 1)}`;
}

/** Short form for a tile: "24 h" or "5am–2am", so it stays on one line. */
export function agencySpanShort(a: Pick<AgencyPageSummary, 'span'>): string | null {
  if (!a.span) return null;
  if (a.span.last + 1 - a.span.first >= 24) return '24 h';
  return `${hourLabel(a.span.first)}–${hourLabel(a.span.last + 1)}`;
}

/** The agency's name without its bracketed city: "TTC (Toronto)" becomes "TTC". */
export function agencyShortLabel(a: Pick<AgencyPageSummary, 'displayName'>): string {
  const m = /^(.*\S)\s+\([^)]+\)$/.exec(a.displayName);
  return m ? m[1] : a.displayName;
}

/** The map link for the big button: the agency's area, with only that agency on. */
export function agencyMapHref(a: AgencyPageIdentity): string {
  const params = new URLSearchParams({ agencies: a.slug });
  if (a.center) {
    const [lat, lon] = a.center;
    params.set('lat', lat.toFixed(4));
    params.set('lon', lon.toFixed(4));
    if (a.bbox) {
      const span = Math.max(a.bbox[2] - a.bbox[0], (a.bbox[3] - a.bbox[1]) * Math.cos((lat * Math.PI) / 180));
      params.set('z', String(span > 3 ? 7 : span > 1.5 ? 8 : span > 0.7 ? 9 : span > 0.35 ? 10 : 11));
    } else {
      params.set('z', '10');
    }
  }
  return `/?${params.toString()}`;
}

/** The dates, each named for what it is: the agency's schedule, and the Atlas data release it came from. */
export function agencyDatesText(a: Pick<AgencyPageSummary, 'lastRefreshedAt' | 'validThrough'>, releaseDate: string | null): string {
  const parts: string[] = [];
  const refreshed = formatDataDate(a.lastRefreshedAt);
  const through = formatDataDate(a.validThrough);
  const release = formatDataDate(releaseDate);
  if (refreshed) parts.push(`Schedule refreshed ${refreshed}`);
  if (through) parts.push(`valid through ${through}`);
  const schedule = parts.join(', ');
  return [schedule, release ? `Atlas data release ${release}` : ''].filter(Boolean).join('. ') + '.';
}

/** "Oct 12, 2026" from an ISO or yyyymmdd date; null when unusable. */
export function formatDataDate(value: string | null | undefined): string | null {
  const m = value ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value) : null;
  if (!m) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : null;
}

function formatIso(value: string | null | undefined): string | null {
  const m = value ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export interface Crumb {
  name: string;
  /** Only crumbs that have a real page link; geography levels have no hub page yet. */
  href?: string;
}

/** Transit Atlas > Country > State or province > primary city > Agency. The city is the config's displayArea, else its first listed city. */
export function agencyBreadcrumbs(a: AgencyPageSummary, area?: { slug: string; name: string }): Crumb[] {
  const crumbs: Crumb[] = [{ name: 'Transit Atlas', href: '/' }];
  if (a.country) crumbs.push({ name: a.country });
  if (a.region) crumbs.push({ name: a.region });
  if (area) crumbs.push({ name: areaRegionTitle(area), href: `/area/${area.slug}` });
  else if (a.city && a.city !== a.region && a.city !== a.displayName) crumbs.push({ name: a.city });
  crumbs.push({ name: a.displayName });
  return crumbs;
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Other agencies with a page in the same region, nearest first. */
export function nearbyAgencies(a: AgencyPageSummary, all: readonly AgencyPageSummary[], limit = MAX_NEARBY): AgencyPageSummary[] {
  if (!a.region) return [];
  return all
    .filter(o => o.slug !== a.slug && o.region === a.region)
    .map(o => ({ o, d: a.center && o.center ? distanceKm(a.center, o.center) : Infinity }))
    .sort((x, y) => x.d - y.d || x.o.displayName.localeCompare(y.o.displayName))
    .slice(0, limit)
    .map(x => x.o);
}

/** Everything the head needs for an agency page, in the same shape as the other routes. */
export function resolveAgencySeo(
  a: AgencyPageSummary,
  ctx: { mode: 'public' | 'preview' | 'beta' | 'dev'; origin?: string; intro?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = ctx.mode === 'preview' ? '[Preview] ' : ctx.mode === 'public' ? '' : '[Beta] ';
  return {
    title: `${prefix}${agencyPageTitle(a)}`,
    description: agencyPageDescription(a, ctx.intro),
    canonicalUrl: `${origin}${agencyPagePath(a.slug)}`,
    noindex: ctx.mode !== 'public',
    matchedPath: agencyPagePath(a.slug),
  };
}

/** Organization (the agency), BreadcrumbList and Dataset. No FAQ markup. */
export function agencyPageJsonLd(a: AgencyPageSummary, canonicalUrl: string, origin: string, area?: { slug: string; name: string }, intro?: string): object {
  const crumbs = agencyBreadcrumbs(a, area);
  const modified = formatIso(a.lastRefreshedAt);
  const place = [a.city, a.region, a.country].filter(Boolean).join(', ');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${canonicalUrl}#agency`,
        name: a.name,
        ...(a.websiteUrl ? { url: a.websiteUrl, sameAs: [a.websiteUrl] } : {}),
        areaServed: { '@type': 'Place', name: place || a.displayName },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          ...(c.href ? { item: `${origin}${c.href}` } : i === crumbs.length - 1 ? { item: canonicalUrl } : {}),
        })),
      },
      {
        '@type': 'Dataset',
        name: `${a.name} scheduled service frequency`,
        description: agencyPageDescription(a, intro),
        url: canonicalUrl,
        isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: 'Civic Minds', url: `${SITE_URL}/` },
        about: { '@id': `${canonicalUrl}#agency` },
        ...(modified ? { dateModified: modified } : {}),
      },
    ],
  };
}

/** Drops a bracketed city the name already holds: "Halifax Transit (Halifax)" becomes "Halifax Transit". */
export function trimRedundantCity(displayName: string): string {
  const m = /^(.*\S)\s+\(([^)]+)\)$/.exec(displayName);
  if (!m) return displayName;
  const [outer, inner] = [m[1].toLowerCase(), m[2].toLowerCase()];
  return outer.includes(inner) || inner.includes(outer) ? m[1] : displayName;
}
