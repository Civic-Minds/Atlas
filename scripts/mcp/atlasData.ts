/**
 * CIV-1650: the data behind the private local Atlas MCP server (scripts/mcp/atlas-mcp.ts). Reads Atlas's own processed
 * per-agency route files from disk and answers with the map's numbers, computed by the map's own shared functions
 * (routeListFilterDisplay, routeListDisplay, routeRuns, frequencyChange), never re-derived here. Read-only: nothing is
 * fetched or written.
 *
 * Where the route files come from, first match wins (ATLAS_MCP_DATA_DIR overrides both):
 * - tmp/agency-pages-cache/<releaseId>/<slug>.json: a published release, cached by build-agency-page-summaries.ts;
 * - tmp/process-preview/<slug>/<slug>.json: a local `npm run process -- --dry-run` of the agency.
 * Public agencies only (public/data/catalog-public.json): a beta-only or unlaunched agency is never answered.
 */
import { agencyGroupName, groupAgencies, groupHome } from '../../shared/agencyGroups';
import type { AtlasStore, IndexedAgency, McpAgency, McpFeature, McpStop, PeriodFigure, RankAgency, RankWait, RouteLabel, RouteSummary } from '../../shared/mcpStore';
import { PERIOD_KEYS, PERIOD_LABELS, PERIOD_MINUTES, formatPeriodRange, type PeriodKey } from '../../shared/config';
import { DAY_TYPES, dayPlural, type DayType } from '../../shared/rules/days';
import { PUBLIC_TIER_MAXES, headwayGradeOn } from '../../shared/rules/frequency';
import { routeGroupKey } from '../../shared/routeGroupKey';
import { normalizeRouteFilterFeatures, readingPassesHeadwayFilter, type RouteFilterReading } from '../../shared/routeHeadwayFilter';
import { frequencyChange } from '../../shared/frequencyChange';
import { clockTime, hourRange } from '../../shared/timeText';
import { compareRouteNumber } from '../../shared/sortCompare';
import { modeLabel, effectiveMode } from '../../shared/modes';
import { routeReading } from '../../src/utils/routeReading';
import type { ShapeProperties } from '../../src/hooks/useIntervalStats';
import { departuresInPeriod, routeRuns, runsEveryHour } from '../../shared/routeRuns';
import { ROUTE_TEXT_MATCH_MAX, routeTextMatchRank } from '../../shared/routeMatch';
import { metresBetween, withinMetres } from '../../shared/geoDistance';
import { andOthers, joinList } from '../../shared/overflowText';
import { placesNamed } from './places';
import { snapshotsNewestFirst, usableSnapshots } from '../../src/utils/historySnapshots';
import { historyDayPeriodValue } from '../../src/utils/historyYearMap';
import { PEOPLE_MOVER_MODE, RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE } from '../../shared/rules/modes';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';
import { headwayAboutRange, headwayEvery } from '../../shared/headwayText';
import { buildStopRoutes, stopRouteLineHeadway, stopRowHeadway, stopRowRangeLow } from '../../src/utils/stopRoutes';
import { pairChanges } from '../../shared/scheduleChangePairing';
import { NEARBY_ROUTES_RADIUS_M } from '../../shared/rules/limits';
import { DAYTIME_PERIOD_KEYS, MINUTES_PER_DAY, TIME_PERIODS } from '../../shared/rules/periods';
import { placeParts, stopMatchText } from '../../shared/stopNameText';
import { PARENT_AGENCIES } from '../../shared/parentAgencyList';
import { mayRedistribute, redistributionExclusion } from '../../shared/rules/redistribution';
import { feedPlaceName } from '../../src/utils/nameCase';
import { FEED_CREDITS, type FeedCreditKey } from '../../shared/feedCredits';
import { OVERNIGHT_NIGHT_GRADE, routeNightGrade, rowPassesNightGrade, type NightServiceFrequency } from '../../shared/nightService';
import type { StudioVehicleGroup } from '../../shared/studioVehicles';

/** CIV-2915: a destination or stop name the feed sent in capitals, in normal case, as the map and Live show it. */
const placeOrNull = (name: string | null | undefined): string | null => (name?.trim() ? feedPlaceName(name) : null);


type Feature = McpFeature;
type CatalogAgency = McpAgency;
export type { IndexedAgency };

/** Where the tools read from (CIV-1840): the store a caller sets (disk for the local server, R2 for the hosted one, memory in tests). This module is pure: no files, no network, so a Worker can import it. */
let current: AtlasStore | null = null;
const store: AtlasStore = new Proxy({} as AtlasStore, { get: (_t, k) => { if (!current) throw new Error('No store set: call useStore() first.'); return (current as unknown as Record<string | symbol, unknown>)[k]; } });
export function useStore(s: AtlasStore): void { current = s; loaded.clear(); summaries.clear(); daySummaries.clear(); index = null; }
export const currentStore = () => store;
/** Frees one agency's loaded route lines (the index build holds one agency at a time). */
export function forget(slug: string): void { loaded.delete(slug); for (const k of [...daySummaries.keys()]) if (k.startsWith(`${slug}|`)) daySummaries.delete(k); store.evict?.(slug); }
export type { RouteSummary };

/**
 * #1675: the catalog with each feed's parent agency, so every tool groups "MTA New York" the same way. The split
 * release's slim catalog has no parentAgency; its meta file names the parent, which is mapped back to its slug here.
 */
async function catalogWithParents(): Promise<CatalogAgency[]> {
  const meta = await store.meta();
  // #1693: an agency whose terms bar serving its data to other tools is never answered for (shared/rules/redistribution.ts).
  return (await store.catalog()).filter(a => mayRedistribute(a.slug)).map(a => {
    if (a.parentAgency) return a;
    const name = meta.get(a.slug)?.parentAgency;
    const parent = name ? PARENT_AGENCIES.find(p => p.name === name || p.slug === name) : undefined;
    return parent ? { ...a, parentAgency: parent.slug } : a;
  });
}

/** The public catalog: the agencies the public site shows. */
export const publicAgencies = (): Promise<CatalogAgency[]> => catalogWithParents();

/** The public agencies Atlas can answer for here. */
export async function availableAgencies(): Promise<CatalogAgency[]> {
  const have = await store.available();
  return (await catalogWithParents()).filter(a => have.has(a.slug));
}

/** An agency by slug or name (case-insensitive), among those available. */
/** The short names riders use for an agency (config shortName, such as "HSR" or "TTC"), lower case. */
export async function shortNames(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [slug, m] of await store.meta()) if (m.shortName) out.set(slug, m.shortName.toLowerCase());
  return out;
}
/** An agency's own time zone from its config, or null (#1627). */
export async function timeZoneOf(slug: string): Promise<string | null> { return (await store.meta()).get(slug)?.timezone ?? null; }

const escapeRegExp = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** True when the text has the words asked at the start of one of its words ("go transit" is not in "Chicago Transit", #1682). */
export function hasWordsAt(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !!q && new RegExp(`(^|[^a-z0-9])${escapeRegExp(q)}`).test(text.toLowerCase());
}
/** True when the text has the words asked as whole words ("go transit" is not in "Largo Transit Center"). */
export function hasWholeWords(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !!q && new RegExp(`(^|[^a-z0-9])${escapeRegExp(q)}($|[^a-z0-9])`).test(text.toLowerCase());
}

/**
 * #1681: an operator whose services Atlas lists as agencies of their own, not under one parent agency. Asked by the
 * operator's name, the tools point to those agencies (Metrolinx runs GO Transit and UP Express).
 */
export const SERVICE_OPERATORS: ReadonlyArray<{ name: string; slugs: readonly string[] }> = [{ name: 'Metrolinx', slugs: ['go', 'upexpress'] }];

/**
 * #1806: the parent agency named (its name or slug, any case: "MTA New York", "exo") and its feeds in the list, or null.
 * Every tool resolves a parent's name through this, so none answers for one feed as if it were the whole agency.
 */
export function parentNamed(query: string, list: CatalogAgency[]): { name: string; slug: string; members: CatalogAgency[] } | null {
  const q = query.trim().toLowerCase();
  const g = groupAgencies(list).find(x => x.parent && (x.parent.slug === q || x.parent.name.toLowerCase() === q));
  if (g?.parent) return { name: g.parent.name, slug: g.parent.slug, members: g.members };
  const p = PARENT_AGENCIES.find(x => x.slug === q || x.name.toLowerCase() === q);
  return p ? { name: p.name, slug: p.slug, members: [] } : null;
}

/** The operator named (its full name, any case) and its agencies that have data here, or null. */
export function operatorNamed(query: string, list: CatalogAgency[]): { name: string; members: CatalogAgency[] } | null {
  const q = query.trim().toLowerCase();
  const op = SERVICE_OPERATORS.find(o => o.name.toLowerCase() === q);
  const members = op ? list.filter(a => op.slugs.includes(a.slug)) : [];
  return op && members.length ? { name: op.name, members } : null;
}

/**
 * #1693: asked about an agency Atlas may not serve to other tools, say so instead of "no agency matches". Exact names
 * first (before other agencies are matched); then, when nothing else matched, names that start with the words asked.
 */
export async function excludedAgencyNote(query: string, exact = false): Promise<string | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const meta = await store.meta();
  for (const a of await store.catalog()) {
    const x = redistributionExclusion(a.slug);
    if (!x) continue;
    const names = [a.slug, a.name, meta.get(a.slug)?.shortName ?? ''].filter(Boolean);
    if (exact ? names.some(n => n.toLowerCase() === q) : names.some(n => hasWordsAt(n, q))) return `Atlas can't serve ${a.name} here: ${x.reason} The Atlas map still shows it.`;
  }
  return null;
}
/** The catalog's agencies left out by their data terms (shared/rules/redistribution.ts). */
export const excludedCatalog = async (): Promise<CatalogAgency[]> => (await store.catalog()).filter(a => !mayRedistribute(a.slug));
/**
 * #1700: the agencies left out by their data terms that a filter keeps (a region or country asked of rank_agencies), each
 * with its reason, so a list they would have been in says why they're missing instead of coming back silently short.
 */
export async function excludedAgencies(keep: (a: CatalogAgency) => boolean): Promise<Array<{ name: string; reason: string }>> {
  return (await store.catalog()).flatMap(a => { const x = redistributionExclusion(a.slug); return x && keep(a) ? [{ name: a.name, reason: x.reason }] : []; });
}
async function refuseExcluded(q: string, exact: boolean): Promise<void> {
  const note = await excludedAgencyNote(q, exact);
  if (note) throw new Error(note);
}

export async function findAgency(query: string, list?: CatalogAgency[]): Promise<CatalogAgency | null> {
  list ??= await availableAgencies();
  const meta = await store.meta();
  const q = query.trim().toLowerCase();
  // #1806: a parent agency's name finds the parent, never one of its feeds silently ("exo" is not exo's trains alone).
  const parent = parentNamed(query, list);
  if (parent?.members.length === 1) return parent.members[0];
  if (parent && parent.members.length > 1) throw new Error(`${parent.name} is split across several feeds here: ${parent.members.map(a => a.name).join('; ')}. Call again with one of them.`);
  const several = (hits: CatalogAgency[]) => new Error(`"${query}" matches several agencies: ${hits.slice(0, 6).map(a => a.name).join('; ')}${hits.length > 6 ? '; …' : ''}. Call again with the full name.`);
  // #1869: a name, short name, id or bracketed name that two agencies answer to is asked about, never settled by one of
  // them ("RTC" is RTC Québec's id and "Regional Transportation Commission of Southern Nevada (RTC)").
  const bracketed = (a: CatalogAgency) => /\(([^()]+)\)\s*$/.exec(a.name)?.[1].trim().toLowerCase();
  // A bracketed name only widens an exact match: alone it falls to the name tiers below ("Vancouver" asks about TransLink
  // (Vancouver) and C-TRAN (Vancouver, WA)).
  const strict = list.filter(a => (meta.get(a.slug)?.shortName ?? '').toLowerCase() === q || a.slug === q || a.name.toLowerCase() === q);
  const exact = strict.length ? [...new Set([...strict, ...list.filter(a => bracketed(a) === q)])] : [];
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw several(exact);
  await refuseExcluded(q, true);
  const op = operatorNamed(query, list);
  if (op?.members.length === 1) return op.members[0];
  if (op) throw new Error(`${op.name} runs several agencies here: ${op.members.map(a => a.name).join('; ')}. Call again with one of them.`);
  // #1676: a name inside another agency's name ("Sound Transit" in "Owen Sound Transit") must not win silently. The
  // best match starts with the words asked, then has them at a word's start, then anywhere; a tie is asked about.
  const named = (a: CatalogAgency) => a.name.toLowerCase();
  for (const tier of [(a: CatalogAgency) => named(a).startsWith(q), (a: CatalogAgency) => hasWordsAt(a.name, q), (a: CatalogAgency) => named(a).includes(q)]) {
    const hits = list.filter(tier);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw several(hits);
  }
  await refuseExcluded(q, false);
  return null;
}

export interface RouteRows { key: string; name: string; shortName: string; longName: string | null; mode: string; rows: ShapeProperties[] }
const loaded = new Map<string, Feature[]>();

async function lines(slug: string): Promise<Feature[]> {
  if (!loaded.has(slug)) {
    const features = await store.routeFeatures(slug);
    if (!features) throw new Error(`No route data for ${slug}.`);
    normalizeRouteFilterFeatures(features);
    loaded.set(slug, features);
  }
  return loaded.get(slug)!;
}

/** Each route's rows on one day type, grouped as the map groups them. */
export async function routesOn(agency: CatalogAgency, day: DayType): Promise<RouteRows[]> {
  const byKey = new Map<string, RouteRows>();
  for (const f of await lines(agency.slug)) {
    const p = f.properties;
    if (p.day !== day) continue;
    const key = routeGroupKey(p.routeShortName as string, p.routeId as string);
    const shortName = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    const longName = typeof p.routeLongName === 'string' && p.routeLongName.trim() ? p.routeLongName.trim() : null;
    let r = byKey.get(key);
    if (!r) {
      const mode = modeLabel(effectiveMode({ routeType: p.routeType as number, routeLongName: longName, routeShortName: shortName, agencySlug: agency.slug, bookingRequired: p.bookingRequired === true }));
      byKey.set(key, r = { key, name: shortName || longName || String(p.routeId ?? ''), shortName, longName, mode, rows: [] });
    }
    r.rows.push(p as unknown as ShapeProperties);
  }
  return [...byKey.values()].sort((a, b) => compareRouteNumber(a.name, b.name, a.longName, b.longName));
}

/** A route's summary: what the list tools read, made with the same functions route_frequency uses. */
/** CIV-2080: the Night Service page's rule: the route's rows that pass at 90 or better, graded as its list grades them. */
function nightGradeOf(rows: RouteRows['rows']): NightServiceFrequency | null {
  const lit = (rows as unknown as Array<Record<string, unknown>>).filter(row => rowPassesNightGrade(row, 90));
  return lit.length ? routeNightGrade(lit) : null;
}

export function summarize(r: RouteRows): RouteSummary {
  const runs = routeRuns(r.rows as never, undefined);
  return {
    key: r.key, name: r.name, shortName: r.shortName, longName: r.longName, mode: r.mode,
    routeIds: [...new Set(r.rows.map(row => String(row.routeId)))],
    figures: Object.fromEntries(PERIOD_KEYS.map(k => [k, periodFigure(r, k)])) as Record<PeriodKey, PeriodFigure>,
    span: serviceSpan(r),
    bounds: runs ? { first: runs.first ?? (runs.hours.length ? runs.hours[0] * 60 : null), last: runs.last ?? (runs.hours.length ? runs.hours[runs.hours.length - 1] * 60 + 59 : null) } : null,

    night: nightGradeOf(r.rows),
  };
}

const summaries = new Map<string, Promise<RouteSummary[] | null>>();
const daySummaries = new Map<string, RouteSummary[]>();

/** Each route on a day as a summary: read ready-made where the store has them, else made from its rows. */
export async function routeList(agency: CatalogAgency, day: DayType): Promise<RouteSummary[]> {
  const id = `${agency.slug}|${day}`;
  // A store with ready-made summaries gives null for an agency it doesn't have them for (the local server's agencies on
  // this Mac only, CIV-2014): those are made from the route rows, as for a store without them.
  if (store.summaries) {
    if (!summaries.has(id)) summaries.set(id, store.summaries(agency.slug, day));
    const ready = await summaries.get(id)!;
    if (ready) return ready;
  }
  if (!daySummaries.has(id)) daySummaries.set(id, (await routesOn(agency, day)).map(summarize));
  return daySummaries.get(id)!;
}

/** One route's rows on a day (what route_frequency's branches and hourly figures read). */
export async function routeWithRows(agency: CatalogAgency, day: DayType, s: RouteSummary): Promise<RouteRows> {
  if (store.routeRows) {
    const rows = await store.routeRows(agency.slug, day, s.key);
    if (rows) return { key: s.key, name: s.name, shortName: s.shortName, longName: s.longName, mode: s.mode, rows: rows as unknown as ShapeProperties[] };
  }
  const r = (await routesOn(agency, day)).find(x => x.key === s.key);
  if (!r) throw new Error(`No rows for route ${s.name} of ${agency.slug}.`);
  return r;
}

/**
 * A route by short name, long name or id. An exact name wins, then a route id (#1777), then a line named by the words ("Blue" is the Blue Line,
 * not the 60 Blue Island bus), then the map's route-search rule ("1" finds route 01). No mode wins a tie (CIV-2025).
 */
/**
 * The other routes whose name matches a query exactly, besides the one findRoute picked (#1623: GO's "Lakeshore West" is
 * the LW train and the 18 bus that runs when trains don't; TTC "King" is the 504 and the 304 night streetcar), so an
 * answer can name them. Empty when the query was the picked route's own short name, or nothing else shares it.
 */
export function otherExactMatches<R extends Pick<RouteRows, 'shortName' | 'name' | 'longName' | 'mode'>>(routes: R[], query: string, picked: R): R[] {
  const q = query.trim().toLowerCase();
  if (picked.shortName.toLowerCase() === q) return [];
  return routes.filter(r => r !== picked && r.name !== picked.name && [r.shortName, r.name, r.longName ?? ''].map(n => n.toLowerCase()).includes(q));
}

export function findRoute<R extends Pick<RouteRows, 'shortName' | 'name' | 'longName' | 'mode'>>(routes: R[], query: string): R | null {
  const q = query.trim().toLowerCase();
  const names = (r: R) => [r.shortName, r.name, r.longName ?? ''].map(n => n.toLowerCase());
  // Exact matches: a short-name match first, then a daytime route before a night-only one (TTC "King" is the 504, not the
  // 304), else the list's order. CIV-2025: trains no longer win a tie over buses (#1623 had GO's "Lakeshore West" pick the
  // LW train over bus 18 with the same long name; otherExactMatches still names the other).
  const night = (r: R) => { const f = (r as { figures?: RouteSummary['figures'] }).figures; return f && isNightRoute({ figures: f }) ? 1 : 0; };
  const exact = routes.filter(r => names(r).includes(q)).map((r, i) => ({ r, i, short: r.shortName.toLowerCase() === q ? 0 : 1 }))
    .sort((a, b) => a.short - b.short || night(a.r) - night(b.r) || a.i - b.i)[0]?.r;
  if (exact) return exact;
  // #1777: then a route id, bare or as the summary key ("30053" or "id:30053", TransLink's Expo Line, which has no short
  // name). After every name, so a route's own number always wins over another route's id.
  const ids = (r: R) => { const x = r as { key?: string; routeIds?: string[] }; return [x.key ?? '', ...(x.routeIds ?? [])].map(n => n.toLowerCase()); };
  const byId = routes.find(r => ids(r).includes(q) || ids(r).includes(`id:${q}`));
  if (byId) return byId;
  const line = routes.filter(r => names(r).some(n => n === `${q} line` || n.startsWith(`${q} line`) || n === `line ${q}` || n.startsWith(`line ${q} `)));
  if (line.length) return line[0];
  // Otherwise the map's route-search rule (shared/routeMatch.ts): best match first, then, among routes matched only by
  // name, one holding the words typed as whole words ("E Line" is METRO E Line, not METRO Blue Line, "bluE LINE").
  const words = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
  const whole = (r: R) => (names(r).some(n => words.test(n)) ? 0 : 1);
  const ranked = routes.map(r => ({ r, rank: routeTextMatchRank({ shortName: r.shortName, longName: r.longName }, q) }))
    .filter(x => x.rank <= ROUTE_TEXT_MATCH_MAX).sort((a, b) => a.rank - b.rank || whole(a.r) - whole(b.r));
  return ranked[0]?.r ?? null;
}


/** A part of the day with departures but no regular frequency, in route_frequency's words (its periods and its hours, #1788). */
export const someTripsText = (trips: number) => `some trips (${trips}), but no regular frequency`;

/**
 * One period's figure as the map shows it. `waitMinutes` is the number the map colours and filters the route by: the
 * typical wait on the route's least frequent part (its slowest branch or direction). `shown` is the route list's words,
 * which give a range where parts of the route differ ("every 5–16 min": every 5 on the busiest part, every 16 on the
 * quietest) and name a long gap where the route card does.
 */
export function periodFigure(r: RouteRows, period: PeriodKey): PeriodFigure {
  // CIV-2953: the route's one reading (src/utils/routeReading.ts).
  const reading = routeReading(r.rows, period);
  const filter = reading.filterDisplay;
  const shown = reading.text(false);
  const waitMinutes = reading.wait;
  const trips = departuresInPeriod(r.rows as Array<{ departuresByHour?: Record<string, number> | null }>, period);
  const range = shown ? /every (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) min/.exec(shown) : null;
  return {
    period: PERIOD_LABELS[period],
    hours: formatPeriodRange(period),
    waitMinutes,
    shown: shown ?? (trips > 0 ? someTripsText(trips) : 'no service'),
    ...(range ? { meaning: `every ${range[1]} min on the busiest part of the route, every ${range[2]} min on the quietest part` } : {}),
    // #1711: a range in shown drops the card's edge words (TTC 501 Sunday Late "every 5–10 min" beside a 47 min wait), so
    // the edge the filter read is named here in the card's own words ("every 5 min until 1:13 AM").
    ...(edgeWait(shown, waitMinutes) || edgeBehindWait(shown, waitMinutes, filter.edgeText) ? { meaning: `Atlas grades this part of the day as every ${waitMinutes} min, not by the trips that run: service starts or stops partway through it${!edgeWait(shown, waitMinutes) && filter.edgeText ? ` (${filter.edgeText})` : ''}, and Atlas counts the wait to the edge of the period (${formatPeriodRange(period)}). This is Atlas's rule, not a data error.` } : {}),
    ...(waitBelowShown(shown, waitMinutes) ? { warning: `waitMinutes (every ${waitMinutes} min) is more frequent than anything this route's list shows (${shown}). Atlas may have read it from a stretch this route shares with other routes, so it can overstate this route's own service. Go by "shown" for this route, and say the two disagree.` } : {}),
    filter: reading.filter,
  };
}

/** A wait longer than every figure shown, where the shown text says service starts or stops in the period: the wait to the period's edge counted (settled rule 3). */
export function edgeWait(shown: string | null, waitMinutes: number | null): boolean {
  if (!shown || waitMinutes == null || !/\b(until|from)\b/.test(shown)) return false;
  const shownMins = [...shown.matchAll(/every (\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  return shownMins.length > 0 && waitMinutes > Math.max(...shownMins);
}

/**
 * #1711: the filter's number comes from service starting or stopping partway through the period (its reading has edge
 * words) and is longer than every figure shown, though shown names no edge (a range drops the card's edge words).
 */
export function edgeBehindWait(shown: string | null, waitMinutes: number | null, edgeText: string | undefined): boolean {
  if (!shown || waitMinutes == null || !edgeText) return false;
  // Both ends of a range ("every 5–10 min" is 5 and 10), so a wait inside the range is never called an edge wait.
  const shownMins = [...shown.matchAll(/every (\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))?/g)].flatMap(m => [Number(m[1]), ...(m[2] ? [Number(m[2])] : [])]);
  return shownMins.length > 0 && waitMinutes > Math.max(...shownMins);
}

/**
 * A wait a whole public grade more frequent than the most frequent figure the route list shows (#1666: SEPTA 63 PM
 * peak, waitMinutes 10 beside "every 60 min"). waitMinutes reads the route's slower part, so it should never beat
 * every shown figure; when it lands in a better grade, the two contradict and the answer must say so. Same-grade
 * rounding (36 beside "every 37 min") is not flagged.
 */
export function waitBelowShown(shown: string | null, waitMinutes: number | null): boolean {
  if (!shown || waitMinutes == null) return false;
  const shownMins = [...shown.matchAll(/every (\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (!shownMins.length) return false;
  const grade = (m: number) => headwayGradeOn(m, PUBLIC_TIER_MAXES) ?? Infinity;
  return grade(waitMinutes) < grade(Math.min(...shownMins));
}

/** The first and last departures of the day, and any break inside it, as clock times. */
/** A clock time in the service day, said as a rider hears it: a trip at 28:23 leaves at 4:23 AM after midnight (CIV-1840: the 329's last trip read as before its first). */
const serviceClock = (minutes: number) => `${clockTime(minutes)}${minutes >= 1440 ? ' (after midnight)' : ''}`;

const duringHour = (h: number) => `during the ${clockTime(h * 60)} hour${h >= 24 ? ' after midnight' : ''}`;

export function serviceSpan(r: RouteRows) {
  const runs = routeRuns(r.rows as never, undefined);
  if (!runs) return null;
  // #1867: a route that runs through the night (the Night Service verdict) has no first or last trip of the day. Its first
  // and last counted hours are only the edges of Atlas's day window (RTC's Red Line, every 30 min from 2 AM, read "first
  // during the 5 AM hour"), so neither is given: allNightService says it runs all night instead.
  const allNight = runsThroughNight(nightGradeOf(r.rows));
  return {
    first: allNight ? null : runs.first != null ? serviceClock(runs.first) : runs.hours.length ? duringHour(runs.hours[0]) : null,
    last: allNight ? null : runs.last != null ? serviceClock(runs.last) : runs.hours.length ? duringHour(runs.hours[runs.hours.length - 1]) : null,
    breaks: (runs.gaps ?? []).map(([a, b]) => `${serviceClock(a)}–${serviceClock(b)}`),
  };
}

/** #1867: whether a route runs all night, by the Night Service rule night_service lists routes by (its night grade at the Overnight view's 60). */
export const runsThroughNight = (night: NightServiceFrequency | null | undefined): boolean => night != null && night <= OVERNIGHT_NIGHT_GRADE;

/** The day types on which a route has service every hour in every direction (runsEveryHour), read from each day's own rows. */
export async function daysRunningEveryHour(agency: CatalogAgency, s: Pick<RouteSummary, 'key' | 'name'>): Promise<DayType[]> {
  const out: DayType[] = [];
  for (const day of DAY_TYPES) {
    const on = (await routeList(agency, day)).find(x => x.key === s.key);
    if (on && runsEveryHour((await routeWithRows(agency, day, on)).rows as never)) out.push(day);
  }
  return out;
}

/**
 * #1867: a night-only route, among those that run all night: no service in Midday, PM peak or Evening (the shared parts
 * of the day). The AM peak is left out: a night route's last trips run into it (TTC 320 weekday: 3 trips before 6:18 AM).
 */
const NIGHT_ONLY_EMPTY_PERIODS = DAYTIME_PERIOD_KEYS.filter(k => k !== 'amPeak');
export const runsOvernightOnly = (s: Pick<RouteSummary, 'figures'>): boolean => NIGHT_ONLY_EMPTY_PERIODS.every(k => s.figures[k]?.shown === 'no service');

/**
 * #1867 (Ryan, option 1: "if you ask 'what time is the first trip on the red line' is that different than 'does the red
 * line run all night'"): an all-night route's service says it runs all night, with its Overnight figure, in place of a
 * first or last time; and 24 hours, with the days, where every hour has service in every direction.
 */
export function allNightService(s: Pick<RouteSummary, 'figures' | 'span'>, everyHourOn: readonly DayType[]) {
  // Ryan's words for a night-only route (2026-11-26): only "Runs overnight only", with no frequency, no clock times and so
  // no breaks (TTC 320's "6:18 AM–1:12 AM" is its daytime, not a break in its service).
  if (runsOvernightOnly(s)) return { first: null, last: null, runsOvernightOnly: 'Runs overnight only', breaks: [] };
  const allWeek = everyHourOn.length === DAY_TYPES.length;
  return {
    first: null, last: null,
    runsAllNight: `Runs all night: ${s.figures.overnight.shown} overnight (${formatPeriodRange('overnight')})`,
    ...(allWeek ? { runs24Hours: 'Runs 24 hours, 7 days a week' } : everyHourOn.length ? { runs24Hours: `Runs 24 hours on ${joinList(everyHourOn.map(dayPlural))}` } : {}),
    breaks: s.span?.breaks ?? [],
  };
}

export const parseDay = (day: unknown): DayType => (DAY_TYPES as readonly string[]).find(d => d.toLowerCase() === String(day ?? 'Weekday').toLowerCase()) as DayType ?? 'Weekday';
export const parsePeriod = (period: unknown): PeriodKey | null => {
  const q = String(period ?? '').toLowerCase().replace(/[\s_-]/g, '');
  return PERIOD_KEYS.find(k => k.toLowerCase() === q || PERIOD_LABELS[k].toLowerCase().replace(/\s/g, '') === q) ?? null;
};

/**
 * Other routes of the agency with the same long name as this one (TTC 510 and its night 310, both "Spadina"), each with
 * its first and last trips, so a question about a street's service can include the night route that takes over.
 */
export async function sameNameRoutes(agency: CatalogAgency, day: DayType, r: Pick<RouteRows, 'name' | 'longName'>) {
  const name = (r.longName ?? '').trim().toLowerCase();
  if (!name) return [];
  return (await routeList(agency, day)).filter(o => o.name !== r.name && (o.longName ?? '').trim().toLowerCase() === name)
    .map(o => ({ route: o.name, mode: o.mode, service: o.span }));
}

/**
 * Routes by their hours on a day: those whose last trip leaves before `endsBefore`, or whose first leaves after
 * `startsAfter` (minutes; the last trip of the night after midnight counts as 24:00 and later). Each with its first and last trips.
 */
export async function routesByHours(agency: CatalogAgency, day: DayType, endsBefore: number | null, startsAfter: number | null) {
  const out: Array<{ route: string; name: string | null; first: string | null; last: string | null }> = [];
  for (const r of await routeList(agency, day)) {
    if (!r.bounds) continue;
    const { first, last } = r.bounds;
    if (endsBefore != null && !(last != null && last < endsBefore)) continue;
    if (startsAfter != null && !(first != null && first > startsAfter)) continue;
    const span = r.span;
    out.push({ route: r.name, name: r.longName, first: span?.first ?? null, last: span?.last ?? null });
  }
  return out.sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name));
}

/**
 * Whether a route's period figure passes "every N min or less" as the map's filter decides (routePassesHeadwayFilter, by its
 * reading: CIV-2014, so the MCP never lists a route the map hides, such as one whose last wait breaks the grade, CIV-238).
 * A summary built before the reading counts by waitMinutes.
 */
export function figurePasses(f: Pick<PeriodFigure, 'waitMinutes' | 'filter'>, every: number): boolean {
  return readingPassesHeadwayFilter(f.filter ?? { wait: f.waitMinutes, breaks: 0 }, every);
}

/**
 * CIV-2086: a route whose figure is within "every N" but which the map's filter rule still leaves out (some waits in
 * the period run longer, such as OC Transpo 34 on a Sunday midday). Listed so an answer doesn't read as if the route
 * runs less often.
 */
export function leftOutByRule(f: Pick<PeriodFigure, 'waitMinutes' | 'filter'>, every: number): boolean {
  const wait = f.waitMinutes ?? f.filter?.wait ?? null;
  return wait != null && wait <= every && !figurePasses(f, every);
}

/**
 * #1687: a server with schedules for only some of Atlas's agencies (the hosted pilot carries 8) says so, naming the ones
 * it has, instead of pointing to an agency it then can't answer for. `names` are the agencies asked about.
 */
export async function notOnThisServerNote(names: string[], more = 0): Promise<string> {
  const have = await availableAgencies();
  const list = have.length <= 20 ? `: ${have.map(a => a.name).join('; ')}` : '';
  const them = names.length > 1 || more > 0 || /^The (agencies |\d+ other agencies )/.test(names[0] ?? '');
  // #1702: names past the first few are counted ("and 2 other agencies"), never dropped silently.
  const named = more > 0 ? `${names.join(', ')} ${andOthers(more, 'agency', 'agencies')}` : joinList(names);
  return `${named} ${them ? 'are' : 'is'} in Atlas, but this server has schedules for only ${have.length} agencies${list}. Say this server can't answer for ${them ? 'them' : 'it'}; don't answer from memory.`;
}
/** The agency (or parent agency, #1806) a name finds among all of Atlas's agencies when this server has no schedules for it, or null. */
export async function agencyNotOnThisServer(query: string): Promise<{ name: string } | null> {
  const have = new Set((await availableAgencies()).map(a => a.slug));
  const parent = parentNamed(query, await publicAgencies());
  if (parent) return parent.members.some(m => have.has(m.slug)) ? null : { name: parent.name };
  try {
    const a = await findAgency(query, await publicAgencies());
    return a && !have.has(a.slug) ? a : null;
  } catch { return null; }
}

/**
 * #1694: the credits the feed publishers of the named agencies require (shared/feedCredits.ts: "Data provided by 511.org" for
 * the agencies read through the 511 API), once each. Names are as the tools give them; a name may begin a longer line.
 */
export async function feedCreditsFor(names: readonly string[]): Promise<Array<{ label: string; href: string }>> {
  const keys = new Set<FeedCreditKey>();
  for (const a of await store.catalog()) {
    if (a.feedCredit && names.some(n => n === a.name || n.startsWith(`${a.name} |`))) keys.add(a.feedCredit);
  }
  return [...keys].map(k => ({ label: FEED_CREDITS[k].label, href: FEED_CREDITS[k].href }));
}

/** A ranking file's wait as a filter reading (RankWait). */
export function rankWaitReading(w: RankWait | undefined): RouteFilterReading {
  return Array.isArray(w) ? { wait: w[0], breaks: w[1] } : { wait: w ?? null, breaks: 0 };
}
/** Whether a ranking wait passes "every N or better" as the map's filter decides (figurePasses for the ranking files). */
export const rankWaitPasses = (w: RankWait | undefined, every: number): boolean => readingPassesHeadwayFilter(rankWaitReading(w), every);
/** A ranking wait's number, for sorting and showing. */
export const rankWaitValue = (w: RankWait | undefined): number | null => rankWaitReading(w).wait;

/** The routes at or under `every` minutes in a period on a day, best first. */
export async function routesMeeting(agency: CatalogAgency, day: DayType, period: PeriodKey, every: number) {
  const all = await routeList(agency, day);
  const figures = all.map(r => ({ route: r.name, longName: r.longName, mode: r.mode, ...r.figures[period] }));
  const running = figures.filter(f => f.waitMinutes != null);
  const meeting = figures.filter(f => figurePasses(f, every)).sort((a, b) => (a.waitMinutes ?? a.filter?.wait ?? 0) - (b.waitMinutes ?? b.filter?.wait ?? 0));
  return { routesOnDay: all.length, routesRunningInPeriod: running.length, meeting, leftOut: figures.filter(f => leftOutByRule(f, every)) };
}

/**
 * One entry per agency or region (shared/agencyGroups.ts): an agency, or a parent agency standing for its feeds
 * (MTA New York for its subway, borough buses and railroads). Found by a parent's name or slug, else as findAgency.
 */
export interface AgencyEntry { slug: string; name: string; members: CatalogAgency[] }
export async function findAgencyEntry(query: string, list?: CatalogAgency[]): Promise<AgencyEntry | null> {
  list ??= await availableAgencies();
  const parent = parentNamed(query, list);
  if (parent?.members.length) return { slug: parent.slug, name: parent.name, members: parent.members };
  // #1681: an operator's agencies together, named with them ("Metrolinx (GO Transit, UP Express)").
  const op = operatorNamed(query, list);
  if (op && op.members.length > 1) return { slug: op.name.toLowerCase(), name: `${op.name} (${op.members.map(a => a.name).join(', ')})`, members: op.members };
  const a = await findAgency(query, list);
  return a ? { slug: a.slug, name: a.name, members: [a] } : null;
}

/** A parent entry's routes on a day with a route in two feeds (same name, mode and long name) once, as parentRoutes counts them. */
export async function entryRoutesMeeting(entry: AgencyEntry, day: DayType, period: PeriodKey, every: number) {
  if (entry.members.length === 1) return routesMeeting(entry.members[0], day, period, every);
  const seen = new Set<string>();
  const all: Array<RouteSummary> = [];
  for (const m of entry.members) {
    let routes: RouteSummary[];
    try { routes = await routeList(m, day); } catch { continue; }
    for (const r of routes) {
      const k = `${r.name}\u0000${r.mode}\u0000${r.longName ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(r);
    }
  }
  const figures = all.map(r => ({ route: r.name, longName: r.longName, mode: r.mode, ...r.figures[period] }));
  const running = figures.filter(f => f.waitMinutes != null);
  const meeting = figures.filter(f => figurePasses(f, every)).sort((a, b) => (a.waitMinutes ?? a.filter?.wait ?? 0) - (b.waitMinutes ?? b.filter?.wait ?? 0));
  return { routesOnDay: all.length, routesRunningInPeriod: running.length, meeting, leftOut: figures.filter(f => leftOutByRule(f, every)) };
}

/** Studio's schedule comparison for an agency, if one was built (tmp/studio/<slug>-before-after.json). */
export const scheduleComparison = (slug: string): Promise<StudioBeforeAfterFile | null> => store.comparison(slug);

/**
 * Studio's comparison lists a route written differently in the two schedules (RTD's Bound, FreeRide and MetroRide in
 * another case) as removed and added. Pair those by name, ignoring case and spaces, into one route with both figures
 * (shared/scheduleChangePairing.ts, which Studio's page switches to under CIV-1868).
 */
export function pairedChanges(file: StudioBeforeAfterFile): StudioBeforeAfterFile['changes'] {
  return pairChanges(file.changes);
}

/** Frequency changes in a comparison, by the shared rule (a grade move on the one scale), biggest first. */
export function frequencyChanges(file: StudioBeforeAfterFile) {
  const out: Array<{ route: string; name: string | null; period: string; hours: string; before: number | null; after: number | null; steps: number; better: boolean; publicChange: boolean; tripsBefore: number | null; tripsAfter: number | null }> = [];
  for (const c of pairedChanges(file)) for (const period of PERIOD_KEYS) {
    const before = c.before?.headway[period] ?? null, after = c.after?.headway[period] ?? null;
    const change = frequencyChange(before, after);
    if (change) out.push({ route: c.route, name: c.name, period: PERIOD_LABELS[period], hours: formatPeriodRange(period), before, after, steps: change.steps, better: change.better, publicChange: change.publicChange, tripsBefore: c.before?.trips ?? null, tripsAfter: c.after?.trips ?? null });
  }
  return out.sort((a, b) => b.steps - a.steps || Number(b.publicChange) - Number(a.publicChange));
}

// ---- Hours, trip times and combined frequency (CIV-1650 follow-up) ----

/** A clock time ("10:00", "10 AM", "6:30 pm", "18") as minutes after midnight; null when unreadable. */
export function parseClock(text: unknown): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.[0].toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h > 30 || min > 59 ? null : h * 60 + min;
}

/** Whether a window starts before the first part of the day and ends by midnight (2 AM to 6 AM), so it is read both ways (startsInWindow). */
const earlyWindow = (w: { start: number; end: number }) => w.start < TIME_PERIODS[0].startHour * 60 && w.end <= MINUTES_PER_DAY;

/**
 * A time window for the service day. A clock window that starts before the first part of the day (12 AM–3 AM) can mean
 * the hours after midnight that belong to the day's late night (24:00–27:00), where the schedule writes them, or the
 * hours at its start (5 AM). Both are read: the starts that fall in the window shifted a day, folded into it.
 */
export function startsInWindow(starts: readonly number[], w: { start: number; end: number }): number[] {
  return starts.filter(t => windowHas(t, w)).map(t => (t >= w.end ? t - MINUTES_PER_DAY : t));
}

/** Whether a departure (minutes in the service day) falls in a window, reading an early-morning window both ways (see startsInWindow). */
export function windowHas(t: number, w: { start: number; end: number }): boolean {
  if (t >= w.start && t < w.end) return true;
  return earlyWindow(w) && t >= w.start + MINUTES_PER_DAY && t < w.end + MINUTES_PER_DAY;
}

/** The Atlas periods a time window overlaps, with their own hours; an early-morning window also reads the night's hours (#1868: 2–6 AM is Overnight). */
export function periodsIn(start: number, end: number): string[] {
  const overlaps = (k: PeriodKey, s: number, e: number) => PERIOD_MINUTES[k].start < e && PERIOD_MINUTES[k].end > s;
  const shifted = earlyWindow({ start, end });
  return PERIOD_KEYS.filter(k => overlaps(k, start, end) || (shifted && overlaps(k, start + MINUTES_PER_DAY, end + MINUTES_PER_DAY)))
    .map(k => `${PERIOD_LABELS[k]} (${formatPeriodRange(k)})`);
}

/**
 * A route's hour-by-hour frequency in a time window, per branch (each drawn pattern: direction and destination), from
 * the hourly chart data on the route's rows (headwayByHour: the typical wait for trips leaving that hour). Branches of
 * one direction can differ (TTC 29's Dufferin Gate and Princes' Gates ends), so each is listed; patterns with under a
 * tenth of their direction's trips are left out.
 */
export function hourlyFrequency(r: RouteRows, start: number, end: number, endOf?: (row: ShapeProperties) => string | null) {
  const hoursOf = (row: ShapeProperties) => (row.departuresByHour as Record<string, number> | undefined) ?? {};
  // #1868: an early-morning window reads the night's hours too (2 AM to 6 AM is 26:00 to 28:00 and 5 AM), in clock order.
  const hourWindow = { start: Math.floor(start / 60) * 60, end };
  const inWindow = (h: number) => windowHas(h * 60, hourWindow);
  const clockOrder = (h: number) => startsInWindow([h * 60], hourWindow)[0] ?? h * 60;
  // #1714: a row that carries a tenth of its direction's trips inside the asked window keeps its column too, after the
  // day's columns, so a branch that runs mostly late (TTC 501 Sunday westbound "towards Long Branch": 23 of 253 trips a
  // day, nearly all after 10 PM) is not left out. The day's columns and their order stay as they were.
  const windowTrips = (row: ShapeProperties) => Object.entries(hoursOf(row)).reduce((a, [h, n]) => a + (inWindow(+h) ? n : 0), 0);
  const trips = (row: ShapeProperties) => Object.values(hoursOf(row)).reduce((a, b) => a + b, 0);
  const dirOf = (row: ShapeProperties) => String(row.directionId ?? '0');
  const towardsOf = (row: ShapeProperties) => placeOrNull([row.headsign, row.routeVariant].filter(Boolean).join(' '));
  const dirTrips = new Map<string, number>(), dirWindow = new Map<string, number>();
  for (const row of r.rows) {
    dirTrips.set(dirOf(row), (dirTrips.get(dirOf(row)) ?? 0) + trips(row));
    dirWindow.set(dirOf(row), (dirWindow.get(dirOf(row)) ?? 0) + windowTrips(row));
  }
  const byDay = (row: ShapeProperties) => trips(row) >= 0.1 * (dirTrips.get(dirOf(row)) ?? 0);
  const byWindow = (row: ShapeProperties) => (dirWindow.get(dirOf(row)) ?? 0) > 0 && windowTrips(row) >= 0.1 * dirWindow.get(dirOf(row))!;
  const order = (a: ShapeProperties, b: ShapeProperties) => String(a.directionId).localeCompare(String(b.directionId)) || trips(b) - trips(a);
  const dayKept = r.rows.filter(byDay).sort(order);
  // #1788: any other row with a trip in the window keeps its column too, after those, so every branch route_frequency lists
  // that runs then has a row (RTD 31 weekday 3-7 PM: 106th & Melody, 9 trips a day, had none).
  const windowKept = r.rows.filter(row => !byDay(row) && byWindow(row)).sort(order);
  const kept = [...dayKept, ...windowKept, ...r.rows.filter(row => !byDay(row) && !byWindow(row) && windowTrips(row) > 0).sort(order)];
  // Rows that end at the same stop and read the same each hour are one way to the end (TTC 29 northbound, from either
  // loop to Wilson), as route_frequency's branches show it: one column, not one per starting loop.
  const columns: Array<{ row: ShapeProperties; towards: string | null }> = [];
  const seen = new Map<string, number>();
  for (const row of kept) {
    const end = endOf?.(row);
    const sig = end ? `${row.directionId ?? '0'}|${end}|${JSON.stringify(row.headwayByHour ?? null)}` : null;
    const at = sig != null ? seen.get(sig) : undefined;
    if (at != null) {
      const first = columns[at];
      const heads = new Set(kept.filter(k => String(k.directionId ?? '0') === String(row.directionId ?? '0') && endOf?.(k) === end).map(k => String(k.headsign ?? '')).filter(Boolean));
      first.towards = heads.size === 1 ? placeOrNull([...heads][0]) : first.towards;
      continue;
    }
    if (sig != null) seen.set(sig, columns.length);
    columns.push({ row, towards: towardsOf(row) });
  }
  const hours = (row: ShapeProperties) => Object.entries((row.headwayByHour as Record<string, number | null> | undefined) ?? {})
    .map(([h, v]) => [+h, v] as const).filter(([h]) => inWindow(h)).sort((a, b) => clockOrder(a[0]) - clockOrder(b[0]));
  const runs = (row: ShapeProperties) => hours(row).some(([, v]) => v != null);
  const stopsOf = (row: ShapeProperties) => (row.stopOrder as string[] | undefined) ?? [];
  // #1714 (part 2): a column with no regular trips in any hour of the window is left out when another column of its direction
  // passes its end stop and runs then: TTC 501 Sunday after 11 PM, the cars to Long Branch serve Humber Loop every 10, so
  // "Humber: no regular trips" would be false for a rider there.
  const servedByAnother = (row: ShapeProperties) => {
    const last = stopsOf(row).at(-1);
    return last != null && columns.some(c => c.row !== row && dirOf(c.row) === dirOf(row) && runs(c.row) && stopsOf(c.row).includes(last));
  };
  return columns.filter(({ row }) => runs(row) || !servedByAnother(row)).map(({ row, towards }) => ({
    towards,
    // #1788 (Ryan "1"): an hour with departures but no regular gap says how many, in the periods' own words.
    byHour: hours(row).map(([h, v]) => ({ hour: hourRange(h, h + 1), every: v != null ? headwayEvery(v) : (hoursOf(row)[String(h)] ?? 0) > 0 ? someTripsText(hoursOf(row)[String(h)]) : 'no regular trips' })),
  }));
}

// ---- Agency index for peers and rankings (CIV-1650 round 2) ----


/** Mode labels that are rail, from the shared mode list (shared/rules/modes.ts) by the rail-like ids and streetcar. */
export const RAIL_MODE_LABELS = new Set([...RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE.TRAM, PEOPLE_MOVER_MODE].map(id => modeLabel(id)));

let index: IndexedAgency[] | null = null;
/** The index, or null when it hasn't been built for the current data (scripts/mcp/buildIndex.ts). */
export async function agencyIndex(): Promise<IndexedAgency[] | null> {
  return (index ??= (await store.index())?.filter(a => mayRedistribute(a.slug)) ?? null);
}

const FERRY = modeLabel(ROUTE_TYPE.FERRY);
/**
 * What an agency runs, for the bus, rail and ferry filters: rail when every weekday route is rail, ferry when every weekday
 * route is a ferry, else bus. CIV-2025: one train route no longer files an agency under rail (rail is read as ferry is).
 */
export function kindOfAgency(a: Pick<IndexedAgency, 'railRoutes' | 'days'>): 'bus' | 'rail' | 'ferry' {
  const weekday = a.days.Weekday ?? [];
  if (weekday.length === 0) return 'bus';
  return weekday.every(r => r.mode != null && RAIL_MODE_LABELS.has(r.mode)) ? 'rail' : weekday.every(r => r.mode === FERRY) ? 'ferry' : 'bus';
}
/** The ranking list's row for an indexed agency. */
export const rankAgencyOf = (a: IndexedAgency): RankAgency => ({ slug: a.slug, name: a.name, region: a.region, country: a.country, partOf: a.partOf, railRoutes: a.railRoutes, weekdayRoutes: a.days.Weekday?.length ?? 0, kind: kindOfAgency(a) });
/** Each route's wait in each part of the day, in the shared PERIOD_KEYS order. */
export const waitsOf = (routes: NonNullable<IndexedAgency['days'][DayType]>): Array<Array<RankWait>> => routes.map(r => PERIOD_KEYS.map(k => { const w = r.wait[k] ?? null; const b = r.breaks?.[k]; return w != null && b ? [w, b] : w; }));
export const labelsOf = (routes: NonNullable<IndexedAgency['days'][DayType]>): RouteLabel[] => routes.map(r => [r.route, r.name]);

/** The agencies ranking reads, or null when the index hasn't been built. A hosted store gives them ready-made, without any agency's routes. */
export async function rankAgencies(): Promise<RankAgency[] | null> {
  if (store.rankAgencies) return (await store.rankAgencies())?.filter(a => mayRedistribute(a.slug)) ?? null;
  return (await agencyIndex())?.map(rankAgencyOf) ?? null;
}
/** Each agency's route waits on a day. */
export async function rankWaits(day: DayType): Promise<Record<string, Array<Array<RankWait>>>> {
  if (store.rankWaits) return (await store.rankWaits(day)) ?? {};
  return Object.fromEntries(((await agencyIndex()) ?? []).map(a => [a.slug, waitsOf(a.days[day] ?? [])]));
}
/** An agency's route names on a day, in the order of its waits. */
export async function rankLabels(slug: string, day: DayType): Promise<RouteLabel[]> {
  if (store.rankLabels) return (await store.rankLabels(slug))?.[day] ?? [];
  return labelsOf(((await agencyIndex())?.find(a => a.slug === slug))?.days[day] ?? []);
}
/** Agencies with a weekday route whose name holds the text as whole words (#1682), each with up to six of those routes' names (finding a service brand such as Viva). */
export async function agenciesWithRouteName(text: string): Promise<Array<{ agency: string; routes: string[] }>> {
  const q = text.trim().toLowerCase();
  const labelOf = ([route, name]: RouteLabel) => `${route}${name ? ` ${name}` : ''}`;
  // #1687: only agencies this server has schedules for, so a pointer never leads to "no data here".
  const have = new Set((await availableAgencies()).map(a => a.slug));
  if (store.routeNameText) {
    const [agencies, texts] = await Promise.all([rankAgencies(), store.routeNameText()]);
    return (agencies ?? []).filter(a => have.has(a.slug)).flatMap(a => {
      const names = [...new Set((texts?.[a.slug] ?? '').split('\n').filter(line => line && hasWholeWords(line, q)))];
      return names.length ? [{ agency: a.name, routes: names.slice(0, 6) }] : [];
    });
  }
  return ((await agencyIndex()) ?? []).filter(a => have.has(a.slug)).flatMap(a => {
    const names = [...new Set((a.days.Weekday ?? []).filter(r => hasWholeWords(`${r.route} ${r.name ?? ''}`, q)).map(r => labelOf([r.route, r.name])))];
    return names.length ? [{ agency: a.name, routes: names.slice(0, 6) }] : [];
  });
}

export { sameCountry } from '../../shared/regionCountry';

// ---- Branches, places, nearby agencies, history and buses needed (0.5.0) ----

type Stop = McpStop;
/** An agency's stops from its route file: name, place and the routes that stop there. */
export async function stopsOf(agency: CatalogAgency): Promise<Stop[]> {
  const stops = await store.stops(agency.slug);
  if (!stops) throw new Error(`No stops for ${agency.slug}.`);
  return stops;
}

/** The names of the stops a route's rows use: from the store's ready-made list for the route, else from the agency's stops. */
async function stopNamesFor(agency: CatalogAgency, day: DayType, r: RouteRows): Promise<Map<string, string>> {
  if (store.stopNames) {
    const names = await store.stopNames(agency.slug, day, r.key);
    if (names) return new Map(Object.entries(names));
  }
  return new Map((await stopsOf(agency)).map(s => [s.id, s.name]));
}

/** #1778: the parent station of each stop a route's rows use that has one: from the store's list for the route, else from the agency's stops. */
async function stopParentsFor(agency: CatalogAgency, day: DayType, r: RouteRows): Promise<Map<string, string>> {
  if (store.stopParents) return new Map(Object.entries((await store.stopParents(agency.slug, day, r.key)) ?? {}));
  return new Map((await stopsOf(agency)).filter(s => s.parent).map(s => [s.id, s.parent!]));
}

/**
 * #1778: how many stops a row's stop list has, counting a station once. Atlas copies a platform's departures up to its parent station
 * (AI-117), so both are in the list (OC Transpo Line 1: each of its 13 stations and its platform, 26). A parent station is left out
 * where one of its own platforms is in the same list.
 */
export function stopCount(order: readonly string[], parentOf: ReadonlyMap<string, string>): number {
  const parentsInList = new Set(order.map(id => parentOf.get(id)).filter((p): p is string => p != null));
  return order.filter(id => !parentsInList.has(id)).length;
}

/** Where each row of an agency's route ends (its last stop's name), for grouping branches that end at the same place. */
export async function endOfRows(agency: CatalogAgency, day: DayType, r: RouteRows): Promise<(row: ShapeProperties) => string | null> {
  const name = await stopNamesFor(agency, day, r);
  return row => { const order = (row.stopOrder as string[] | undefined) ?? []; return order.length ? name.get(order[order.length - 1]) ?? null : null; };
}

/**
 * Each branch of a route on a day: its direction, where it goes, its first and last stops and its trips. Branches of one
 * direction that end at the same stop are one row (TTC 29 northbound runs to Wilson Station from either of two loops):
 * their trips are counted once where they carry the same departures (a shared trunk), and added where they differ.
 */
export async function branchesOf(agency: CatalogAgency, day: DayType, r: RouteRows) {
  const name = await stopNamesFor(agency, day, r);
  const parentOf = await stopParentsFor(agency, day, r);
  type Branch = { direction: string; towards: string | null; from?: string | null; to?: string | null; stops?: number; trips: number; startsAt?: string[] };
  const groups = new Map<string, { rows: ShapeProperties[]; branch: Branch; hours: Map<string, number>; from: string[]; headsigns: Set<string> }>();
  const hoursOf = (row: ShapeProperties) => (row.departuresByHour as Record<string, number> | undefined) ?? {};
  const total = (h: Record<string, number>) => Object.values(h).reduce((a, b) => a + b, 0);
  for (const row of r.rows) {
    const order = (row.stopOrder as string[] | undefined) ?? [];
    const towards = [row.headsign, row.routeVariant].filter(Boolean).join(' ') || null;
    const direction = String(row.directionId ?? '0');
    const trips = total(hoursOf(row));
    if (trips <= 0 || !(towards || order.length)) continue;
    // Some rows carry no stop list (night rows, short turns): give where they head, not empty ends.
    const to = order.length ? name.get(order[order.length - 1]) ?? null : null;
    const key = order.length ? `${direction}|to:${to}` : `${direction}|towards:${towards}`;
    const sig = JSON.stringify(Object.entries(hoursOf(row)).sort(([a], [b]) => +a - +b));
    const g = groups.get(key) ?? groups.set(key, { rows: [], branch: { direction, towards, ...(order.length ? { from: name.get(order[0]) ?? null, to, stops: stopCount(order, parentOf) } : {}), trips: 0 }, hours: new Map(), from: [], headsigns: new Set() }).get(key)!;
    g.rows.push(row);
    g.hours.set(sig, trips); // the same departures count once
    const from = order.length ? name.get(order[0]) : null;
    if (from && !g.from.includes(from)) g.from.push(from);
    if (row.headsign) g.headsigns.add(String(row.headsign));
  }
  return [...groups.values()].map(g => {
    const merged = g.rows.length > 1 && g.from.length > 1;
    const b = {
      ...g.branch,
      trips: [...g.hours.values()].reduce((a, b) => a + b, 0),
      // Rows that start at different stops but end at the same one are a single way to the end.
      ...(merged ? { towards: g.headsigns.size === 1 ? [...g.headsigns][0] : g.branch.towards, from: g.from.join(' or '), startsAt: g.from } : {}),
    };
    // CIV-2915: where it goes and its end stops in normal case, as the map shows them ("HAMILTON GO CENTRE" -> "Hamilton GO Centre").
    return {
      ...b, towards: placeOrNull(b.towards),
      ...('from' in b ? { from: b.startsAt ? b.startsAt.map(feedPlaceName).join(' or ') : placeOrNull(b.from), to: placeOrNull(b.to) } : {}),
      ...(b.startsAt ? { startsAt: b.startsAt.map(feedPlaceName) } : {}),
    };
  }).filter(b => b.trips > 0).sort((a, b) => a.direction.localeCompare(b.direction) || b.trips - a.trips);
}

/**
 * Routes near a place: stops whose names hold every part of the place ("Bathurst and Bloor": a stop named with both
 * streets, or the station), then every stop within `metres` of those. Each route gets the stops it uses there.
 */
/** A route that runs only at night: no trips in any part of the day before the late evening (the map's own period list). */
export const isNightRoute = (r: Pick<RouteSummary, 'figures'>) => DAYTIME_PERIOD_KEYS.every(k => r.figures[k]?.shown === 'no service');

/** How far apart the nearest stops on each street of a corner may be (YRT's Finch GO Bus Terminal is 330 m from its nearest Yonge St stop). */
export const CORNER_MAX_APART_M = 400;

/**
 * A corner whose stops aren't named for both streets (#1614: YRT names them "FINCH GO BUS TERMINAL", "YONGE ST STOP # 4915"):
 * the closest pair of stops, one named for each street as a whole word, within CORNER_MAX_APART_M, plus any pair within
 * 50 m more of that. Two streets only; null when there's no such pair.
 */
export function cornerSeeds<S extends { name: string; lat: number; lon: number }>(stops: S[], parts: string[]): { stops: S[]; apart: number } | null {
  if (parts.length !== 2) return null;
  const on = (p: string) => { const re = new RegExp(`(^| )${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`); return stops.filter(s => re.test(stopMatchText(s.name))); };
  const [a, b] = [on(parts[0]), on(parts[1])];
  const pairs = a.flatMap(x => b.map(y => ({ x, y, m: metresBetween({ lat: x.lat, lon: x.lon }, { lat: y.lat, lon: y.lon }) }))).filter(p => p.m <= CORNER_MAX_APART_M);
  if (!pairs.length) return null;
  const best = Math.min(...pairs.map(p => p.m));
  const close = pairs.filter(p => p.m <= best + 50);
  return { stops: [...new Set(close.flatMap(p => [p.x, p.y]))], apart: Math.round(best) };
}

/**
 * The stops whose names hold every part of a place. #1773: each name is read the way the parts are (hyphens and accents
 * folded), so "Lionel-Groulx" and "YUL Aeroport Montreal-Trudeau" find STM's stations.
 */
export function stopsNamed<S extends { name: string }>(stops: S[], parts: string[]): S[] {
  return stops.filter(s => { const n = stopMatchText(s.name); return parts.every(p => n.includes(p)); });
}

/** The stops a place names: every stop whose name holds each part, else the closest pair on each street of a corner. routes_near and on_demand_zones both place a corner this way. */
export async function placeStops(agency: CatalogAgency, place: string) {
  const parts = placeParts(place);
  const stops = await stopsOf(agency);
  const named = stopsNamed(stops, parts);
  const corner = named.length ? null : cornerSeeds(stops, parts);
  return { stops, seeds: corner ? corner.stops : named, corner };
}

export async function routesNear(agency: CatalogAgency, place: string, metres = NEARBY_ROUTES_RADIUS_M) {
  const weekday = new Map((await routeList(agency, 'Weekday')).map(r => [r.name, r]));
  const { stops, seeds, corner } = await placeStops(agency, place);
  const near = stops.filter(s => seeds.some(t => withinMetres({ lat: s.lat, lon: s.lon }, { lat: t.lat, lon: t.lon }, metres)));
  const routeNames = await routeIdNames(agency);
  const byRoute = new Map<string, Set<string>>();
  for (const s of near) for (const id of s.routeIds) { const n = routeNames.get(id); if (n) (byRoute.get(n.name) ?? byRoute.set(n.name, new Set()).get(n.name)!).add(s.name); }
  const info = new Map([...routeNames.values()].map(v => [v.name, v]));
  return { matchedStops: [...new Set(seeds.map(s => s.name))].slice(0, 8), ...(corner ? { matchedAs: `No stop is named for both streets; these are the closest stops on each, ${corner.apart} m apart.` } : {}), within: metres, routes: [...byRoute.entries()].map(([name, at]) => { const w = weekday.get(name); return { route: name, name: info.get(name)?.longName ?? null, mode: info.get(name)?.mode ?? null, stops: [...at].slice(0, 4), weekdayService: w ? w.span : 'none: this route does not run on weekdays', ...(w && isNightRoute(w) ? { nightRoute: true } : {}) }; }).sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name)) };
}

/** How many different stop names a place may match before stopFrequency asks which one is meant. */
const STOP_CHOICES_SHOWN = 8;

/**
 * CIV-2060: how often each route comes at one stop, per part of the day, as the map's stop card shows it (buildStopRoutes:
 * the same rows, the same numbers, so the MCP and the map never disagree). A place that matches several stop names gives
 * the names to pick from instead of figures. Both directions' stops of one name are read together, as one stop card.
 */
export async function stopFrequency(agency: CatalogAgency, place: string, day: DayType, routeName?: string | null) {
  const stops = await stopsOf(agency);
  const parts = placeParts(place);
  let seeds = stops.filter(s => { const n = stopMatchText(s.name); return parts.every(p => n.includes(p)); });
  if (!seeds.length) seeds = cornerSeeds(stops, parts)?.stops ?? [];
  const names = [...new Set(seeds.map(s => s.name))];
  if (!names.length) return { matched: null, choices: [] as string[] };
  const exact = names.filter(n => stopMatchText(n) === stopMatchText(place));
  if (names.length > 1 && exact.length !== 1) return { matched: null, choices: names.slice(0, STOP_CHOICES_SHOWN), more: Math.max(0, names.length - STOP_CHOICES_SHOWN) };
  const name = names.length === 1 ? names[0] : exact[0];
  const at = seeds.filter(s => s.name === name);
  const routeNames = await routeIdNames(agency);
  const wanted = routeName ? findRoute([...new Map([...routeNames.values()].map(v => [v.name, { shortName: v.name, name: v.name, longName: v.longName, mode: v.mode }])).values()], routeName)?.name ?? null : null;
  const routeIds = new Set(at.flatMap(s => s.routeIds).filter(id => !wanted || routeNames.get(id)?.name === wanted));
  // Only the stop's routes' rows, through routeWithRows, so the hosted split store (no whole route file) answers too.
  const atNames = new Set([...routeIds].map(id => routeNames.get(id)?.name).filter(Boolean));
  const rows = (await Promise.all((await routeList(agency, day)).filter(r => atNames.has(r.name)).map(r => routeWithRows(agency, day, r)))).flatMap(r => r.rows);
  const layers = { [agency.slug]: { type: 'FeatureCollection' as const, features: rows.map(properties => ({ type: 'Feature' as const, geometry: null, properties })) as unknown as GeoJSON.Feature[] } };
  const routes = new Map<string, { route: string; name: string | null; destinations: Map<string, { towards: string | null; direction: number; periods: Record<string, string> }>; allDestinations: Record<string, string> }>();
  for (const period of PERIOD_KEYS) {
    const label = `${PERIOD_LABELS[period]} (${formatPeriodRange(period)})`;
    for (const sr of buildStopRoutes({ siblingIdsByAgency: { [agency.slug]: new Set(at.map(s => s.id)) }, routesByAgency: { [agency.slug]: routeIds }, layers, day, period })) {
      const r = routes.get(sr.shortName) ?? routes.set(sr.shortName, { route: sr.shortName, name: sr.longName || null, destinations: new Map(), allDestinations: {} }).get(sr.shortName)!;
      if (sr.noNumber) { r.allDestinations[label] = sr.noNumber.text; continue; }
      const line = stopRouteLineHeadway(sr.branches, period);
      if (line != null) r.allDestinations[label] = headwayEvery(line);
      for (const b of sr.branches) {
        const key = `${b.directionId}::${b.headsign ?? ''}`;
        const d = r.destinations.get(key) ?? r.destinations.set(key, { towards: placeOrNull(b.headsign), direction: b.directionId, periods: {} }).get(key)!;
        const hw = stopRowHeadway(b, period);
        // #1667: a shared stop whose combined trips aren't even reads as a range, its sparse low end to the longest gap.
        const low = hw != null ? stopRowRangeLow(b, period) : null;
        const text = b.periodText ?? (hw != null ? (low != null ? headwayAboutRange(low, hw) : headwayEvery(hw)) : null);
        if (text) d.periods[label] = b.sharedEdge ? `${text}; ${b.sharedEdge.text}` : text;
      }
    }
  }
  return {
    matched: name,
    stopsRead: at.length,
    ...(wanted == null && routeName ? { routeNotFound: routeName } : {}),
    routes: [...routes.values()].sort((a, b) => compareRouteNumber(a.route, b.route)).map(r => ({
      route: r.route, name: r.name,
      destinations: [...r.destinations.values()].sort((a, b) => a.direction - b.direction),
      ...(Object.keys(r.allDestinations).length ? { allDestinations: r.allDestinations } : {}),
    })),
  };
}

/** Each route id's names and mode (the last day a route appears wins, as the map's days run Weekday, Saturday, Sunday): from the store's ready-made list, else from the rows. */
async function routeIdNames(agency: CatalogAgency): Promise<Map<string, { name: string; longName: string | null; mode: string }>> {
  const out = new Map<string, { name: string; longName: string | null; mode: string }>();
  if (store.routeNames) {
    const list = await store.routeNames(agency.slug);
    if (list) {
      for (const [id, name, longName, mode] of list) out.set(id, { name, longName, mode });
      return out;
    }
  }
  for (const d of DAY_TYPES) for (const r of await routesOn(agency, d)) for (const row of r.rows) out.set(String(row.routeId), { name: r.name, longName: r.longName, mode: r.mode });
  return out;
}

/**
 * Agencies whose centre is within `km` of a place. An agency's exact name measures from its area's centre; otherwise a
 * city (#1699: "Washington DC", "Arlington, Virginia", "Bethesda"), then the nearest name match among agencies, then a
 * city an agency lists. `centredOn` says which it used, and `note` names the other places or agency the name could mean.
 * `here` is false for an agency this server has no schedules for (#1687: the hosted pilot carries 8).
 */
export async function agenciesNear(query: string, km = 60) {
  const q = query.trim().toLowerCase();
  const all = await publicAgencies();
  const meta = await store.meta();
  const exactAgency = all.find(a => a.slug === q || a.name.toLowerCase() === q || (meta.get(a.slug)?.shortName ?? '').toLowerCase() === q);
  const places = exactAgency ? [] : placesNamed(query);
  let centre: [number, number] | null = null, centredOn = '', near = query;
  const notes: string[] = [];
  if (exactAgency) {
    centre = exactAgency.center ?? null; near = exactAgency.name; centredOn = `the centre of ${exactAgency.name}'s area`;
  } else if (places.length) {
    const [p, ...others] = places;
    centre = [p.lat, p.lon]; near = `${p.name}, ${p.region}`; centredOn = `the city of ${near}`;
    if (others.length) notes.push(`"${query}" is also ${others.slice(0, 4).map(o => `${o.name}, ${o.region}`).join('; ')}. This used the largest; name the state or province to choose another.`);
    const agency = await findAgency(query, all).catch(() => null);
    if (agency) notes.push(`"${query}" also matches the agency ${agency.name}; to measure from its area instead, give its full name.`);
  } else {
    const anchor = await findAgency(query, all);
    const byCity = all.find(a => (a.cities ?? []).some(c => c.toLowerCase().split(',')[0] === q));
    const from = anchor ?? byCity;
    centre = from?.center ?? null;
    if (from) { near = anchor?.name ?? query; centredOn = `the centre of ${from.name}'s area`; }
  }
  if (!centre) return null;
  const at = { lat: centre[0], lon: centre[1] };
  const dist = (c?: [number, number]) => c ? metresBetween(at, { lat: c[0], lon: c[1] }) / 1000 : Infinity;
  const have = new Set((await availableAgencies()).map(a => a.slug));
  // One entry per agency or region (shared/agencyGroups.ts): a parent's feeds are one row at its nearest feed's distance.
  const entries = groupAgencies(all).map(g => ({ name: agencyGroupName(g, a => a.name), region: groupHome(g).region ?? null, d: Math.min(...g.members.map(m => dist(m.center))), here: g.members.some(m => have.has(m.slug)) }));
  return {
    near, centredOn, km, ...(notes.length ? { note: notes.join(' ') } : {}), serverHas: have.size, atlasHas: all.length,
    agencies: entries.filter(x => x.d <= km).sort((x, y) => x.d - y.d).map(x => ({ name: x.name, region: x.region, km: Math.round(x.d), here: x.here })),
  };
}

/**
 * "Now" for History's doubtful rule, by part of the day: today's schedule where the answer shows it as the last row (#1619:
 * Kingston 501's newest History snapshot runs every 15 midday, today's schedule every 30), else History's newest snapshot.
 * Where now has no figure in that part of the day, its best figure.
 */
export function historyNow(todayWait: Partial<Record<PeriodKey, number>> | null, newestValue: (k: PeriodKey) => number | null): (k: PeriodKey) => number | null {
  const own = (k: PeriodKey) => (todayWait ? todayWait[k] : newestValue(k)) ?? null;
  const best = Math.min(...PERIOD_KEYS.map(own).filter((v): v is number => v != null));
  return k => own(k) ?? (Number.isFinite(best) ? best : null);
}
/** Doubtful: every 3 minutes or less in an old schedule, on a route that now runs every 30 minutes or more (GitHub #1580). */
export const isDoubtfulHistoryFigure = (old: number | null, now: number | null) => old != null && old <= 3 && now != null && now >= 30;

/** A route's History: each schedule Atlas has kept, oldest first, with its value in each period, read as History reads it. */
export async function routeHistory(agency: CatalogAgency, routeQuery: string, day: DayType) {
  const slug = agency.slug;
  const names = await store.historyIndex(slug);
  if (!names) return null;
  const q = routeQuery.trim().toLowerCase();
  let at = names.findIndex(([short]) => short.toLowerCase() === q);
  if (at < 0) at = names.findIndex(([, name]) => (name ?? '').toLowerCase() === q);
  if (at < 0) at = names.findIndex(([short, name]) => `${short} ${name ?? ''}`.toLowerCase().includes(q));
  const route = at >= 0 ? await store.historyRoute(slug, at) : null;
  if (!route) return { route: null, routes: names.length };
  const snaps = [...snapshotsNewestFirst(usableSnapshots(route.snapshots))].reverse();
  const newest = snaps[snaps.length - 1];
  const valueOf = (s: typeof snaps[number] | undefined, k: PeriodKey) => { if (!s) return null; const v = historyDayPeriodValue(s as never, day, k); return v.kind === 'value' ? v.min : null; };
  // GitHub #1580: some old schedules hold impossible values (1-3 min on routes that now run every 30 or more), most
  // likely two copies of a service counted together. Until that is fixed, such a value is marked, not reported as real.
  // "Now" is the newest schedule's figure in the same part of the day, or, where it has none there, its best figure.
  // CIV-1840: History can end before the schedule on the map (Kingston 12's last snapshot is Aug 2026, midday only, while
  // today's schedule runs every 30 from 6:30 AM). When the agency was refreshed after History's newest snapshot, end with
  // today's schedule as a row, from the same figures route_frequency gives.
  const monthOf = (label: string) => { const t = Date.parse(`1 ${label} UTC`); return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 7); };
  const newestMonth = newest ? monthOf(newest.label) : null;
  const refreshed = agency.lastRefreshedAt?.slice(0, 7) ?? null;
  let current: Record<string, string> | null = null;
  // Today's schedule, where it is shown as the last row: then "now" for the doubtful rule is today, not History's newest (#1619).
  let todayWait: Partial<Record<PeriodKey, number>> | null = null;
  if (newestMonth && refreshed && refreshed > newestMonth) {
    try {
      const today = findRoute(await routeList(agency, day), route.routeShortName);
      if (today) {
        const cells = PERIOD_KEYS.flatMap(k => { const f = today.figures[k]; return f.waitMinutes != null ? [[PERIOD_LABELS[k], headwayEvery(f.waitMinutes)]] : f.shown === 'no service' ? [[PERIOD_LABELS[k], 'no service']] : []; });
        const through = agency.lastFeedExpiry ? `, runs to ${agency.lastFeedExpiry.slice(0, 4)}-${agency.lastFeedExpiry.slice(4, 6)}-${agency.lastFeedExpiry.slice(6, 8)}` : '';
        todayWait = Object.fromEntries(PERIOD_KEYS.flatMap(k => today.figures[k].waitMinutes != null ? [[k, today.figures[k].waitMinutes!]] : []));
        current = { schedule: `Today's schedule on Atlas's map (History's newest is ${newest.label}${through})`, ...Object.fromEntries(cells) };
      }
    } catch { /* no route data here: History alone */ }
  }
  const nowOf = historyNow(todayWait, k => valueOf(newest, k));
  const suspect = (s: typeof snaps[number], k: PeriodKey) => (todayWait != null || s !== newest) && isDoubtfulHistoryFigure(valueOf(s, k), nowOf(k));
  let flagged = 0;
  return {
    route: route.routeShortName, name: route.routeName ?? null,
    schedules: [...snaps.map(s => ({ schedule: s.label, ...Object.fromEntries(PERIOD_KEYS.map(k => {
      const v = historyDayPeriodValue(s as never, day, k);
      if (v.kind === 'value' && suspect(s, k)) { flagged++; return [PERIOD_LABELS[k], `every ${v.min} min (doubtful: likely a data error, being checked)`]; }
      return [PERIOD_LABELS[k], v.kind === 'value' ? headwayEvery(v.min) : v.kind === 'none' ? 'no service' : null];
    }).filter(([, v]) => v != null)) })), ...(current ? [current] : [])],
    ...(flagged ? { warning: `${flagged} figure(s) marked doubtful: every 3 minutes or less in an old schedule, on a route that now runs every 30 minutes or more. These are most likely data errors, not real service; don't report them as fact.` } : {}),
  };
}

// ---- Buses needed (CIV-1693; read through the store since CIV-1977, so the hosted server has it too) ----

export type BusesNeeded =
  | { cached: false }
  | { cached: true; feed: string; olderSchedule: boolean; referenceDate: string; groups: StudioVehicleGroup[] };

/** A route number to compare, without leading zeros: Studio's file names Hamilton's routes "01", "02" (#1617). */
const routeKey = (r: string) => r.trim().toLowerCase().replace(/^0+(?=\d)/, '');

/**
 * Buses needed to run a route in a period, from Studio's own buses-needed file (the same figures Studio's page shows).
 * It never runs the calculation itself: on a large agency that takes minutes (manager, 2026-11-17: "buses_needed must
 * not spawn an 8-minute calculation per question"). Where no file exists it says so, with no build command (#1613).
 */
export async function busesNeeded(slug: string, route: string, period: PeriodKey): Promise<BusesNeeded> {
  const v = await store.vehicles(slug);
  if (!v) return { cached: false };
  const newest = store.newestFeedName ? await store.newestFeedName(slug) : null;
  const want = routeKey(route);
  const groups = (v.periods[period] ?? []).filter(g => g.routes.some(r => routeKey(r) === want));
  return { cached: true, feed: v.feed, olderSchedule: !!newest && newest !== v.feed, referenceDate: v.referenceDate, groups };
}
