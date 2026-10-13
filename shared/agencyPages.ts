/**
 * Data and wording for the /agency/<slug> pages. Pure and DOM-free so the build scripts, the
 * browser page and the tests all share one definition. Every number on a page is counted from
 * the per-route headways already published in the data release (see
 * scripts/build-agency-page-summaries.ts); nothing here measures anything new.
 */
import { headwayEvery, headwayOrBetter } from './headwayText';
import { SITE_URL } from './seo';

export { headwayEvery, headwayOrBetter };

/** Frequency threshold behind the lead sentence and the frequent share. */
export const FREQUENT_MINUTES = 15;
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

export interface AgencyPageSummary extends AgencyPageIdentity {
  /** Name plus its city in brackets, e.g. "TTC (Toronto)". */
  displayName: string;
  /** Display city for the breadcrumb and areaServed. */
  city: string;
  country?: string;
  /** Distinct weekday routes in the release. */
  routeCount: number;
  routes: AgencyPageRoute[];
  /** First and last hour (0-28, past 24 is after midnight) with weekday headways. */
  span: { first: number; last: number } | null;
  lastRefreshedAt: string | null;
}

export interface AgencyPageSummaries {
  releaseId: string;
  generatedAt: string;
  agencies: AgencyPageSummary[];
}

export const AGENCY_PATH_PREFIX = '/agency/';

export function agencyPagePath(slug: string): string {
  return `${AGENCY_PATH_PREFIX}${slug}`;
}

export function agencyPageTitle(a: Pick<AgencyPageSummary, 'displayName'>): string {
  return `${a.displayName} frequency map: frequent routes and service levels | Transit Atlas`;
}

export function agencyPageH1(a: Pick<AgencyPageSummary, 'displayName'>): string {
  return `${a.displayName} frequent service map`;
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

export interface AgencyPageStats {
  /** Distinct weekday routes in the release. */
  totalRoutes: number;
  frequentMidday: number;
  frequentAm: number;
  frequentPm: number;
  /** Whole percent of all routes that run every 15 min or better at midday. */
  frequentShare: number;
  byMode: Array<{ mode: number; label: string; routes: AgencyPageRoute[] }>;
}

export function agencyStats(a: Pick<AgencyPageSummary, 'routes'>): AgencyPageStats {
  const within = (v: number | null) => v != null && v <= FREQUENT_MINUTES;
  const totalRoutes = a.routes.length;
  const frequentMidday = a.routes.filter(r => within(r.midday)).length;
  const modes = [...new Set(a.routes.map(r => r.mode))].sort((x, y) => {
    const ix = MODE_ORDER.indexOf(x);
    const iy = MODE_ORDER.indexOf(y);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x - y;
  });
  return {
    totalRoutes,
    frequentMidday,
    frequentAm: a.routes.filter(r => within(r.am)).length,
    frequentPm: a.routes.filter(r => within(r.pm)).length,
    frequentShare: totalRoutes ? Math.round((frequentMidday / totalRoutes) * 100) : 0,
    byMode: modes.map(mode => ({ mode, label: modeLabel(mode), routes: a.routes.filter(r => r.mode === mode) })),
  };
}

/** One sentence that stands alone: "38 of 210 routes run every 15 min or better on a weekday midday." */
export function agencyLeadSentence(a: Pick<AgencyPageSummary, 'routes'>): string {
  const s = agencyStats(a);
  return `${s.frequentMidday} of ${s.totalRoutes} routes run ${headwayOrBetter(FREQUENT_MINUTES)} on a weekday midday.`;
}

export function agencyPageDescription(a: AgencyPageSummary): string {
  return `${agencyLeadSentence(a)} Route-by-route frequency for ${a.displayName}, from the published schedule.`;
}

function hourLabel(h: number): string {
  const hour = h % 24;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

export function agencySpanText(a: Pick<AgencyPageSummary, 'span'>): string | null {
  if (!a.span) return null;
  return `${hourLabel(a.span.first)} to ${hourLabel(a.span.last + 1)}`;
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

/** Transit Atlas > Country > State or province > Agency. The city is left out: the first city an agency lists is not always its main one. */
export function agencyBreadcrumbs(a: AgencyPageSummary): Crumb[] {
  const crumbs: Crumb[] = [{ name: 'Transit Atlas', href: '/' }];
  if (a.country) crumbs.push({ name: a.country });
  if (a.region) crumbs.push({ name: a.region });
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
  ctx: { mode: 'public' | 'preview' | 'beta' | 'dev'; origin?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = ctx.mode === 'preview' ? '[Preview] ' : ctx.mode === 'public' ? '' : '[Beta] ';
  return {
    title: `${prefix}${agencyPageTitle(a)}`,
    description: agencyPageDescription(a),
    canonicalUrl: `${origin}${agencyPagePath(a.slug)}`,
    noindex: ctx.mode !== 'public',
    matchedPath: agencyPagePath(a.slug),
  };
}

/** Organization (the agency), BreadcrumbList and Dataset. No FAQ markup. */
export function agencyPageJsonLd(a: AgencyPageSummary, canonicalUrl: string, origin: string): object {
  const crumbs = agencyBreadcrumbs(a);
  const modified = formatIso(a.lastRefreshedAt);
  const area = [a.region, a.country].filter(Boolean).join(', ');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${canonicalUrl}#agency`,
        name: a.name,
        ...(a.websiteUrl ? { url: a.websiteUrl, sameAs: [a.websiteUrl] } : {}),
        areaServed: { '@type': 'Place', name: area || a.displayName },
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
        description: agencyPageDescription(a),
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
  return m && m[1].toLowerCase().includes(m[2].toLowerCase()) ? m[1] : displayName;
}
