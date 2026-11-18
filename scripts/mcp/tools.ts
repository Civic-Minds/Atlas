/**
 * The Atlas Studio MCP tools that read only published data (CIV-1840): definitions, instructions and handlers, with no
 * file, process or pipeline import, so the local stdio server and the hosted Worker serve the very same tools. The store
 * they read is set with useStore() in atlasData.ts. Local-only tools (trip times, combined frequency, buses needed) are
 * defined in atlas-mcp.ts.
 */
import { PERIOD_KEYS, PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { clockTime } from '../../shared/timeText';
import { DAY_TYPES } from '../../shared/rules/days';
import { countryForRegion } from '../../shared/regionCountry';
import * as data from './atlasData';
import type { IndexedAgency } from './atlasData';
import { PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';
import { modeLabel } from '../../shared/modes';
import { ROUTE_TYPE } from '../../shared/rules/modes';
import { SITE_URL } from '../../shared/rules/paths';
import { TIME_PERIODS } from '../../shared/rules/periods';
import { MAP_URL } from '../../src/utils/urlSchema';
import { AGENCIES_PARAM } from '../../src/utils/shareUrlState';
import { buildRouteKey } from '../../src/utils/routeKey';
import { liveReader } from './liveData';
import { LIVE_ARCHIVE_SLUGS, coverageLimits } from '../../shared/liveCoverage';
import { RELIABILITY_BANDS } from '../../shared/liveReliability';
import { LATE_ABOVE_MIN, EARLY_AT_OR_BELOW_MIN, BUNCHED_GAP_SEC, GAPPED_FACTOR } from '../../shared/rules/live';

const PERIODS = PERIOD_KEYS.map(k => PERIOD_LABELS[k]);
const day = { type: 'string', enum: [...DAY_TYPES], description: 'Day type; Weekday when left out.' };
const agency = { type: 'string', description: 'Agency name or short name, e.g. "TTC" or "Toronto Transit Commission".' };
const alsoAgencies = { type: 'array', items: { type: 'string' }, description: 'Optional other agencies serving the same trip, counted together (e.g. LA Metro with Big Blue Bus between downtown LA and Santa Monica). Use list_agencies near a place to find them.' };
const period = { type: 'string', enum: PERIODS, description: `Part of the day: ${PERIOD_KEYS.map(k => `${PERIOD_LABELS[k]} ${formatPeriodRange(k)}`).join(', ')}.` };
const livePeriod = { type: 'string', enum: ['All day', ...RELIABILITY_BANDS.filter(b => b !== 'all').map(b => PERIOD_LABELS[b])], description: 'Optional part of the day; every part when left out.' };
const every = { type: 'number', description: `Minutes: routes that run this often or better. Atlas's map uses ${PUBLIC_TIER_MAXES.join(', ')}.` };
const fromTime = { type: 'string', description: 'Optional start of a time window, such as "10:00" or "10 AM".' };
const toTime = { type: 'string', description: 'Optional end of the time window, such as "18:00" or "6 PM".' };
const stop = (which: string) => ({ type: 'string', description: `${which} stop or station name, e.g. "Dufferin Station".` });

const WAIT = 'waitMinutes is the typical wait on the route\'s slower direction: its main stretch plus its steady branches, the number Atlas colours and filters the route by. A branch end that runs unevenly shows only in "shown", the route list\'s own words, with a range where parts of the route differ.';
const TOOL_LIST = [
  { name: 'list_agencies', description: 'Find transit agencies Atlas covers, filtered by name or city, region (state or province) and country, or near a place (another agency or a city, within 60 km by default). Returns at most 40 compact rows; with no filter, only the count.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Name or city to search for.' }, region: { type: 'string', description: 'State or province, e.g. "Ontario", "Ohio".' }, country: { type: 'string', description: 'Country, e.g. "Canada", "United States".' }, near: { type: 'string', description: 'An agency or city: agencies whose area centre is within km of it.' }, km: { type: 'number', description: 'Distance for near; 60 when left out.' } } } },
  { name: 'rank_agencies', description: `Rank agencies by how many of their routes run every N minutes or better in a part of the day (by waitMinutes). Filter by country, region, kind (bus: no rail routes and not ferries only; rail: has rail routes; ferry: every route is a ferry) and size: weekday route count between min_routes and max_routes, or similar_to an agency (half to double its weekday routes, and the same kind). Agencies that are part of a larger operator are flagged and, with similar_to, left out unless include_parts is true. Returns each agency's routes on the day, routes meeting the bar, and the list of those routes. ${WAIT}`, inputSchema: { type: 'object', properties: { period, every, day, country: { type: 'string' }, region: { type: 'string' }, similar_to: { type: 'string', description: 'An agency to find peers of: half to double its weekday route count, the same kind (bus only, or with rail), not part of a larger operator.' }, kind: { type: 'string', enum: ['bus', 'rail', 'ferry'], description: 'bus: agencies with no rail routes (and not ferries only); rail: agencies with rail routes; ferry: agencies whose routes are all ferries.' }, include_parts: { type: 'boolean', description: 'Keep agencies that are part of a larger operator (such as one MTA borough) when using similar_to.' }, min_routes: { type: 'number' }, max_routes: { type: 'number' }, limit: { type: 'number', description: 'How many agencies to return; 15 when left out.' } }, required: ['period', 'every'] } },
  { name: 'route_frequency', description: `How often a route runs in each part of the day on a day type, with its first and last trips and its branches (where each goes, first and last stop, trips). ${WAIT} With a time window it also gives the frequency hour by hour. It reads today's schedule only: for how a route ran in past years (a frequency in 2017, a cut since), use route_history.`, inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'route'] } },
  { name: 'routes_at_frequency', description: `Routes in an agency that run every N minutes or better in a part of the day (by waitMinutes: ${WAIT})`, inputSchema: { type: 'object', properties: { agency, period, every, day }, required: ['agency', 'period', 'every'] } },
  { name: 'compare_agencies', description: 'For several agencies, how many routes run every N minutes or better in a part of the day.', inputSchema: { type: 'object', properties: { agencies: { type: 'array', items: { type: 'string' } }, period, every, day }, required: ['agencies', 'period', 'every'] } },
  { name: 'routes_near', description: 'Routes that stop near a place: a corner ("Bathurst and Bloor"), a station or a stop name, within 250 m by default, with the stops each uses there and the weekday first and last trips of each route (a route that runs only at night is marked nightRoute). Then use route_frequency for how often they run.', inputSchema: { type: 'object', properties: { agency, place: { type: 'string', description: 'Corner, station or stop name, e.g. "Bathurst and Bloor".' }, metres: { type: 'number' } }, required: ['agency', 'place'] } },
  { name: 'route_history', description: "How a route's frequency has changed over the years, from Atlas's History: each schedule Atlas has kept for it, oldest first, with how often it ran in each part of the day. Coverage depends on the agency; the answer says when Atlas has none.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day }, required: ['agency', 'route'] } },
  { name: 'buses_needed', description: "Buses needed to run a route in a part of the day, from Atlas Studio's buses-needed file for the agency (the same figures Studio's page shows): buses scheduled now, buses needed at the schedule's own frequency, and buses needed every 10, 15, 20, 30 or 60 minutes. Routes that share buses are counted together. Counts use the schedule's own layover. Only agencies whose file has been built have an answer; for others it says so.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string' }, period, every: { type: 'number', description: 'Optional target minutes between buses: 10, 15, 20, 30 or 60.' } }, required: ['agency', 'route', 'period'] } },
  { name: 'routes_by_hours', description: "Routes whose service ends early or starts late on a day type: every route whose last trip leaves before ends_before, or whose first trip leaves after starts_after, with its first and last trips. For questions such as which routes stop before 10 PM on Sundays.", inputSchema: { type: 'object', properties: { agency, day, ends_before: { type: 'string', description: 'Clock time, e.g. "22:00" or "10 PM".' }, starts_after: { type: 'string', description: 'Clock time, e.g. "07:00".' } }, required: ['agency'] } },
  { name: 'trip_time', description: 'Scheduled trip time from one stop to another, by hour the trip leaves, for each route that runs between them (or the routes named). Use it to compare routes, such as a local and an express, or to see whether the trip takes longer at some hours.', inputSchema: { type: 'object', properties: { agency, also_agencies: alsoAgencies, from_stop: stop('Starting'), to_stop: stop('Ending'), routes: { type: 'array', items: { type: 'string' }, description: 'Optional route numbers; every route between the stops when left out.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'combined_frequency', description: 'Every route that goes from one stop to another, and how often a rider leaving the first stop gets a trip on any of them combined, using the rule Atlas uses to combine trips at a stop (two trips a minute or less apart count as one; uneven combined service says so).', inputSchema: { type: 'object', properties: { agency, also_agencies: alsoAgencies, from_stop: stop('Starting'), to_stop: stop('Ending'), day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'route_reliability', description: "How a route actually ran against its schedule, from Atlas Live's recordings of where vehicles were (past service, not right now): the share of departures that were late, typical trip time against the timetable's, the share of scheduled trips that ran, this week against last week, and the stops most often late, for the whole day and each part of the day. Leave out route to rank the agency's recorded routes by how often they were late. Atlas records only some agencies (the answer says which routes it has).", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name; leave out to rank the recorded routes.' }, period: livePeriod }, required: ['agency'] } },
  { name: 'route_bunching', description: "How evenly a route's vehicles were spaced, from Atlas Live's recordings (past service): the share of gaps between vehicles that were bunched (too close) or gapped (far longer than scheduled), this week against last week, where along the route bunching forms, and the stops where the spacing goes most wrong, by direction and part of the day.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, period: livePeriod }, required: ['agency', 'route'] } },
  { name: 'schedule_changes', description: "What changed between an agency's two most recent schedules, where Atlas has built that comparison: routes added and removed, and frequency changes, biggest first. A frequency change counts when a route moves to a different step of Atlas's scale.", inputSchema: { type: 'object', properties: { agency, offset: { type: 'number', description: 'Skip this many frequency changes (to page through a long list).' }, limit: { type: 'number', description: 'How many frequency changes to return; 40 when left out, 200 at most.' } }, required: ['agency'] } },
];

/**
 * Every tool takes an optional `question` (Ryan, 2026-11-18): the person's question as the assistant understood it. The
 * assistant fills it, it isn't guaranteed, and the tools ignore it; the hosted server logs it to improve Atlas.
 */
const QUESTION = { type: 'string', description: "Optional: the person's question, as you understood it. Used only to improve Atlas; leave it out if unsure." };
/**
 * Each tool's human-readable title, for the annotations directories ask for (CIV-1854: Claude's and ChatGPT's directories
 * and Microsoft's connector gallery want a title and readOnlyHint on every tool).
 */
const TITLES: Record<string, string> = {
  list_agencies: 'Find agencies', rank_agencies: 'Rank agencies by frequent routes', route_frequency: 'How often a route runs',
  routes_at_frequency: 'Routes at a frequency', compare_agencies: 'Compare agencies', routes_near: 'Routes near a place',
  route_history: 'Route history', buses_needed: 'Buses needed', routes_by_hours: 'Routes that end early or start late',
  trip_time: 'Trip time between stops', combined_frequency: 'Combined frequency between stops', schedule_changes: 'Schedule changes',
  route_reliability: 'How a route ran against its schedule', route_bunching: 'How evenly vehicles were spaced',
};
/** Every tool only reads Atlas's own published data: nothing is changed, and nothing outside Atlas is reached. */
const annotations = (name: string) => ({ title: TITLES[name] ?? name, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
export const TOOLS = TOOL_LIST.map(t => ({ ...t, title: TITLES[t.name] ?? t.name, annotations: annotations(t.name), inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, question: QUESTION } } }));

/** The server's version: bump when a tool's answers change (the TEST-LOG version rule). */
export const SERVER_VERSION = '0.10.0';

export type Args = Record<string, unknown>;

/**
 * A link to the same view on the Atlas map, built from the map's own link parameters (src/utils/urlSchema.ts): the
 * route card, or the agencies with a frequency filter, a day and a part of the day. The map always shows the live
 * release, so a link opens on the newest schedule; the answer's scheduleValidThrough says which one that is.
 */
export function mapLink(view: { route?: { agency: string; routeId: string }; agencies?: string[]; day?: string; period?: string; every?: number }): string {
  const q = new URLSearchParams();
  if (view.agencies?.length) q.set(AGENCIES_PARAM, view.agencies.join('.'));
  if (view.route) q.set(MAP_URL.route.key, buildRouteKey(view.route.agency, view.route.routeId));
  if (view.every != null && (PUBLIC_TIER_MAXES as readonly number[]).includes(view.every)) q.set(MAP_URL.headway.key, MAP_URL.headway.serialize(view.every));
  if (view.period) q.set(MAP_URL.period.key, view.period);
  if (view.day) q.set(MAP_URL.day.key, view.day);
  return `${SITE_URL}/?${q.toString()}`;
}

/**
 * A time window for the service day. A clock window that starts before the first part of the day (12 AM–3 AM) can mean
 * the hours after midnight that belong to the day's late night (24:00–27:00), where the schedule writes them, or the
 * hours at its start (5 AM). Both are read: the starts that fall in the window shifted a day, folded into it.
 */
export function startsInWindow(starts: readonly number[], w: { start: number; end: number }): number[] {
  return starts.filter(t => windowHas(t, w)).map(t => (t >= w.end ? t - 1440 : t));
}

/** Whether a departure (minutes in the service day) falls in a window, reading an early-morning window both ways (see startsInWindow). */
export function windowHas(t: number, w: { start: number; end: number }): boolean {
  if (t >= w.start && t < w.end) return true;
  return w.start < TIME_PERIODS[0].startHour * 60 && w.end <= 1440 && t >= w.start + 1440 && t < w.end + 1440;
}
export const validThrough = (a: { lastFeedExpiry?: string | null }) => a.lastFeedExpiry ? `${a.lastFeedExpiry.slice(0, 4)}-${a.lastFeedExpiry.slice(4, 6)}-${a.lastFeedExpiry.slice(6, 8)}` : null;
export const SOURCE = "Atlas's published schedule data for this agency.";

export async function needAgency(q: unknown) {
  const a = await data.findAgency(String(q ?? ''));
  if (!a) throw new Error(`No agency matching "${q}" has data here. Use list_agencies to search.`);
  return a;
}
export function needPeriod(p: unknown) {
  const k = data.parsePeriod(p);
  if (!k) throw new Error(`Unknown period "${p}". Use one of: ${PERIODS.join(', ')}.`);
  return k;
}
/** A time window from from_time/to_time, or null when neither is given. */
export function window(args: Args): { start: number; end: number; label: string; periods: string[] } | null {
  if (args.from_time == null && args.to_time == null) return null;
  const start = data.parseClock(args.from_time ?? '0:00'), clockEnd = data.parseClock(args.to_time ?? '24:00');
  // A window that ends earlier on the clock runs past midnight (10 PM to 4 AM), read as the schedule writes it (to 28:00).
  const end = clockEnd != null && start != null && clockEnd <= start && clockEnd + 1440 - start <= 1440 ? clockEnd + 1440 : clockEnd;
  if (start == null || end == null || end <= start) throw new Error('Give the window as from_time and to_time, such as "10:00" and "18:00", or "22:00" and "04:00" past midnight.');
  return { start, end, label: `${clockTime(start)}–${clockTime(end)}`, periods: data.periodsIn(start, end) };
}
/** The asked agency plus any also_agencies, each once. */
export async function withAlso(a: Awaited<ReturnType<typeof needAgency>>, args: Args) {
  const more = await Promise.all((Array.isArray(args.also_agencies) ? args.also_agencies : []).map(q => needAgency(q)));
  return [a, ...more].filter((x, i, all) => all.findIndex(y => y.slug === x.slug) === i);
}
/** Trip times read the schedule file on this Mac, which can be older than the schedule behind the map's figures: say so first. */
export const staleNote = (a: { lastFeedExpiry?: string | null }, ends: string | null) => (ends && a.lastFeedExpiry && ends < a.lastFeedExpiry
  ? { scheduleWarning: `These trip times come from an older schedule file on this Mac (service to ${ends.slice(0, 4)}-${ends.slice(4, 6)}-${ends.slice(6, 8)}); the map's figures use the current one (to ${validThrough(a)}). Times may have changed since.` }
  : {});
export const windowNote = (w: { label: string; periods: string[] }) => `The window ${w.label} overlaps these Atlas periods: ${w.periods.join(', ')}. Hourly figures are the typical wait in trips leaving that hour.`;

/**
 * How to answer with these tools, sent to every assistant at the start (MCP initialize instructions). Gemini's run of
 * the final round (2026-11-17) gave reasons and figures from memory as if they were Atlas's, and tried the shell when a
 * tool had no answer.
 */
export const INSTRUCTIONS = [
  "Atlas Studio answers from Atlas's published schedules. Give the figures its tools return, with the hours and the schedule's end date.",
  "Anything not from these tools (ridership, crowding, causes of a change, holiday plans, history before Atlas's data) is outside Atlas: leave it out, or say plainly where it comes from.",
  "When a tool says Atlas has no figure, say so; don't work one out or estimate it unless the person asks for an estimate, and then call it yours.",
  "Don't run shell commands or read files to get around a missing tool.",
].join(' ');

const LIVE_SOURCE = "Atlas Live's recordings of where vehicles were, matched to the timetable (past service, not live).";
/** The meaning of every Live figure, worded from the shared rules (shared/rules/live.ts). */
const LIVE_DEFINITIONS = {
  late: `More than ${LATE_ABOVE_MIN} minutes after the scheduled time.`,
  early: `${Math.abs(EARLY_AT_OR_BELOW_MIN)} minutes or more before the scheduled time.`,
  bunched: `A gap of ${BUNCHED_GAP_SEC / 60} minutes or less behind the vehicle ahead.`,
  gapped: `A gap more than ${GAPPED_FACTOR} times the scheduled gap.`,
  shares: 'Shares are fractions: 0.093 means 9.3% of departures. Give them as percentages, never as "1 in N" or "4 in 10".',
};
const bandLabel = (k: string) => (k === 'all' ? 'All day' : `${PERIOD_LABELS[k as keyof typeof PERIOD_LABELS]} (${formatPeriodRange(k as Parameters<typeof formatPeriodRange>[0])})`);
function liveBand(p: unknown): string | null {
  if (p == null || p === '' || /^all/i.test(String(p))) return null;
  const k = RELIABILITY_BANDS.find(b => b !== 'all' && PERIOD_LABELS[b as keyof typeof PERIOD_LABELS].toLowerCase() === String(p).toLowerCase());
  if (!k) throw new Error(`Part of the day must be one of: All day, ${RELIABILITY_BANDS.filter(b => b !== 'all').map(b => PERIOD_LABELS[b as keyof typeof PERIOD_LABELS]).join(', ')}.`);
  return k;
}
const liveWeeks = (m: { thisWeek: { from: string; to: string } | null; lastWeek: { from: string; to: string } | null }) => ({ thisWeek: m.thisWeek, lastWeek: m.lastWeek });
/** Any public agency, whether or not its route files are on hand: Live figures don't need them. */
async function liveAgencyFor(q: unknown) {
  const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
  if (!a) throw new Error(`No agency matches "${q}". Use list_agencies to search.`);
  return a;
}
async function liveAgency(a: { slug: string; name: string }) {
  const [manifest, coverage] = await Promise.all([liveReader().manifest(a.slug), liveReader().coverage(a.slug)]);
  // Each answer states what Live has recorded for the agency (CIV-1860, Ryan: "mention the limits right now if applicable").
  const limits = coverage ? coverageLimits(coverage, manifest?.routes.length ?? 0) : undefined;
  if (!manifest) {
    const note = !LIVE_ARCHIVE_SLUGS.includes(a.slug)
      ? `Atlas does not record Live data for ${a.name}, so it has no figures for how its routes actually ran. It has the published schedule (route_frequency).`
      : `Atlas records Live data for ${a.name} but has no figures for it yet. It has the published schedule (route_frequency).`;
    return { none: { agency: a.name, live: null, note, ...(limits ? { limits } : {}) } };
  }
  return { manifest, limits };
}
async function liveRoute(a: { slug: string; name: string }, m: { routes: string[] }, route: unknown, limits?: string[]) {
  const q = String(route ?? '').trim().toLowerCase();
  const id = m.routes.find(r => r.toLowerCase() === q) ?? m.routes.find(r => q.startsWith(`${r.toLowerCase()} `));
  if (!id) return { none: { agency: a.name, live: null, routesWithFigures: m.routes, note: `Atlas has Live figures for ${a.name} only on these routes; "${route}" is not one of them.`, ...(limits ? { limits } : {}) } };
  const file = await liveReader().route(a.slug, id);
  if (!file) return { none: { agency: a.name, live: null, note: `Atlas has no Live figures for route ${id} yet.` } };
  return { file };
}

/** The Live tools (CIV-1860). The hosted pilot hides them until Ryan decides whether testers see Live figures. */
export const LIVE_TOOLS: readonly string[] = ['route_reliability', 'route_bunching'];

export const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  list_agencies: async ({ query, region, country, near, km }) => {
    if (near != null) {
      const res = await data.agenciesNear(String(near), km != null ? Number(km) : 60);
      if (!res) throw new Error(`No agency or city matching "${near}".`);
      return { ...res, agencies: res.agencies.slice(0, 40).map(a => `${a.name} | ${a.region ?? ''} | ${a.km} km`), columns: 'name | region | distance between area centres' };
    }
    const q = String(query ?? '').trim().toLowerCase(), reg = String(region ?? '').trim().toLowerCase(), ctry = String(country ?? '').trim();
    const all = await data.availableAgencies();
    if (!q && !reg && !ctry) return { agencies: all.length, note: 'Filter by name or city, region or country to list them.' };
    const hits = all.filter(a => (!q || [a.slug, a.name, ...(a.cities ?? [])].some(x => x.toLowerCase().includes(q)))
      && (!reg || (a.region ?? '').toLowerCase() === reg)
      && (!ctry || data.sameCountry(countryForRegion(a.region), ctry)));
    if (!hits.length && q && !reg && !ctry) {
      // A service brand is not an agency name (Viva is part of York Region Transit): look for it in route names.
      const idx = await data.agencyIndex();
      const inRoutes = (idx ?? []).flatMap(a => { const names = [...new Set((a.days.Weekday ?? []).filter(r => `${r.route} ${r.name ?? ''}`.toLowerCase().includes(q)).map(r => `${r.route}${r.name ? ` ${r.name}` : ''}`))]; return names.length ? [{ agency: a.name, routes: names.slice(0, 6) }] : []; });
      if (inRoutes.length) return { matches: 0, note: `No agency is named "${query}". It appears in route names at these agencies, so it may be a service run by one of them: ${inRoutes.slice(0, 8).map(x => x.agency).join(', ')}.`, inRouteNames: inRoutes.slice(0, 8) };
    }
    return { matches: hits.length, agencies: hits.slice(0, 40).map(a => [a.name, a.region ?? '', validThrough(a) ?? ''].join(' | ')), columns: 'name | region | schedule valid through', ...(hits.length > 40 ? { note: 'First 40 shown; narrow the filter for the rest.' } : {}) };
  },
  rank_agencies: async (args) => {
    const idx = await data.agencyIndex();
    if (!idx) throw new Error('The agency index has not been built for the current data. Run: nice -n 15 npx tsx scripts/mcp/buildIndex.ts');
    const dayType = data.parseDay(args.day), key = needPeriod(args.period), minutes = Number(args.every);
    const weekdayRoutes = (a: IndexedAgency) => a.days.Weekday?.length ?? 0;
    let lo = args.min_routes != null ? Number(args.min_routes) : 0, hi = args.max_routes != null ? Number(args.max_routes) : Infinity;
    let like: string | null = null;
    let kind: 'bus' | 'rail' | 'ferry' | null = args.kind === 'bus' || args.kind === 'rail' || args.kind === 'ferry' ? args.kind : null;
    const KIND_TEXT = { bus: 'buses only', rail: 'with rail', ferry: 'ferries only' };
    const ends = new Map((await data.publicAgencies()).map(x => [x.slug, validThrough(x)]));
    let skipParts = false;
    const FERRY = modeLabel(ROUTE_TYPE.FERRY);
    const kindOf = (a: IndexedAgency): 'bus' | 'rail' | 'ferry' => (a.railRoutes > 0 ? 'rail' : (a.days.Weekday ?? []).length > 0 && (a.days.Weekday ?? []).every(r => r.mode === FERRY) ? 'ferry' : 'bus');
    if (args.similar_to != null) {
      const a = await needAgency(args.similar_to);
      const self = idx.find(x => x.slug === a.slug);
      if (!self) throw new Error(`${a.name} is not in the index.`);
      kind ??= kindOf(self);
      skipParts = args.include_parts !== true;
      like = `${a.name}: ${weekdayRoutes(self)} weekday routes, ${KIND_TEXT[kindOf(self)]}`;
      lo = Math.ceil(weekdayRoutes(self) / 2); hi = weekdayRoutes(self) * 2;
    }
    const reg = String(args.region ?? '').trim().toLowerCase(), ctry = String(args.country ?? '').trim();
    const pool = idx.filter(a => (!reg || (a.region ?? '').toLowerCase() === reg) && (!ctry || data.sameCountry(a.country, ctry)) && weekdayRoutes(a) >= lo && weekdayRoutes(a) <= hi
      && (!kind || kindOf(a) === kind) && !(skipParts && a.partOf));
    const rows = pool.map(a => {
      const routes = a.days[dayType] ?? [];
      const meeting = routes.filter(r => r.wait[key] != null && r.wait[key]! <= minutes).sort((x, y) => x.wait[key]! - y.wait[key]!);
      return { agency: a.name, region: a.region, ...(a.partOf ? { partOf: a.partOf } : {}), kind: KIND_TEXT[kindOf(a)], scheduleValidThrough: ends.get(a.slug) ?? null, weekdayRoutes: weekdayRoutes(a), routesOnDay: routes.length, routesMeeting: meeting.length, routes: meeting.map(r => `${r.route}${r.name ? ` ${r.name}` : ''} (every ${r.wait[key]})`) };
    }).sort((x, y) => y.routesMeeting - x.routesMeeting || x.agency.localeCompare(y.agency));
    const limit = args.limit != null ? Number(args.limit) : 15;
    return {
      day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes,
      ...(like ? { peersOf: like } : {}), ...(kind ? { kind: KIND_TEXT[kind] } : {}), ...(skipParts ? { leftOut: 'agencies that are part of a larger operator' } : {}), sizeRange: `${lo}–${hi === Infinity ? 'any' : hi} weekday routes`,
      agenciesCompared: rows.length, ranking: rows.slice(0, limit), source: SOURCE,
    };
  },
  route_frequency: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const found = data.findRoute(await data.routeList(a, dayType), String(args.route ?? ''));
    if (!found) throw new Error(`${a.name} has no route matching "${args.route}" on ${dayType}.`);
    const r = await data.routeWithRows(a, dayType, found);
    const w = window(args);
    const sameRoutes = await data.sameNameRoutes(a, dayType, r);
    return {
      agency: a.name, route: r.name, name: r.longName, mode: r.mode, day: dayType,
      periods: PERIOD_KEYS.map(p => data.periodFigure(r, p)),
      service: data.serviceSpan(r),
      branches: await data.branchesOf(a, r),
      branchesNote: 'Branches that end at the same stop are one row, with their trips counted once; startsAt names where its trips begin.',
      ...(() => { const same = sameRoutes; return same.length ? { sameNameRoutes: same, sameNameNote: `Other ${a.name} routes with the same name, often a night or express version on the same street. A rider on this street can use them too; combined_frequency between two stops counts them together.` } : {}; })(),
      ...(w ? { window: w.label, hourly: data.hourlyFrequency(r, w.start, w.end, await data.endOfRows(a)), windowNote: windowNote(w), hourlyNote: "Each column is one branch's own frequency by hour. Branches that end at the same stop share their trips, so the direction as a whole runs more often than any one column says." } : {}),
      mapLink: mapLink({ route: found.routeIds[0] != null ? { agency: a.slug, routeId: found.routeIds[0] } : undefined, day: dayType }),
      scheduleValidThrough: validThrough(a), source: SOURCE,
    };
  },
  routes_at_frequency: async ({ agency: q, period: p, every: n, day: d }) => {
    const a = await needAgency(q);
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const res = await data.routesMeeting(a, dayType, key, minutes);
    return { agency: a.name, day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, meeting: res.meeting.map(m => ({ route: m.route, name: m.longName, mode: m.mode, shown: m.shown, waitMinutes: m.waitMinutes })), mapLink: mapLink({ agencies: [a.slug], day: dayType, period: key, every: minutes }), scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  compare_agencies: async ({ agencies, period: p, every: n, day: d }) => {
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const rows = await Promise.all((Array.isArray(agencies) ? agencies : []).map(async q => {
      const a = await needAgency(q);
      const res = await data.routesMeeting(a, dayType, key, minutes);
      return { slug: a.slug, agency: a.name, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, routesMeeting: res.meeting.length, scheduleValidThrough: validThrough(a) };
    }));
    return { day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, agencies: rows.map(({ slug: _slug, ...row }) => row), mapLink: mapLink({ agencies: rows.map(r => r.slug), day: dayType, period: key, every: minutes }), source: SOURCE };
  },
  routes_near: async ({ agency: q, place, metres }) => {
    const a = await needAgency(q);
    const res = await data.routesNear(a, String(place ?? ''), metres != null ? Number(metres) : 250);
    if (!res.matchedStops.length) return { agency: a.name, place, routes: [], note: 'No stop name matches every part of that place. Try a station or a street name as the stops are named.', scheduleValidThrough: validThrough(a) };
    return { agency: a.name, place, ...res, scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  route_history: async ({ agency: q, route, day: d }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const dayType = data.parseDay(d);
    const h = await data.routeHistory(a, String(route ?? ''), dayType);
    if (!h) return { agency: a.name, history: null, note: "Atlas's History has no data for this agency." };
    if (!h.route) return { agency: a.name, history: null, note: `Atlas's History has ${h.routes} routes for this agency, none matching "${route}".` };
    return { agency: a.name, day: dayType, ...h, scheduleValidThrough: validThrough(a), note: 'Each schedule is one Atlas kept from that time; a part of the day with no figure is left out. Older schedules may lack weekend figures. Where a route starts or stops partway through a part of the day, Atlas counts the wait to the edge of that part, so a figure can be far longer than the gap between the trips that run (a route every 10 min until 1 AM shows every 61 min from 11 PM to 2 AM). That is the rule Atlas uses, not a data error.', source: "Atlas's History data." };
  },
  routes_by_hours: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const endsBefore = args.ends_before != null ? data.parseClock(args.ends_before) : null;
    const startsAfter = args.starts_after != null ? data.parseClock(args.starts_after) : null;
    if (endsBefore == null && startsAfter == null) throw new Error('Give ends_before or starts_after as a clock time, such as "22:00".');
    const routes = await data.routesByHours(a, dayType, endsBefore, startsAfter);
    return { agency: a.name, day: dayType, ...(endsBefore != null ? { endsBefore: clockTime(endsBefore) } : {}), ...(startsAfter != null ? { startsAfter: clockTime(startsAfter) } : {}), routesOnDay: (await data.routeList(a, dayType)).length, count: routes.length, routes, note: 'A last trip after midnight counts as that night, not as early.', scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  route_reliability: async ({ agency: q, route, period: p }) => {
    const band = liveBand(p);
    const a = await liveAgencyFor(q);
    const live = await liveAgency(a);
    if ('none' in live) return live.none;
    if (route == null || String(route).trim() === '') {
      const r = await liveReader().ranking(a.slug);
      if (!r) return { agency: a.name, ranking: null, note: 'Atlas has no ranking of recorded routes for this agency.' };
      const routes = [...r.routes].sort((x, y) => (y.lateShare ?? -1) - (x.lateShare ?? -1)).map(x => ({ route: x.route, name: x.titleLabel, lateShare: x.lateShare, lateShareLastWeek: x.lateLastWeek, departures: x.lateN, bunchedOrGappedShare: x.bunchingShare, deliveredShare: x.deliveredShare }));
      return { agency: a.name, ...liveWeeks(live.manifest), measured: 'Whole day, this week, most often late first.', routes, held: r.held.map(h => h.route), ...(live.limits ? { limits: live.limits } : {}), definitions: LIVE_DEFINITIONS, source: LIVE_SOURCE };
    }
    const f = await liveRoute(a, live.manifest, route, live.limits);
    if ('none' in f) return f.none;
    const bands = Object.fromEntries(Object.entries(f.file.reliability.bands).filter(([k]) => !band || k === band).map(([k, v]) => [bandLabel(k), v]));
    return { agency: a.name, route: f.file.routeTitle, ...liveWeeks(live.manifest), directions: f.file.reliability.directions, weeksComparable: f.file.reliability.weeksComparable, byPartOfDay: bands, ...(live.limits ? { limits: live.limits } : {}), definitions: LIVE_DEFINITIONS, source: LIVE_SOURCE };
  },
  route_bunching: async ({ agency: q, route, period: p }) => {
    const band = liveBand(p);
    const a = await liveAgencyFor(q);
    const live = await liveAgency(a);
    if ('none' in live) return live.none;
    const f = await liveRoute(a, live.manifest, route, live.limits);
    if ('none' in f) return f.none;
    const bands = Object.fromEntries(Object.entries(f.file.bunching.bands).filter(([k]) => !band || k === band).map(([k, v]) => [bandLabel(k), v]));
    return { agency: a.name, route: f.file.routeTitle, ...liveWeeks(live.manifest), byPartOfDay: bands, ...(live.limits ? { limits: live.limits } : {}), definitions: LIVE_DEFINITIONS, source: LIVE_SOURCE, note: 'startShare is the share of bunched or gapped gaps where the route starts; formsAt is the stretch where it forms (pattern "forms") or rises most; risePoints is how many percentage points it rises across that stretch.' };
  },
  schedule_changes: async ({ agency: q, offset, limit }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const file = await data.scheduleComparison(a.slug);
    if (!file) return { agency: a.name, comparison: null, note: 'Atlas has not built a schedule comparison for this agency.' };
    const changes = data.frequencyChanges(file);
    const from = offset != null ? Math.max(0, Number(offset)) : 0, size = limit != null ? Math.max(1, Math.min(200, Number(limit))) : 40;
    const paired = data.pairedChanges(file);
    const date = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    return {
      compares: `${file.day ?? 'one day'} service on ${date(file.before.date)} (before) with ${date(file.after.date)} (after)`,
      agency: a.name, scheduleValidThrough: validThrough(a),
      routesAdded: paired.filter(c => !c.before).map(c => c.route), routesRemoved: paired.filter(c => !c.after).map(c => c.route),
      frequencyChanges: changes.slice(from, from + size).map(c => ({ route: c.route, name: c.name, period: `${c.period} (${c.hours})`, before: c.before == null ? 'no service' : `every ${c.before} min`, after: c.after == null ? 'no service' : `every ${c.after} min`, better: c.better, ...(c.publicChange ? {} : { sameOnTheMap: true }) })),
      frequencyChangeCount: changes.length, shown: `${from + 1}–${Math.min(from + size, changes.length)}`,
      ...(from + size < changes.length ? { more: `Call again with offset ${from + size} for the next ${Math.min(size, changes.length - from - size)}.` } : {}),
    };
  },
};
