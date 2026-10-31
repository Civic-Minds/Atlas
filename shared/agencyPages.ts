/**
 * Data and wording for the /agency/<slug> pages. Pure and DOM-free so the build scripts, the
 * browser page and the tests all share one definition. Every number on a page is counted from
 * the per-route headways already published in the data release (see
 * scripts/build-agency-page-summaries.ts); nothing here measures anything new.
 */
import { agencyTodayYmd, isExpiredFeedExpiry } from './feedAvailability';
import { headwayEvery, headwayEveryRange, headwayOrBetter } from './headwayText';
import { modeLabel, sortModes } from './modes';
import { compareAgencyName, compareNullableAscending } from './sortCompare';
import { areaRegionName, areaRegionTitle } from './areaRegions';
import { BETA_BUILD } from './config';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, firstThatFits, truncateAtWord } from './seoText';
import { SITE_URL, seoTitlePrefix, type SeoMode } from './seo';
import { AGENCY_PATH_PREFIX, agencyPagePath, areaPagePath } from './pagePaths';
import { zoomForSpan } from './mapZoom';
import { haversineM } from './shapeProjection';
import { andOthers, joinList, plural } from './overflowText';
import { agencyNames } from '../src/utils/agencyName';
import { splitRegistryName } from './agencyRegistryName';

export { headwayEvery };
const MAX_NEARBY = 8;

export interface AgencyPageRoute {
  /** The route's key and sort value on agency pages: the feed's short name, else its long name, else its route ID. */
  name: string;
  /**
   * CIV-984: the feed's own short name, '' when it has none, so pages label the route with routeLabels.
   * Missing in summaries written before it was added.
   */
  shortName?: string;
  longName: string | null;
  /** effectiveMode() (shared/modes.ts): 0 streetcar, 1 subway/metro, 2 commuter rail, 3 bus, 4 ferry, 100 light rail, ... */
  mode: number;
  /** Weekday headway in minutes: the map filter's own number (worst direction); null with no sustained service. */
  midday: number | null;
  am: number | null;
  pm: number | null;
  evening: number | null;
  overnight: number | null;
  /** Periods where the route runs but has no trustworthy cadence (the route card says "limited"). */
  limited?: Array<'am' | 'midday' | 'pm' | 'evening' | 'overnight'>;
  /** #1249: periods where the route runs but the filter finds no regular service (the map list says "no regular service"). */
  noRegular?: Array<'am' | 'midday' | 'pm' | 'evening' | 'overnight'>;
  /** Lower end of a shared-stretch range per period, where alternating branches combine (display only). */
  shared?: Partial<Record<'am' | 'midday' | 'pm' | 'evening' | 'overnight', number>>;
  /** CIV-274: paged areas (config/areas slugs) where this route stops at two places inside (shared/areaBoundaries.ts). */
  areas?: string[];
}

export interface AgencyPageIdentity {
  slug: string;
  name: string;
  region?: string;
  cities?: string[];
  center?: [number, number];
  bbox?: [number, number, number, number];
  websiteUrl?: string;
  /** Visible on beta, preview and dev builds only; the public build never lists it. */
  betaOnly?: true;
}

/** Another agency whose stops are within walking distance of this one's, with the routes that serve them. */
export interface AgencyConnection {
  slug: string;
  /** Short name, e.g. "GO Transit". */
  name: string;
  /** Route labels, natural order. Written by hand in the connection config (nothing generates them from getRouteLabel). */
  routes: string[];
  /** The other agency is beta-only: dropped from public pages. */
  betaOnly?: true;
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
  /** Last day the published service covers, yyyymmdd: the earliest end across every feed (effectiveFeedExpiry), the date the map reads. */
  validThrough?: string | null;
  /** The agency's time zone, so "ended" turns on its own local date, as on the map (isAgencyFeedExpired). */
  timezone?: string | null;
  /** CIV-1011: the catalog's listingEndedOn, yyyymmdd: most routes stopped being listed then (Ryan's notice). */
  listingEndedOn?: string | null;
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
  /** The page heading and the name its sentences use: agencyTitle, told apart from same-named agencies (#1245). */
  title: string;
  nearby: Array<{ slug: string; name: string }>;
  /** generatedAt of the data release the numbers come from. */
  releaseDate: string | null;
  /** The metro area page this agency belongs to, when it has one. */
  area?: { slug: string; name: string };
  /** The one-sentence introduction, also the opening of the meta description. */
  intro: string;
  /** The search-result description: the intro, cut as the registry-named intro would be (#1245). */
  description: string;
  /** The place the intro names, and the text before it, so the page can link the place to its area page. */
  place: string;
  introLead: string;
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

/** "A", "A and B", "A, B and C", "A, B, C and 4 other agencies": the first three named, the rest counted. */
export function namesList(names: readonly string[], named = 3): string {
  if (names.length <= named) return joinList(names);
  const rest = names.length - named;
  return `${names.slice(0, named).join(', ')} ${andOthers(rest, 'agency', 'agencies')}`;
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
  title: string = agencyTitle(a),
): string {
  const n = a.routes.length;
  if (n === 0) return `${title} has no weekday routes in the data.`;
  let s = `${introLead(a, place, modes, title)}${place}`;
  if (a.stops) s += ` with ${a.stops.toLocaleString('en-US')} ${plural(a.stops, 'stop')}`;
  if (connections.length) s += `${CONNECTS_WITH}${namesList(connections.map(c => c.name))}`;
  return `${s}.`;
}

/** "TTC (Toronto)" as ["TTC", "Toronto"]; null for a name with no bracketed place at the end. */
function splitBracketedPlace(name: string): [string, string] | null {
  const m = /^(.*\S)\s+\(([^)]+)\)$/.exec(name);
  return m ? [m[1], m[2]] : null;
}

/**
 * The agency's official name, from agencyNames() (#1245): the page heading, the intro and its "connects with", the nearby
 * list, the area intro and table, the agency index and the website link. Never the registry form with its bracket
 * ("Montgomery Transit", not "Montgomery Transit (The M)").
 */
export function agencyTitle(a: Pick<AgencyPageIdentity, 'name'>, shared: ReadonlySet<string> = NO_SHARED_NAMES): string {
  const official = agencyNames(a.name).official;
  // Agencies that share an official name keep what tells them apart, as a list row shows a place ("BC Transit · Kelowna").
  const extra = shared.has(official) ? splitRegistryName(a.name)[1] : null;
  return extra ? `${official} · ${extra}` : official;
}

const NO_SHARED_NAMES: ReadonlySet<string> = new Set();

/** The official names more than one agency has (BC Transit, exo, MTA NYCT Bus), so agencyTitle can tell them apart. */
export function sharedOfficialNames(all: readonly Pick<AgencyPageIdentity, 'name'>[]): Set<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const a of all) {
    const official = agencyNames(a.name).official;
    (seen.has(official) ? shared : seen).add(official);
  }
  return shared;
}

/** Every agency's title in a list, worked out once per list: the prerender builds 547 pages from the same one. */
const TITLES = new WeakMap<object, Map<string, string>>();
function titlesOf(all: readonly Pick<AgencyPageIdentity, 'slug' | 'name'>[]): Map<string, string> {
  let titles = TITLES.get(all);
  if (!titles) {
    const shared = sharedOfficialNames(all);
    titles = new Map(all.map(o => [o.slug, agencyTitle(o, shared)]));
    TITLES.set(all, titles);
  }
  return titles;
}

/** The agency's short name (#1245), for the agency index's rows too tight for the title ("CDTA", "Muni"). */
export function agencyMention(a: Pick<AgencyPageIdentity, 'name'>): string {
  return agencyNames(a.name).name;
}

/** Everything in the intro before the place: "Hamilton Street Railway operates 31 routes in ". */
export function introLead(
  a: Pick<AgencyPageSummary, 'name' | 'routes'>,
  place: string,
  modes: ReadonlyArray<{ label: string; routes: number }> = [],
  title: string = agencyTitle(a),
): string {
  const n = a.routes.length;
  return `${title} operates ${n.toLocaleString('en-US')} ${plural(n, 'route')}${modes.length > 1 ? ` (${modesText(modes, ', ')})` : ''} in `;
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
  // Every agency in the list has a page (CIV-965), so a connection links whenever its agency is in it.
  const hasPage = new Set(all.map(o => o.slug));
  const titleOf = titlesOf(all);
  const title = titleOf.get(a.slug) ?? agencyTitle(a);
  const connections = (a.connections ?? []).filter(c => !c.betaOnly || BETA_BUILD).map(c => ({ ...c, name: titleOf.get(c.slug) ?? agencyTitle({ name: c.name }), page: hasPage.has(c.slug) }));
  const place = area && agencySpansArea(a.bbox, area.bbox) ? areaRegionName(area) : a.city;
  const areaRef = area ? { slug: area.slug, name: area.name } : undefined;
  const { connections: _drop, ...agency } = a;
  const modes = agencyStats(a).byMode.map(m => ({ label: m.label, routes: m.routes.length }));
  const intro = agencyIntroSentence(a, place, connections, modes, title);
  // The same sentence with registry names sizes the search description, so it keeps what it kept before (#1245).
  const registryName = new Map(all.map(o => [o.slug, o.name]));
  const sizedBy = agencyIntroSentence(a, place, connections.map(c => ({ ...c, name: registryName.get(c.slug) ?? c.name })), modes, sizingName(a.name, place));
  return { agency, title, releaseDate, ...(areaRef ? { area: areaRef } : {}), nearby: others.map(o => ({ slug: o.slug, name: titleOf.get(o.slug) ?? agencyTitle(o) })), intro, description: agencyPageDescription(a, intro, sizedBy), place, introLead: introLead(a, place, modes, title), connections };
}

const MAX_AREA_LIST = 12;

export { AGENCY_PATH_PREFIX, agencyPagePath };

/** "TTC frequency: how often routes run | Transit Atlas", dropping the brand, then the phrase, for long names (60 characters at most). */
export function agencyPageTitle(a: Pick<AgencyPageSummary, 'displayName'>): string {
  const name = agencyShortLabel(a);
  return firstThatFits([
    `${name} frequency: how often routes run | Transit Atlas`,
    `${name} frequency: how often routes run`,
    `${name} frequency | Transit Atlas`,
    `${name} frequency`,
    `${truncateAtWord(name, TITLE_MAX - ' frequency'.length)} frequency`,
  ], TITLE_MAX);
}

/** Visible heading: the agency's official name ("GO Transit", "Montgomery Transit"); agencyPageData's `title` also tells same-named agencies apart. The short form lives in <title>. */
export function agencyPageH1(a: Pick<AgencyPageSummary, 'name'>): string {
  return agencyTitle(a);
}


/** Weekday-midday frequency bands, best first; the last one is routes with no regular midday service. */
export const FREQUENCY_BANDS = [
  { key: 'b10', phrase: headwayOrBetter(10), short: '≤10', test: (m: number) => m <= 10 },
  { key: 'b15', phrase: headwayEveryRange(11, 15), short: '11–15', test: (m: number) => m <= 15 },
  { key: 'b20', phrase: headwayEveryRange(16, 20), short: '16–20', test: (m: number) => m <= 20 },
  { key: 'b30', phrase: headwayEveryRange(21, 30), short: '21–30', test: (m: number) => m <= 30 },
  { key: 'b60', phrase: headwayEveryRange(31, 60), short: '31–60', test: (m: number) => m <= 60 },
  { key: 'b60plus', phrase: `less often than ${headwayEvery(60)}`, short: '60+', test: () => true },
] as const;
export const NO_MIDDAY_PHRASE = 'with no regular midday service';
export const NO_MIDDAY_SHORT = 'no midday';

/**
 * At least one route with a regular weekday midday cadence. Area pages and their area files list only these agencies;
 * every agency has its own page either way (CIV-965). The one place this rule is written.
 */
export function hasMiddayService(a: { routes: ReadonlyArray<{ midday: number | null }> }): boolean {
  return a.routes.some(r => r.midday != null);
}

/** Route counts per band (same order as FREQUENCY_BANDS), then routes with no midday cadence last. */
export function bandCounts(routes: ReadonlyArray<Pick<AgencyPageRoute, 'midday'>>): number[] {
  const counts = new Array<number>(FREQUENCY_BANDS.length + 1).fill(0);
  for (const r of routes) {
    if (r.midday == null) { counts[FREQUENCY_BANDS.length]++; continue; }
    counts[FREQUENCY_BANDS.findIndex(b => b.test(r.midday!))]++;
  }
  return counts;
}

/**
 * The map link under the frequency bar: the page's own map link (agency or area framing) with Weekday, Midday and
 * no speed filter (every route), using the same `h`, `p` and `day` parameters the map reads.
 */
export function allRoutesMapHref(mapHref: string): string {
  const [path, query = ''] = mapHref.split('?');
  const params = new URLSearchParams(query);
  params.set('h', 'all');
  params.set('p', 'midday');
  params.set('day', 'Weekday');
  return `${path}?${params.toString()}`;
}

export interface AgencyPageStats {
  /** Distinct weekday routes in the release. */
  totalRoutes: number;
  byMode: Array<{ mode: number; label: string; routes: AgencyPageRoute[] }>;
}

/** Routes grouped by mode, in the shared mode order, each with its label ("Streetcar"). The agency pages and Live share it. */
export function routesByMode<R extends { mode: number }>(routes: readonly R[]): Array<{ mode: number; label: string; routes: R[] }> {
  return sortModes(new Set(routes.map(r => r.mode)), mode => mode).map(mode => ({ mode, label: modeLabel(mode), routes: routes.filter(r => r.mode === mode) }));
}

export function agencyStats(a: Pick<AgencyPageSummary, 'routes'>): AgencyPageStats {
  return {
    totalRoutes: a.routes.length,
    byMode: routesByMode(a.routes),
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

/** One sentence that stands alone: "210 weekday routes." */
export function agencyLeadSentence(a: Pick<AgencyPageSummary, 'routes'>): string {
  const n = a.routes.length;
  return `${n} weekday ${plural(n, 'route')}.`;
}

/** The fuller sentence for structured data: the intro plus what the page is. */
export function agencyDatasetDescription(a: AgencyPageSummary, intro?: string): string {
  return `${intro ?? agencyLeadSentence(a)} Route-by-route frequency for ${a.displayName}, from the published schedule.`;
}

/**
 * The meta description: the intro sentence (name, route count, city, a few connections), losing the mode split, the stop
 * count and the connections in turn until it fits, and topped up with what the page is when short. 155 characters at most.
 */
export function agencyPageDescription(a: AgencyPageSummary, intro?: string, sizedBy?: string): string {
  const shown = descriptionCuts(intro ?? agencyLeadSentence(a));
  // Which parts fit is decided on `sizedBy` (the intro with registry names), so shorter names never change what the
  // description keeps (#1245): it stays as before apart from the names.
  const sized = sizedBy ? descriptionCuts(sizedBy) : shown;
  const at = sized.findIndex(c => c.length <= DESCRIPTION_MAX);
  const base = at >= 0 ? shown[at] : truncateAtWord(shown[shown.length - 1], DESCRIPTION_MAX);
  const sizedBase = at >= 0 ? sized[at] : truncateAtWord(sized[sized.length - 1], DESCRIPTION_MAX);
  if (sizedBase.length >= DESCRIPTION_MIN || !sizedBase.endsWith('.')) return base;
  const tail = [' Weekday route frequency by time of day, from the published schedule.', ' Weekday waits by time of day.']
    .find(t => sizedBase.length + t.length <= DESCRIPTION_MAX);
  return tail ? `${base}${tail}` : base;
}

/** The name the intro used before #1245, only to size the description: the registry name, its "(Place)" dropped when the sentence names that place. */
function sizingName(name: string, place: string): string {
  const m = splitBracketedPlace(name);
  if (!m) return name;
  const paren = m[1].toLowerCase();
  const where = place.toLowerCase();
  return where.includes(paren) || paren.includes(where.replace(/^the /, '')) ? m[0] : name;
}

/** The intro, then without its modes, its stops and its connections: the description's cuts, best wording first. */
function descriptionCuts(full: string): string[] {
  const noModes = full.replace(/ \([^)]*\)(?= in )/, '');
  const noStops = noModes.replace(/ with [\d,]+ stops?/, '');
  const noConnections = noStops.replace(/ and connects with .*?\.$/, '.');
  return [full, noModes, noStops, noConnections];
}

/** The agency's name without its bracketed city: "TTC (Toronto)" becomes "TTC". */
export function agencyShortLabel(a: Pick<AgencyPageSummary, 'displayName'>): string {
  return splitBracketedPlace(a.displayName)?.[0] ?? a.displayName;
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
      params.set('z', String(zoomForSpan(span)));
    } else {
      params.set('z', '10');
    }
  }
  return `/?${params.toString()}`;
}

/** The year, month and day of an ISO or yyyymmdd date (match groups 1 to 3), or null. */
function dateParts(value: string | null | undefined): RegExpExecArray | null {
  return value ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value) : null;
}

/**
 * The page footer in plain words: what the numbers are based on, when the timetable was published and how long it runs,
 * and when Atlas last updated the page. A clause whose date is missing is left out; an ended timetable says so.
 */
// N25 listing-ended (Ryan's exact text, CIV-1011). One definition for the agency page and the map (content/noticeCopy re-exports it).
// Ryan: "ended is past but ends is upcoming": "ends" before the listing-end date (agency-local), "ended" from it on.
export const listingEndedNotice = (date: string, ended: boolean) => `This agency's scheduled service for most routes ${ended ? 'ended' : 'ends'} ${date}, and they have not released updated data.`;
/** Whether the listing-end date (yyyymmdd) has arrived, given today's agency-local yyyymmdd. */
export const listingEndHasPassed = (listingEndedOn: string, todayYmd: string) => todayYmd >= listingEndedOn;
// N112 listing-ended-page (Ryan's exact text, CIV-1055): agency pages only, when the timetable has a through date.
// Cards and notices keep N25.
export const listingEndedPageLine = (through: string, date: string, ended: boolean) => `This schedule covers service until ${through}, but most of its routes ${ended ? 'ended' : 'end'} ${date}.`;

export function agencyDatesText(a: Pick<AgencyPageSummary, 'lastRefreshedAt' | 'validThrough' | 'listingEndedOn' | 'timezone'>, releaseDate: string | null, todayYmd: string = agencyTodayYmd(a)): string {
  const published = formatDataDate(a.lastRefreshedAt);
  const through = formatDataDate(a.validThrough);
  const release = formatDataDate(releaseDate);
  const listingEnded = formatDataDate(a.listingEndedOn);
  // The map's rule (isAgencyFeedExpired): ended from the day after the last day, in the agency's own date.
  const datesClause = through && isExpiredFeedExpiry(a.validThrough, todayYmd)
    ? `This schedule ended on ${through}; the agency hasn't published a newer one yet.`
    // N112 with a through date, else N25 (CIV-1055): "covers service until" alone would overstate a timetable whose routes mostly stopped.
    : listingEnded && through ? listingEndedPageLine(through, listingEnded, listingEndHasPassed(a.listingEndedOn!, todayYmd))
    : listingEnded ? listingEndedNotice(listingEnded, listingEndHasPassed(a.listingEndedOn!, todayYmd))
    : published && through ? `This schedule was published ${published} and covers service until ${through}.`
    : published ? `This schedule was published ${published}.`
    : through ? `This schedule covers service until ${through}.`
    : '';
  return ["Based on the agency's published schedule, not live arrivals.", datesClause, release ? `This page was last updated ${release}.` : ''].filter(Boolean).join(' ');
}

/** "Oct 12, 2026" from an ISO or yyyymmdd date; null when unusable. */
export function formatDataDate(value: string | null | undefined): string | null {
  const m = dateParts(value);
  if (!m) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : null;
}

/** "2026-10-12" from an ISO or yyyymmdd date; null when unusable. */
export function formatIso(value: string | null | undefined): string | null {
  const m = dateParts(value);
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
  if (area) crumbs.push({ name: areaRegionTitle(area), href: areaPagePath(area.slug) });
  else if (a.city && a.city !== a.region && a.city !== a.displayName) crumbs.push({ name: a.city });
  crumbs.push({ name: a.displayName });
  return crumbs;
}

function distanceKm(a: [number, number], b: [number, number]): number {
  return haversineM(a[0], a[1], b[0], b[1]) / 1000;
}

/** Other agencies with a page in the same region, nearest first. */
export function nearbyAgencies(a: AgencyPageSummary, all: readonly AgencyPageSummary[], limit = MAX_NEARBY): AgencyPageSummary[] {
  if (!a.region) return [];
  return all
    .filter(o => o.slug !== a.slug && o.region === a.region)
    .map(o => ({ o, d: a.center && o.center ? distanceKm(a.center, o.center) : Infinity }))
    .sort((x, y) => compareNullableAscending(x.d, y.d) || compareAgencyName(x.o.displayName, y.o.displayName) || x.o.slug.localeCompare(y.o.slug))
    .slice(0, limit)
    .map(x => x.o);
}

/** Everything the head needs for an agency page, in the same shape as the other routes. */
export function resolveAgencySeo(
  a: AgencyPageSummary,
  ctx: { mode: SeoMode; origin?: string; intro?: string; description?: string },
): { title: string; description: string; canonicalUrl: string; noindex: boolean; matchedPath: string } {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const prefix = seoTitlePrefix(ctx.mode);
  return {
    title: `${prefix}${agencyPageTitle(a)}`,
    description: ctx.description ?? agencyPageDescription(a, ctx.intro),
    canonicalUrl: `${origin}${agencyPagePath(a.slug)}`,
    noindex: ctx.mode !== 'public',
    matchedPath: agencyPagePath(a.slug),
  };
}

/** Organization (the agency), BreadcrumbList and Dataset. No FAQ markup. */
export function agencyPageJsonLd(a: AgencyPageSummary, canonicalUrl: string, origin: string, area?: { slug: string; name: string }, intro?: string): object {
  const crumbs = agencyBreadcrumbs(a, area);
  const modified = formatIso(a.lastRefreshedAt);
  // A city that is the state itself ("Colorado" for a statewide service) is named once, not "Colorado, Colorado" (#1130).
  const place = [a.city, a.region, a.country].filter((p, i, all): p is string => !!p && p !== all[i + 1]).join(', ');
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
        description: agencyDatasetDescription(a, intro),
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
  const m = splitBracketedPlace(displayName);
  if (!m) return displayName;
  const [outer, inner] = [m[0].toLowerCase(), m[1].toLowerCase()];
  return outer.includes(inner) || inner.includes(outer) ? m[0] : displayName;
}
