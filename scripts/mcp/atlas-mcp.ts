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
import { PUBLIC_TIER_MAXES } from '../../shared/frequencyRules';

// Anything an imported module prints must not reach stdout, which is the protocol channel.
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');

const PERIODS = PERIOD_KEYS.map(k => PERIOD_LABELS[k]);
const day = { type: 'string', enum: [...DAY_TYPES], description: 'Day type; Weekday when left out.' };
const agency = { type: 'string', description: 'Agency name or short name, e.g. "TTC" or "Toronto Transit Commission".' };
const period = { type: 'string', enum: PERIODS, description: `Part of the day: ${PERIOD_KEYS.map(k => `${PERIOD_LABELS[k]} ${formatPeriodRange(k)}`).join(', ')}.` };
const every = { type: 'number', description: `Minutes: routes that run this often or better. Atlas's map uses ${PUBLIC_TIER_MAXES.join(', ')}.` };
const fromTime = { type: 'string', description: 'Optional start of a time window, such as "10:00" or "10 AM".' };
const toTime = { type: 'string', description: 'Optional end of the time window, such as "18:00" or "6 PM".' };
const stop = (which: string) => ({ type: 'string', description: `${which} stop or station name, e.g. "Dufferin Station".` });

const WAIT = 'waitMinutes is the typical wait on the route\'s least frequent part (its slowest branch or direction), the number Atlas colours and filters the route by; "shown" is what the route list says, with a range where parts of the route differ.';
const TOOLS = [
  { name: 'list_agencies', description: 'Find transit agencies Atlas covers, by name, city or region. Without a search it returns only the count.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Name, city or region to search for.' } } } },
  { name: 'route_frequency', description: `How often a route runs in each part of the day on a day type, with its first and last trips. ${WAIT} With a time window it also gives the frequency hour by hour.`, inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'route'] } },
  { name: 'routes_at_frequency', description: `Routes in an agency that run every N minutes or better in a part of the day (by waitMinutes: ${WAIT})`, inputSchema: { type: 'object', properties: { agency, period, every, day }, required: ['agency', 'period', 'every'] } },
  { name: 'compare_agencies', description: 'For several agencies, how many routes run every N minutes or better in a part of the day.', inputSchema: { type: 'object', properties: { agencies: { type: 'array', items: { type: 'string' } }, period, every, day }, required: ['agencies', 'period', 'every'] } },
  { name: 'trip_time', description: 'Scheduled trip time from one stop to another, by hour the trip leaves, for each route that runs between them (or the routes named). Use it to compare routes, such as a local and an express, or to see whether the trip takes longer at some hours.', inputSchema: { type: 'object', properties: { agency, from_stop: stop('Starting'), to_stop: stop('Ending'), routes: { type: 'array', items: { type: 'string' }, description: 'Optional route numbers; every route between the stops when left out.' }, day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'combined_frequency', description: 'Every route that goes from one stop to another, and how often a rider leaving the first stop gets a trip on any of them combined, using the rule Atlas uses to combine trips at a stop (two trips a minute or less apart count as one; uneven combined service says so).', inputSchema: { type: 'object', properties: { agency, from_stop: stop('Starting'), to_stop: stop('Ending'), day, from_time: fromTime, to_time: toTime }, required: ['agency', 'from_stop', 'to_stop'] } },
  { name: 'schedule_changes', description: "What changed between an agency's two most recent schedules, where Atlas has built that comparison: routes added and removed, and frequency changes, biggest first. A frequency change counts when a route moves to a different step of Atlas's scale.", inputSchema: { type: 'object', properties: { agency }, required: ['agency'] } },
];

type Args = Record<string, unknown>;
const validThrough = (a: { lastFeedExpiry?: string | null }) => a.lastFeedExpiry ? `${a.lastFeedExpiry.slice(0, 4)}-${a.lastFeedExpiry.slice(4, 6)}-${a.lastFeedExpiry.slice(6, 8)}` : null;
const SOURCE = "Atlas's published schedule data for this agency.";

function needAgency(q: unknown) {
  const a = data.findAgency(String(q ?? ''));
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
  const start = data.parseClock(args.from_time ?? '0:00'), end = data.parseClock(args.to_time ?? '24:00');
  if (start == null || end == null || end <= start) throw new Error('Give the window as from_time and to_time, such as "10:00" and "18:00".');
  return { start, end, label: `${clockTime(start)}–${clockTime(end)}`, periods: data.periodsIn(start, end) };
}
const windowNote = (w: { label: string; periods: string[] }) => `The window ${w.label} overlaps these Atlas periods: ${w.periods.join(', ')}. Hourly figures are the typical wait in trips leaving that hour.`;

const handlers: Record<string, (args: Args) => unknown> = {
  list_agencies: ({ query }) => {
    const q = String(query ?? '').trim().toLowerCase();
    const all = data.availableAgencies();
    if (!q) return { agencies: all.length, note: 'Search by name, city or region to list them.' };
    return all.filter(a => [a.slug, a.name, a.region ?? '', ...(a.cities ?? [])].some(s => s.toLowerCase().includes(q)))
      .slice(0, 25).map(a => ({ name: a.name, region: a.region ?? null, scheduleValidThrough: validThrough(a) }));
  },
  route_frequency: (args) => {
    const a = needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const r = data.findRoute(data.routesOn(a, dayType), String(args.route ?? ''));
    if (!r) throw new Error(`${a.name} has no route matching "${args.route}" on ${dayType}.`);
    const w = window(args);
    return {
      agency: a.name, route: r.name, name: r.longName, mode: r.mode, day: dayType,
      periods: PERIOD_KEYS.map(p => data.periodFigure(r, p)),
      service: data.serviceSpan(r),
      ...(w ? { window: w.label, hourly: data.hourlyFrequency(r, w.start, w.end), windowNote: windowNote(w) } : {}),
      scheduleValidThrough: validThrough(a), source: SOURCE,
    };
  },
  routes_at_frequency: ({ agency: q, period: p, every: n, day: d }) => {
    const a = needAgency(q);
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const res = data.routesMeeting(a, dayType, key, minutes);
    return { agency: a.name, day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, meeting: res.meeting.map(m => ({ route: m.route, name: m.longName, mode: m.mode, shown: m.shown, waitMinutes: m.waitMinutes })), scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  compare_agencies: ({ agencies, period: p, every: n, day: d }) => {
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const rows = (Array.isArray(agencies) ? agencies : []).map(q => {
      const a = needAgency(q);
      const res = data.routesMeeting(a, dayType, key, minutes);
      return { agency: a.name, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, routesMeeting: res.meeting.length, scheduleValidThrough: validThrough(a) };
    });
    return { day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, agencies: rows, source: SOURCE };
  },
  trip_time: async (args) => {
    const a = needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const w = window(args);
    const t = await data.tripTimes(a.slug, String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType, Array.isArray(args.routes) ? args.routes.map(String) : []);
    const routes = [...t.byRoute.entries()].map(([route, runs]) => {
      const inWindow = w ? runs.filter(x => x.start >= w.start && x.start < w.end) : runs;
      const s = data.runningTimeSummary(inWindow);
      const mins = inWindow.map(x => x.minutes).sort((x, y) => x - y);
      return {
        route, trips: inWindow.length,
        typicalMinutes: mins.length ? mins[Math.floor(mins.length / 2)] : null,
        shortest: mins[0] ?? null, longest: mins[mins.length - 1] ?? null,
        byHour: s ? Object.entries(s.byHour).map(([h, m]) => ({ leaving: hourRange(+h, +h + 1), minutes: m })) : [],
      };
    }).sort((x, y) => (x.typicalMinutes ?? 1e9) - (y.typicalMinutes ?? 1e9));
    return {
      agency: a.name, from: t.from, to: t.to, day: dayType, scheduleRead: t.readOn, ...(w ? { window: w.label, windowNote: windowNote(w) } : {}),
      routes, note: 'Scheduled minutes from leaving the first stop to arriving at the second; an hour needs at least two trips.', source: "The agency's own schedule file that Atlas processed.",
    };
  },
  combined_frequency: async (args) => {
    const a = needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const w = window(args);
    const c = await data.combinedDepartures(a.slug, String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType);
    const windows = w ? [{ name: w.label, start: w.start, end: w.end }] : PERIOD_KEYS.map(k => ({ name: `${PERIOD_LABELS[k]} (${formatPeriodRange(k)})`, start: PERIOD_MINUTES[k].start, end: PERIOD_MINUTES[k].end }));
    const all = [...c.byRoute.values()].flat().map(x => x.start);
    return {
      agency: a.name, from: c.from, to: c.to, day: dayType, scheduleRead: c.readOn,
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
  schedule_changes: ({ agency: q }) => {
    const a = data.findAgency(String(q ?? ''), data.publicAgencies().map(x => ({ ...x, file: '' })));
    if (!a) throw new Error(`No agency matches "${q}".`);
    const file = data.scheduleComparison(a.slug);
    if (!file) return { agency: a.name, comparison: null, note: 'Atlas has not built a schedule comparison for this agency.' };
    const changes = data.frequencyChanges(file);
    return {
      agency: a.name, day: file.day, before: file.before.date, after: file.after.date,
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
  if (method === 'initialize') reply(id, { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atlas-studio', title: 'Atlas Studio', version: '0.2.0' } });
  else if (method === 'ping') reply(id, {});
  else if (method === 'tools/list') reply(id, { tools: TOOLS });
  else if (method === 'tools/call') {
    const handler = handlers[params?.name ?? ''];
    if (!handler) { fail(id, -32602, `Unknown tool ${params?.name}`); continue; }
    try { reply(id, { content: [{ type: 'text', text: JSON.stringify(await handler(params?.arguments ?? {}), null, 1) }] }); }
    catch (e) { reply(id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }); }
  } else fail(id, -32601, `Method not found: ${method}`);
}
