/**
 * The Atlas Studio MCP's tool definitions (CIV-1864): each tool's input schema, title and annotations, the server version
 * and the instructions every assistant gets. Both servers list these; the handlers are in tools.ts, liveTools.ts and localTools.ts.
 */
import { PERIOD_KEYS, PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { DAY_TYPES } from '../../shared/rules/days';
import { RELIABILITY_BANDS } from '../../shared/liveReliability';
import { CUTOFF_LIMITS, DEFAULT_CUTOFFS } from '../../shared/liveCutoffs';
import { PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';
import { NEARBY_ROUTES_RADIUS_M } from '../../shared/rules/limits';

export const PERIODS = PERIOD_KEYS.map(k => PERIOD_LABELS[k]);
const day = { type: 'string', enum: [...DAY_TYPES], description: 'Day type; Weekday when left out.' };
const agency = { type: 'string', description: 'Agency name or short name, e.g. "TTC" or "Toronto Transit Commission".' };
const alsoAgencies = { type: 'array', items: { type: 'string' }, description: 'Optional other agencies serving the same trip, counted together (e.g. LA Metro with Big Blue Bus between downtown LA and Santa Monica). Use list_agencies near a place to find them.' };
const period = { type: 'string', enum: PERIODS, description: `Part of the day: ${PERIOD_KEYS.map(k => `${PERIOD_LABELS[k]} ${formatPeriodRange(k)}`).join(', ')}.` };
const livePeriod = { type: 'string', enum: ['All day', ...RELIABILITY_BANDS.filter(b => b !== 'all').map(b => PERIOD_LABELS[b])], description: 'Optional part of the day; every part when left out.' };
/** A planner's own cut-offs (CIV-1869): the standard figures stay, and the answer adds each figure at the cut-off asked for. */
const cutoffArg = (k: keyof typeof CUTOFF_LIMITS, what: string) => ({ type: 'number',
  description: `Optional, only when the person sets their own cut-off: ${what} (standard ${DEFAULT_CUTOFFS[k]}; ${CUTOFF_LIMITS[k].min} to ${CUTOFF_LIMITS[k].max} in steps of ${CUTOFF_LIMITS[k].step}).` });
const LATE_AFTER = cutoffArg('lateAfterMin', 'count a departure late when it is more than this many minutes after the scheduled time');
const EARLY_BEFORE = cutoffArg('earlyBeforeMin', 'count a departure early when it is this many minutes or more before the scheduled time');
const BUNCHED_WITHIN = cutoffArg('bunchedWithinMin', 'count a gap as bunched when it is under this many minutes');
const GAPPED_FACTOR_ARG = cutoffArg('gappedFactor', 'count a gap as gapped when it is more than this many times the scheduled gap');
const every = { type: 'number', description: `Minutes: routes that run this often or better. Atlas's map uses ${PUBLIC_TIER_MAXES.join(', ')}.` };
const fromTime = { type: 'string', description: 'Optional start of a time window, such as "10:00" or "10 AM".' };
const toTime = { type: 'string', description: 'Optional end of the time window, such as "18:00" or "6 PM".' };
const stop = (which: string) => ({ type: 'string', description: `${which} stop or station name, e.g. "Dufferin Station".` });

const WAIT = 'waitMinutes is the typical wait on the route\'s slower direction: its main stretch plus its steady branches, the number Atlas colours and filters the route by. A branch end that runs unevenly shows only in "shown", the route list\'s own words, with a range where parts of the route differ.';
const TOOL_LIST = [
  { name: 'list_agencies', description: 'Find transit agencies Atlas covers, filtered by name or city, region (state or province) and country, or near a place (another agency or a city, within 60 km by default). Returns at most 40 compact rows; with no filter, only the count.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Name or city to search for.' }, region: { type: 'string', description: 'State or province, e.g. "Ontario", "Ohio".' }, country: { type: 'string', description: 'Country, e.g. "Canada", "United States".' }, near: { type: 'string', description: 'An agency or city: agencies whose area centre is within km of it.' }, km: { type: 'number', description: 'Distance for near; 60 when left out.' } } } },
  { name: 'rank_agencies', description: `Rank agencies by how many of their routes run every N minutes or better in a part of the day (by waitMinutes). Filter by country, region, kind (bus: no rail routes and not ferries only; rail: has rail routes; ferry: every route is a ferry) and size: weekday route count between min_routes and max_routes, or similar_to an agency (half to double its weekday routes, and the same kind). An agency split across feeds (MTA New York) ranks as one, a route in two of its feeds counted once; include_parts lists its feeds on their own instead. Returns each agency's routes on the day, routes meeting the bar, and the list of those routes. ${WAIT}`, inputSchema: { type: 'object', properties: { period, every, day, country: { type: 'string' }, region: { type: 'string' }, similar_to: { type: 'string', description: 'An agency to find peers of: half to double its weekday route count, the same kind (bus only, or with rail).' }, kind: { type: 'string', enum: ['bus', 'rail', 'ferry'], description: 'bus: agencies with no rail routes (and not ferries only); rail: agencies with rail routes; ferry: agencies whose routes are all ferries.' }, include_parts: { type: 'boolean', description: 'List each feed of an agency split across feeds (such as one MTA borough) on its own instead of the agency as one.' }, min_routes: { type: 'number' }, max_routes: { type: 'number' }, limit: { type: 'number', description: 'How many agencies to return; 15 when left out.' } }, required: ['period', 'every'] } },
  { name: 'route_frequency', description: `How often a route runs in each part of the day on a day type, with its first and last trips and its branches (where each goes, first and last stop, trips). ${WAIT} With a time window it also gives the frequency hour by hour. It reads today's schedule only: for how a route ran in past years (a frequency in 2017, a cut since), use route_history.`, inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'route'] } },
  { name: 'routes_at_frequency', description: `Routes in an agency that run every N minutes or better in a part of the day (by waitMinutes: ${WAIT})`, inputSchema: { type: 'object', properties: { agency, period, every, day }, required: ['agency', 'period', 'every'] } },
  { name: 'compare_agencies', description: 'For several agencies, how many routes run every N minutes or better in a part of the day. An agency split across feeds (MTA New York) counts as one, a route in two of its feeds once.', inputSchema: { type: 'object', properties: { agencies: { type: 'array', items: { type: 'string' } }, period, every, day }, required: ['agencies', 'period', 'every'] } },
  { name: 'routes_near', description: `Routes that stop near a place: a corner ("Bathurst and Bloor"), a station or a stop name, within ${NEARBY_ROUTES_RADIUS_M} m by default, with the stops each uses there and the weekday first and last trips of each route (a route that runs only at night is marked nightRoute). Then use route_frequency for how often they run.`, inputSchema: { type: 'object', properties: { agency, place: { type: 'string', description: 'Corner, station or stop name, e.g. "Bathurst and Bloor".' }, metres: { type: 'number' } }, required: ['agency', 'place'] } },
  { name: 'route_history', description: "How a route's frequency has changed over the years, from Atlas's History: each schedule Atlas has kept for it, oldest first, with how often it ran in each part of the day. Coverage depends on the agency; the answer says when Atlas has none.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day }, required: ['agency', 'route'] } },
  { name: 'buses_needed', description: "Buses needed to run a route in a part of the day, from Atlas Studio's buses-needed file for the agency (the same figures Studio's page shows): buses scheduled now, buses needed at the schedule's own frequency, and buses needed every 10, 15, 20, 30 or 60 minutes. Routes that share buses are counted together. Counts use the schedule's own layover. Only agencies whose file has been built have an answer; for others it says so.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string' }, period, every: { type: 'number', description: 'Optional target minutes between buses: 10, 15, 20, 30 or 60.' } }, required: ['agency', 'route', 'period'] } },
  { name: 'routes_by_hours', description: "Routes whose service ends early or starts late on a day type: every route whose last trip leaves before ends_before, or whose first trip leaves after starts_after, with its first and last trips. For questions such as which routes stop before 10 PM on Sundays.", inputSchema: { type: 'object', properties: { agency, day, ends_before: { type: 'string', description: 'Clock time, e.g. "22:00" or "10 PM".' }, starts_after: { type: 'string', description: 'Clock time, e.g. "07:00".' } }, required: ['agency'] } },
  { name: 'trip_time', description: 'Scheduled trip time from one stop to another, by hour the trip leaves, for each route that runs between them (or the routes named). Use it to compare routes, such as a local and an express, or to see whether the trip takes longer at some hours.', inputSchema: { type: 'object', properties: { agency, also_agencies: alsoAgencies, from_stop: stop('Starting'), to_stop: stop('Ending'), routes: { type: 'array', items: { type: 'string' }, description: 'Optional route numbers; every route between the stops when left out.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'combined_frequency', description: 'Every route that goes from one stop to another, and how often a rider leaving the first stop gets a trip on any of them combined, using the rule Atlas uses to combine trips at a stop (two trips a minute or less apart count as one; uneven combined service says so).', inputSchema: { type: 'object', properties: { agency, also_agencies: alsoAgencies, from_stop: stop('Starting'), to_stop: stop('Ending'), day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'route_reliability', description: "How a route actually ran against its schedule, from Atlas Live's recordings of where vehicles were (past service; Atlas has no figures yet for how a route is running right now): the share of departures that were late, typical trip time against the timetable's, the share of scheduled trips that ran, this week against last week, and the stops most often late, for the whole day and each part of the day. Leave out route to rank the agency's recorded routes by how often they were late. Atlas records only some agencies (the answer says which routes it has).", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name; leave out to rank the recorded routes.' }, period: livePeriod, late_after_min: LATE_AFTER, early_before_min: EARLY_BEFORE }, required: ['agency'] } },
  { name: 'route_bunching', description: "How evenly a route's vehicles were spaced, from Atlas Live's recordings (past service): the share of gaps between vehicles that were bunched (too close) or gapped (far longer than scheduled), this week against last week, where along the route bunching forms, and the stops where the spacing goes most wrong, by direction and part of the day.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, period: livePeriod, bunched_within_min: BUNCHED_WITHIN, gapped_factor: GAPPED_FACTOR_ARG }, required: ['agency', 'route'] } },
  { name: 'route_now', description: "How a route is running right now, from Atlas Live's last half hour of vehicle readings (one a minute): where vehicles are bunched now, where riders have waited longest since the last vehicle against that stop's scheduled gap, stops no vehicle passed at all, vehicles moving and standing, and the half hour's bunched and gapped shares, by direction. Every answer gives the time of the reading. Atlas records only some agencies; when it has no current reading it says so.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, bunched_within_min: BUNCHED_WITHIN, gapped_factor: GAPPED_FACTOR_ARG }, required: ['agency', 'route'] } },
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
  route_reliability: 'How a route ran against its schedule', route_bunching: 'How evenly vehicles were spaced', route_now: 'How a route is running right now',
};
/** Every tool only reads Atlas's own published data: nothing is changed, and nothing outside Atlas is reached. */
const annotations = (name: string) => ({ title: TITLES[name] ?? name, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
export const TOOLS = TOOL_LIST.map(t => ({ ...t, title: TITLES[t.name] ?? t.name, annotations: annotations(t.name), inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, question: QUESTION } } }));

/** The server's version: bump when a tool's answers change (the TEST-LOG version rule). */
export const SERVER_VERSION = '0.13.2';

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
  // CIV-1860, Ryan: "'where is my streetcar right now' is a rider question not a transit planner question".
  // CIV-1870, Ryan: "being able to ask about bunching for example, or gaps in service on a specific route" right now.
  "route_reliability and route_bunching are past service. For gaps and bunching on a route right now, use route_now where the server has it, and give the time of its reading; when it has no current reading, say so and offer the latest recorded week. Atlas doesn't look up where a single vehicle is.",
].join(' ');
