/**
 * CIV-1650: a private, local, read-only MCP server for Atlas (Ryan's "1", 2026-11-17). It runs on this Mac over stdio
 * and answers planner questions from Atlas's processed per-agency route files (scripts/mcp/atlasData.ts), with the
 * map's own numbers. Nothing is fetched, uploaded or written; it is not deployed anywhere.
 *
 * Setup for Claude Code and Claude Desktop: scripts/mcp/README.md.
 *
 * Speaks MCP's stdio transport directly (newline-delimited JSON-RPC 2.0: initialize, tools/list, tools/call, ping),
 * so it adds no dependency. Logs go to stderr; stdout carries only protocol messages.
 */
import { createInterface } from 'node:readline';
import { PERIOD_KEYS, PERIOD_LABELS, PERIOD_MINUTES, formatPeriodRange } from '../../shared/config';
import { clockTime, hourRange } from '../../shared/timeText';
import { DAY_TYPES } from '../../shared/rules/days';
import { countryForRegion } from '../../shared/regionCountry';
import type { IndexedAgency } from './atlasData';
import { PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';
import { STUDIO_TARGETS } from '../../shared/studioVehicles';

// Anything an imported module prints must not reach stdout, which is the protocol channel.
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');
// The parts that read files on this Mac (trip times, buses needed) stay out of the pure tool code (CIV-1840).
const local = await import('./localData');
const { diskStore } = await import('./diskStore');
// ATLAS_MCP_STORE=split:<folder> reads the split release files in a folder (what the hosted server reads), else the files on this Mac.
const splitDir = process.env.ATLAS_MCP_STORE?.startsWith('split:') ? process.env.ATLAS_MCP_STORE.slice(6) : null;
if (splitDir) {
  const { splitStore } = await import('../../shared/mcpSplitStore');
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  data.useStore(splitStore(async path => { const f = join(splitDir, path); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; }));
} else data.useStore(diskStore());

const PERIODS = PERIOD_KEYS.map(k => PERIOD_LABELS[k]);
const day = { type: 'string', enum: [...DAY_TYPES], description: 'Day type; Weekday when left out.' };
const agency = { type: 'string', description: 'Agency name or short name, e.g. "TTC" or "Toronto Transit Commission".' };
const alsoAgencies = { type: 'array', items: { type: 'string' }, description: 'Optional other agencies serving the same trip, counted together (e.g. LA Metro with Big Blue Bus between downtown LA and Santa Monica). Use list_agencies near a place to find them.' };
const period = { type: 'string', enum: PERIODS, description: `Part of the day: ${PERIOD_KEYS.map(k => `${PERIOD_LABELS[k]} ${formatPeriodRange(k)}`).join(', ')}.` };
const every = { type: 'number', description: `Minutes: routes that run this often or better. Atlas's map uses ${PUBLIC_TIER_MAXES.join(', ')}.` };
const fromTime = { type: 'string', description: 'Optional start of a time window, such as "10:00" or "10 AM".' };
const toTime = { type: 'string', description: 'Optional end of the time window, such as "18:00" or "6 PM".' };
const stop = (which: string) => ({ type: 'string', description: `${which} stop or station name, e.g. "Dufferin Station".` });

const WAIT = 'waitMinutes is the typical wait on the route\'s least frequent part (its slowest branch or direction), the number Atlas colours and filters the route by; "shown" is what the route list says, with a range where parts of the route differ.';
const TOOLS = [
  { name: 'list_agencies', description: 'Find transit agencies Atlas covers, filtered by name or city, region (state or province) and country, or near a place (another agency or a city, within 60 km by default). Returns at most 40 compact rows; with no filter, only the count.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Name or city to search for.' }, region: { type: 'string', description: 'State or province, e.g. "Ontario", "Ohio".' }, country: { type: 'string', description: 'Country, e.g. "Canada", "United States".' }, near: { type: 'string', description: 'An agency or city: agencies whose area centre is within km of it.' }, km: { type: 'number', description: 'Distance for near; 60 when left out.' } } } },
  { name: 'rank_agencies', description: `Rank agencies by how many of their routes run every N minutes or better in a part of the day (by waitMinutes). Filter by country, region, kind (bus: no rail routes; rail: has rail routes) and size: weekday route count between min_routes and max_routes, or similar_to an agency (half to double its weekday routes, and the same kind). Agencies that are part of a larger operator are flagged and, with similar_to, left out unless include_parts is true. Returns each agency's routes on the day, routes meeting the bar, and the list of those routes. ${WAIT}`, inputSchema: { type: 'object', properties: { period, every, day, country: { type: 'string' }, region: { type: 'string' }, similar_to: { type: 'string', description: 'An agency to find peers of: half to double its weekday route count, the same kind (bus only, or with rail), not part of a larger operator.' }, kind: { type: 'string', enum: ['bus', 'rail'], description: 'bus: agencies with no rail routes; rail: agencies with rail routes.' }, include_parts: { type: 'boolean', description: 'Keep agencies that are part of a larger operator (such as one MTA borough) when using similar_to.' }, min_routes: { type: 'number' }, max_routes: { type: 'number' }, limit: { type: 'number', description: 'How many agencies to return; 15 when left out.' } }, required: ['period', 'every'] } },
  { name: 'route_frequency', description: `How often a route runs in each part of the day on a day type, with its first and last trips and its branches (where each goes, first and last stop, trips). ${WAIT} With a time window it also gives the frequency hour by hour.`, inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'route'] } },
  { name: 'routes_at_frequency', description: `Routes in an agency that run every N minutes or better in a part of the day (by waitMinutes: ${WAIT})`, inputSchema: { type: 'object', properties: { agency, period, every, day }, required: ['agency', 'period', 'every'] } },
  { name: 'compare_agencies', description: 'For several agencies, how many routes run every N minutes or better in a part of the day.', inputSchema: { type: 'object', properties: { agencies: { type: 'array', items: { type: 'string' } }, period, every, day }, required: ['agencies', 'period', 'every'] } },
  { name: 'routes_near', description: 'Routes that stop near a place: a corner ("Bathurst and Bloor"), a station or a stop name, within 250 m by default, with the stops each uses there. Then use route_frequency for how often they run.', inputSchema: { type: 'object', properties: { agency, place: { type: 'string', description: 'Corner, station or stop name, e.g. "Bathurst and Bloor".' }, metres: { type: 'number' } }, required: ['agency', 'place'] } },
  { name: 'route_history', description: "How a route's frequency has changed over the years, from Atlas's History: each schedule Atlas has kept for it, oldest first, with how often it ran in each part of the day. Coverage depends on the agency; the answer says when Atlas has none.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day }, required: ['agency', 'route'] } },
  { name: 'buses_needed', description: "Buses needed to run a route in a part of the day, from Atlas Studio's buses-needed file for the agency (the same figures Studio's page shows): buses scheduled now, buses needed at the schedule's own frequency, and buses needed every 10, 15, 20, 30 or 60 minutes. Routes that share buses are counted together. Counts use the schedule's own layover. Only agencies whose file has been built have an answer; for others it says so.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string' }, period, every: { type: 'number', description: 'Optional target minutes between buses: 10, 15, 20, 30 or 60.' } }, required: ['agency', 'route', 'period'] } },
  { name: 'routes_by_hours', description: "Routes whose service ends early or starts late on a day type: every route whose last trip leaves before ends_before, or whose first trip leaves after starts_after, with its first and last trips. For questions such as which routes stop before 10 PM on Sundays.", inputSchema: { type: 'object', properties: { agency, day, ends_before: { type: 'string', description: 'Clock time, e.g. "22:00" or "10 PM".' }, starts_after: { type: 'string', description: 'Clock time, e.g. "07:00".' } }, required: ['agency'] } },
  { name: 'trip_time', description: 'Scheduled trip time from one stop to another, by hour the trip leaves, for each route that runs between them (or the routes named). Use it to compare routes, such as a local and an express, or to see whether the trip takes longer at some hours.', inputSchema: { type: 'object', properties: { agency, also_agencies: alsoAgencies, from_stop: stop('Starting'), to_stop: stop('Ending'), routes: { type: 'array', items: { type: 'string' }, description: 'Optional route numbers; every route between the stops when left out.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'combined_frequency', description: 'Every route that goes from one stop to another, and how often a rider leaving the first stop gets a trip on any of them combined, using the rule Atlas uses to combine trips at a stop (two trips a minute or less apart count as one; uneven combined service says so).', inputSchema: { type: 'object', properties: { agency, also_agencies: alsoAgencies, from_stop: stop('Starting'), to_stop: stop('Ending'), day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'schedule_changes', description: "What changed between an agency's two most recent schedules, where Atlas has built that comparison: routes added and removed, and frequency changes, biggest first. A frequency change counts when a route moves to a different step of Atlas's scale.", inputSchema: { type: 'object', properties: { agency }, required: ['agency'] } },
];

type Args = Record<string, unknown>;
const validThrough = (a: { lastFeedExpiry?: string | null }) => a.lastFeedExpiry ? `${a.lastFeedExpiry.slice(0, 4)}-${a.lastFeedExpiry.slice(4, 6)}-${a.lastFeedExpiry.slice(6, 8)}` : null;
const SOURCE = "Atlas's published schedule data for this agency.";

async function needAgency(q: unknown) {
  const a = await data.findAgency(String(q ?? ''));
  if (!a) throw new Error(`No agency matching "${q}" has data here. Use list_agencies to search.`);
  return a;
}
function needPeriod(p: unknown) {
  const k = data.parsePeriod(p);
  if (!k) throw new Error(`Unknown period "${p}". Use one of: ${PERIODS.join(', ')}.`);
  return k;
}
/** A time window from from_time/to_time, or null when neither is given. */
function window(args: Args): { start: number; end: number; label: string; periods: string[] } | null {
  if (args.from_time == null && args.to_time == null) return null;
  const start = data.parseClock(args.from_time ?? '0:00'), clockEnd = data.parseClock(args.to_time ?? '24:00');
  // A window that ends earlier on the clock runs past midnight (10 PM to 4 AM), read as the schedule writes it (to 28:00).
  const end = clockEnd != null && start != null && clockEnd <= start && clockEnd + 1440 - start <= 1440 ? clockEnd + 1440 : clockEnd;
  if (start == null || end == null || end <= start) throw new Error('Give the window as from_time and to_time, such as "10:00" and "18:00", or "22:00" and "04:00" past midnight.');
  return { start, end, label: `${clockTime(start)}–${clockTime(end)}`, periods: data.periodsIn(start, end) };
}
/** The asked agency plus any also_agencies, each once. */
async function withAlso(a: Awaited<ReturnType<typeof needAgency>>, args: Args) {
  const more = await Promise.all((Array.isArray(args.also_agencies) ? args.also_agencies : []).map(q => needAgency(q)));
  return [a, ...more].filter((x, i, all) => all.findIndex(y => y.slug === x.slug) === i);
}
/** Trip times read the schedule file on this Mac, which can be older than the schedule behind the map's figures: say so first. */
const staleNote = (a: { lastFeedExpiry?: string | null }, ends: string | null) => (ends && a.lastFeedExpiry && ends < a.lastFeedExpiry
  ? { scheduleWarning: `These trip times come from an older schedule file on this Mac (service to ${ends.slice(0, 4)}-${ends.slice(4, 6)}-${ends.slice(6, 8)}); the map's figures use the current one (to ${validThrough(a)}). Times may have changed since.` }
  : {});
const windowNote = (w: { label: string; periods: string[] }) => `The window ${w.label} overlaps these Atlas periods: ${w.periods.join(', ')}. Hourly figures are the typical wait in trips leaving that hour.`;

/**
 * How to answer with these tools, sent to every assistant at the start (MCP initialize instructions). Gemini's run of
 * the final round (2026-11-17) gave reasons and figures from memory as if they were Atlas's, and tried the shell when a
 * tool had no answer.
 */
const INSTRUCTIONS = [
  "Atlas Studio answers from Atlas's published schedules. Give the figures its tools return, with the hours and the schedule's end date.",
  "Anything not from these tools (ridership, crowding, causes of a change, holiday plans, history before Atlas's data) is outside Atlas: leave it out, or say plainly where it comes from.",
  "When a tool says Atlas has no figure, say so; don't work one out or estimate it unless the person asks for an estimate, and then call it yours.",
  "Don't run shell commands or read files to get around a missing tool.",
].join(' ');

const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
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
    return { matches: hits.length, agencies: hits.slice(0, 40).map(a => [a.name, a.region ?? '', validThrough(a) ?? ''].join(' | ')), columns: 'name | region | schedule valid through', ...(hits.length > 40 ? { note: 'First 40 shown; narrow the filter for the rest.' } : {}) };
  },
  rank_agencies: async (args) => {
    const idx = await data.agencyIndex();
    if (!idx) throw new Error('The agency index has not been built for the current data. Run: nice -n 15 npx tsx scripts/mcp/buildIndex.ts');
    const dayType = data.parseDay(args.day), key = needPeriod(args.period), minutes = Number(args.every);
    const weekdayRoutes = (a: IndexedAgency) => a.days.Weekday?.length ?? 0;
    let lo = args.min_routes != null ? Number(args.min_routes) : 0, hi = args.max_routes != null ? Number(args.max_routes) : Infinity;
    let like: string | null = null;
    let kind = args.kind === 'bus' || args.kind === 'rail' ? args.kind : null;
    let skipParts = false;
    const kindOf = (a: IndexedAgency) => (a.railRoutes > 0 ? 'rail' : 'bus');
    if (args.similar_to != null) {
      const a = await needAgency(args.similar_to);
      const self = idx.find(x => x.slug === a.slug);
      if (!self) throw new Error(`${a.name} is not in the index.`);
      kind ??= kindOf(self);
      skipParts = args.include_parts !== true;
      like = `${a.name}: ${weekdayRoutes(self)} weekday routes, ${kindOf(self) === 'bus' ? 'buses only' : 'with rail'}`;
      lo = Math.ceil(weekdayRoutes(self) / 2); hi = weekdayRoutes(self) * 2;
    }
    const reg = String(args.region ?? '').trim().toLowerCase(), ctry = String(args.country ?? '').trim();
    const pool = idx.filter(a => (!reg || (a.region ?? '').toLowerCase() === reg) && (!ctry || data.sameCountry(a.country, ctry)) && weekdayRoutes(a) >= lo && weekdayRoutes(a) <= hi
      && (!kind || kindOf(a) === kind) && !(skipParts && a.partOf));
    const rows = pool.map(a => {
      const routes = a.days[dayType] ?? [];
      const meeting = routes.filter(r => r.wait[key] != null && r.wait[key]! <= minutes).sort((x, y) => x.wait[key]! - y.wait[key]!);
      return { agency: a.name, region: a.region, ...(a.partOf ? { partOf: a.partOf } : {}), kind: kindOf(a) === 'bus' ? 'buses only' : 'with rail', weekdayRoutes: weekdayRoutes(a), routesOnDay: routes.length, routesMeeting: meeting.length, routes: meeting.map(r => `${r.route}${r.name ? ` ${r.name}` : ''} (every ${r.wait[key]})`) };
    }).sort((x, y) => y.routesMeeting - x.routesMeeting || x.agency.localeCompare(y.agency));
    const limit = args.limit != null ? Number(args.limit) : 15;
    return {
      day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes,
      ...(like ? { peersOf: like } : {}), ...(kind ? { kind: kind === 'bus' ? 'buses only' : 'with rail' } : {}), ...(skipParts ? { leftOut: 'agencies that are part of a larger operator' } : {}), sizeRange: `${lo}–${hi === Infinity ? 'any' : hi} weekday routes`,
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
      ...(() => { const same = sameRoutes; return same.length ? { sameNameRoutes: same, sameNameNote: `Other ${a.name} routes with the same name, often a night or express version on the same street. A rider on this street can use them too; combined_frequency between two stops counts them together.` } : {}; })(),
      ...(w ? { window: w.label, hourly: data.hourlyFrequency(r, w.start, w.end), windowNote: windowNote(w) } : {}),
      scheduleValidThrough: validThrough(a), source: SOURCE,
    };
  },
  routes_at_frequency: async ({ agency: q, period: p, every: n, day: d }) => {
    const a = await needAgency(q);
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const res = await data.routesMeeting(a, dayType, key, minutes);
    return { agency: a.name, day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, meeting: res.meeting.map(m => ({ route: m.route, name: m.longName, mode: m.mode, shown: m.shown, waitMinutes: m.waitMinutes })), scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  compare_agencies: async ({ agencies, period: p, every: n, day: d }) => {
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const rows = await Promise.all((Array.isArray(agencies) ? agencies : []).map(async q => {
      const a = await needAgency(q);
      const res = await data.routesMeeting(a, dayType, key, minutes);
      return { agency: a.name, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, routesMeeting: res.meeting.length, scheduleValidThrough: validThrough(a) };
    }));
    return { day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, agencies: rows, source: SOURCE };
  },
  routes_near: async ({ agency: q, place, metres }) => {
    const a = await needAgency(q);
    const res = await data.routesNear(a, String(place ?? ''), metres != null ? Number(metres) : 250);
    if (!res.matchedStops.length) return { agency: a.name, place, routes: [], note: 'No stop name matches every part of that place. Try a station or a street name as the stops are named.' };
    return { agency: a.name, place, ...res, source: SOURCE };
  },
  route_history: async ({ agency: q, route, day: d }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const dayType = data.parseDay(d);
    const h = await data.routeHistory(a.slug, String(route ?? ''), dayType);
    if (!h) return { agency: a.name, history: null, note: "Atlas's History has no data for this agency." };
    if (!h.route) return { agency: a.name, history: null, note: `Atlas's History has ${h.routes} routes for this agency, none matching "${route}".` };
    return { agency: a.name, day: dayType, ...h, note: 'Each schedule is one Atlas kept from that time; a part of the day with no figure is left out. Older schedules may lack weekend figures. Where a route starts or stops partway through a part of the day, Atlas counts the wait to the edge of that part, so a figure can be far longer than the gap between the trips that run (a route every 10 min until 1 AM shows every 61 min from 11 PM to 2 AM). That is the rule Atlas uses, not a data error.', source: "Atlas's History data." };
  },
  buses_needed: async (args) => {
    const a = await needAgency(args.agency);
    const key = needPeriod(args.period);
    const route = String(args.route ?? '');
    const every = args.every != null ? Number(args.every) : null;
    const res = local.busesNeeded(a.slug, route, key);
    const period = `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`;
    if (!res.cached) return { agency: a.name, route, period, answer: `Atlas Studio has no buses-needed figures for ${a.name} yet. They are worked out once per agency ahead of time, not while you wait. Don't estimate a number yourself.`, ...(res.command ? { toBuild: res.command } : {}) };
    if (!res.groups.length) return { agency: a.name, route, period, answer: `Route ${route} isn't in ${a.name}'s buses-needed figures for the ${PERIOD_LABELS[key].toLowerCase()}: it may not run then, or its number is written differently.` };
    const missing = every != null && !STUDIO_TARGETS.includes(every);
    const targets = every != null && !missing ? [every] : [...STUDIO_TARGETS];
    return {
      agency: a.name, route, period,
      ...(res.olderSchedule ? { note: `These figures come from an older schedule file (${res.feed}) than the newest one on this Mac.` } : {}),
      day: `A representative weekday in the week of ${res.referenceDate}.`,
      groups: res.groups.map(g => ({
        routesSharingBuses: g.routes,
        scheduledNow: g.scheduled,
        neededAtCurrentFrequency: g.implied,
        roundTripRunningMinutes: g.runningMin,
        roundTripLayoverMinutes: g.layoverMin,
        neededAt: Object.fromEntries(targets.filter(t => g.atTarget[t] != null).map(t => [`every ${t} min`, g.atTarget[t]])),
        ...(g.atTargetEven ? { neededAtWithBranchesEven: Object.fromEntries(targets.filter(t => g.atTargetEven![t] != null).map(t => [`every ${t} min`, g.atTargetEven![t]])) } : {}),
      })),
      targetsNote: `Atlas Studio works buses out only for every ${STUDIO_TARGETS.join(', ')} minutes. For any other frequency, say Atlas has no figure; don't work one out yourself.`,
      ...(missing ? { warning: `Atlas Studio works these out only for every ${STUDIO_TARGETS.join(', ')} minutes, not every ${every}. Give the nearest of those; don't work out ${every} yourself.` } : {}),
      howToRead: "'scheduledNow' is buses on these routes at the middle of the period; 'neededAtCurrentFrequency' is buses needed at each pattern's own frequency (running time plus layover, divided by the minutes between buses, rounded up once for the group). Where branches share a middle section, a target is for that middle, and its trips go to the branches in their current shares ('WithBranchesEven' splits them evenly). Trips to and from the garage are not in schedules and not counted.",
      source: "Atlas Studio's buses-needed file, worked out from the agency's own schedule.",
    };
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
  trip_time: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const w = window(args);
    const ags = await withAlso(a, args);
    const t = await local.tripTimes(ags.map(x => ({ slug: x.slug, label: local.agencyLabel(x.slug, x.name) })), String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType, Array.isArray(args.routes) ? args.routes.map(String) : []);
    const routes = [...t.byRoute.entries()].map(([route, runs]) => {
      const inWindow = w ? runs.filter(x => x.start >= w.start && x.start < w.end) : runs;
      const s = local.runningTimeSummary(inWindow);
      const mins = inWindow.map(x => x.minutes).sort((x, y) => x - y);
      return {
        route, trips: inWindow.length,
        typicalMinutes: mins.length ? mins[Math.floor(mins.length / 2)] : null,
        shortest: mins[0] ?? null, longest: mins[mins.length - 1] ?? null,
        byHour: s ? Object.entries(s.byHour).map(([h, m]) => ({ leaving: hourRange(+h, +h + 1), minutes: m })) : [],
      };
    }).sort((x, y) => (x.typicalMinutes ?? 1e9) - (y.typicalMinutes ?? 1e9));
    return {
      ...staleNote(a, t.scheduleEnds),
      agency: ags.map(x => local.agencyLabel(x.slug, x.name)).join(', '), from: t.from, to: t.to, day: dayType, scheduleRead: t.readOn, ...(w ? { window: w.label, windowNote: windowNote(w) } : {}),
      ...(t.noDirectTrip ? { answer: 'No scheduled trip goes from the first stop to the second without a transfer on these agencies. Atlas Studio counts direct trips only.' } : {}),
      routes, note: 'Scheduled minutes from leaving the first stop to arriving at the second; an hour needs at least two trips.', source: "The agency's own schedule file that Atlas processed.",
    };
  },
  combined_frequency: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const w = window(args);
    const ags = await withAlso(a, args);
    const c = await local.combinedDepartures(ags.map(x => ({ slug: x.slug, label: local.agencyLabel(x.slug, x.name) })), String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType);
    const windows = w ? [{ name: w.label, start: w.start, end: w.end }] : PERIOD_KEYS.map(k => ({ name: `${PERIOD_LABELS[k]} (${formatPeriodRange(k)})`, start: PERIOD_MINUTES[k].start, end: PERIOD_MINUTES[k].end }));
    const all = [...c.byRoute.values()].flat().map(x => x.start);
    return {
      ...staleNote(a, c.scheduleEnds),
      agency: ags.map(x => local.agencyLabel(x.slug, x.name)).join(', '), from: c.from, to: c.to, day: dayType, scheduleRead: c.readOn,
      ...(c.noDirectTrip ? { answer: 'No scheduled trip goes from the first stop to the second without a transfer on these agencies. Atlas Studio counts direct trips only.' } : {}),
      routes: [...c.byRoute.keys()],
      byWindow: windows.map(win => ({
        window: win.name,
        combined: c.reading(all, win.start, win.end),
        eachRoute: Object.fromEntries([...c.byRoute.entries()].map(([route, runs]) => [route, c.reading(runs.map(x => x.start), win.start, win.end)])),
      })).filter(x => x.combined.departures > 0),
      ...(w ? { windowNote: windowNote(w) } : {}),
      note: 'Departures from the first stop on trips that go on to the second.', source: "The agency's own schedule file that Atlas processed.",
    };
  },
  schedule_changes: async ({ agency: q }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const file = await data.scheduleComparison(a.slug);
    if (!file) return { agency: a.name, comparison: null, note: 'Atlas has not built a schedule comparison for this agency.' };
    const changes = data.frequencyChanges(file);
    const date = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    return {
      compares: `${file.day ?? 'one day'} service on ${date(file.before.date)} (before) with ${date(file.after.date)} (after)`,
      agency: a.name,
      routesAdded: file.changes.filter(c => !c.before).map(c => c.route), routesRemoved: file.changes.filter(c => !c.after).map(c => c.route),
      frequencyChanges: changes.slice(0, 40).map(c => ({ route: c.route, name: c.name, period: c.period, before: c.before == null ? 'no service' : `every ${c.before} min`, after: c.after == null ? 'no service' : `every ${c.after} min`, better: c.better, ...(c.publicChange ? {} : { sameOnTheMap: true }) })),
      frequencyChangeCount: changes.length,
    };
  },
};

function reply(id: unknown, result: unknown) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id: unknown, code: number, message: string) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Args; protocolVersion?: string } };
  try { msg = JSON.parse(line); } catch { fail(null, -32700, 'Parse error'); continue; }
  const { id, method, params } = msg;
  if (id === undefined) continue; // notifications (initialized, cancelled) need no answer
  if (method === 'initialize') reply(id, { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atlas-studio', title: 'Atlas Studio', version: '0.6.2' }, instructions: INSTRUCTIONS });
  else if (method === 'ping') reply(id, {});
  else if (method === 'tools/list') reply(id, { tools: TOOLS });
  else if (method === 'tools/call') {
    const handler = handlers[params?.name ?? ''];
    if (!handler) { fail(id, -32602, `Unknown tool ${params?.name}`); continue; }
    try { reply(id, { content: [{ type: 'text', text: JSON.stringify(await handler(params?.arguments ?? {}), null, 1) }] }); }
    catch (e) { reply(id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }); }
  } else fail(id, -32601, `Method not found: ${method}`);
}
