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
import { PERIOD_KEYS, PERIOD_LABELS } from '../../shared/config';
import { DAY_TYPES } from '../../shared/rules/days';
import { PUBLIC_TIER_MAXES } from '../../shared/frequencyRules';

// Anything an imported module prints must not reach stdout, which is the protocol channel.
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');

const PERIODS = PERIOD_KEYS.map(k => PERIOD_LABELS[k]);
const day = { type: 'string', enum: [...DAY_TYPES], description: 'Day type; Weekday when left out.' };
const agency = { type: 'string', description: 'Agency slug or name, e.g. "ttc" or "Toronto Transit Commission".' };
const period = { type: 'string', enum: PERIODS, description: 'Part of the day.' };
const every = { type: 'number', description: `Minutes: routes that run this often or better. The map's grades are ${PUBLIC_TIER_MAXES.join(', ')}.` };

const TOOLS = [
  { name: 'list_agencies', description: 'Transit agencies this Atlas server can answer for, with how current each schedule is.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Optional text to match in the name, region or cities.' } } } },
  { name: 'route_frequency', description: "How often a route runs in each part of the day on a day type, as Atlas's map shows it (naming a long gap where the route card does), with its first and last trips.", inputSchema: { type: 'object', properties: { agency, route: { type: 'string', description: 'Route number or name.' }, day }, required: ['agency', 'route'] } },
  { name: 'routes_at_frequency', description: 'Routes in an agency that run every N minutes or better in a part of the day.', inputSchema: { type: 'object', properties: { agency, period, every, day }, required: ['agency', 'period', 'every'] } },
  { name: 'compare_agencies', description: 'For several agencies, how many routes run every N minutes or better in a part of the day.', inputSchema: { type: 'object', properties: { agencies: { type: 'array', items: { type: 'string' } }, period, every, day }, required: ['agencies', 'period', 'every'] } },
  { name: 'schedule_changes', description: "What changed between an agency's two most recent schedules, where Atlas has built that comparison: frequency changes (a move to a different grade), biggest first.", inputSchema: { type: 'object', properties: { agency }, required: ['agency'] } },
];

type Args = Record<string, unknown>;
const freshness = (a: { lastFeedExpiry?: string | null; lastRefreshedAt?: string | null }) => ({
  scheduleValidThrough: a.lastFeedExpiry ? `${a.lastFeedExpiry.slice(0, 4)}-${a.lastFeedExpiry.slice(4, 6)}-${a.lastFeedExpiry.slice(6, 8)}` : null,
  lastChecked: a.lastRefreshedAt ?? null,
});
const NOTE = "Figures are Atlas's map values from the local processed file. Internal grades are not shown; every 10 or better is Atlas's fastest grade.";

function needAgency(q: unknown) {
  const a = data.findAgency(String(q ?? ''));
  if (!a) throw new Error(`No public agency matching "${q}" has data here. Use list_agencies to see which do.`);
  return a;
}
function needPeriod(p: unknown) {
  const k = data.parsePeriod(p);
  if (!k) throw new Error(`Unknown period "${p}". Use one of: ${PERIODS.join(', ')}.`);
  return k;
}

const handlers: Record<string, (args: Args) => unknown> = {
  list_agencies: ({ query }) => {
    const q = String(query ?? '').toLowerCase();
    return data.availableAgencies()
      .filter(a => !q || [a.slug, a.name, a.region ?? '', ...(a.cities ?? [])].some(s => s.toLowerCase().includes(q)))
      .map(a => ({ slug: a.slug, name: a.name, region: a.region ?? null, ...freshness(a) }));
  },
  route_frequency: ({ agency: q, route, day: d }) => {
    const a = needAgency(q);
    const dayType = data.parseDay(d);
    const r = data.findRoute(data.routesOn(a, dayType), String(route ?? ''));
    if (!r) throw new Error(`${a.name} has no route matching "${route}" on ${dayType}.`);
    return {
      agency: a.name, route: r.name, longName: r.longName, mode: r.mode, day: dayType,
      periods: PERIOD_KEYS.map(p => data.periodFigure(r, p)),
      service: data.serviceSpan(r),
      ...freshness(a), note: NOTE,
    };
  },
  routes_at_frequency: ({ agency: q, period: p, every: n, day: d }) => {
    const a = needAgency(q);
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const res = data.routesMeeting(a, dayType, key, minutes);
    return { agency: a.name, day: dayType, period: PERIOD_LABELS[key], every: minutes, ...res, meeting: res.meeting.map(m => ({ route: m.route, longName: m.longName, mode: m.mode, shown: m.shown, minutes: m.minutes })), ...freshness(a), note: NOTE };
  },
  compare_agencies: ({ agencies, period: p, every: n, day: d }) => {
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const rows = (Array.isArray(agencies) ? agencies : []).map(q => {
      const a = needAgency(q);
      const res = data.routesMeeting(a, dayType, key, minutes);
      return { agency: a.name, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, routesMeeting: res.meeting.length, ...freshness(a) };
    });
    return { day: dayType, period: PERIOD_LABELS[key], every: minutes, agencies: rows, note: NOTE };
  },
  schedule_changes: ({ agency: q }) => {
    // A comparison file stands on its own, so this needs no route file: any public agency will do.
    const a = data.findAgency(String(q ?? ''), data.publicAgencies().map(x => ({ ...x, file: '' })));
    if (!a) throw new Error(`No public agency matches "${q}".`);
    const file = data.scheduleComparison(a.slug);
    if (!file) return { agency: a.name, comparison: null, note: 'Atlas has not built a schedule comparison for this agency on this Mac.' };
    const changes = data.frequencyChanges(file);
    return {
      agency: a.name, day: file.day, before: file.before, after: file.after,
      routesAdded: file.changes.filter(c => !c.before).map(c => c.route), routesRemoved: file.changes.filter(c => !c.after).map(c => c.route),
      frequencyChanges: changes.slice(0, 40), frequencyChangeCount: changes.length,
      note: 'A frequency change counts when a route moves to a different grade (the shared rule, shared/frequencyChange.ts); publicChange false means riders still see the same grade.',
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
  if (method === 'initialize') reply(id, { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atlas', version: '0.1.0' } });
  else if (method === 'ping') reply(id, {});
  else if (method === 'tools/list') reply(id, { tools: TOOLS });
  else if (method === 'tools/call') {
    const handler = handlers[params?.name ?? ''];
    if (!handler) { fail(id, -32602, `Unknown tool ${params?.name}`); continue; }
    try { reply(id, { content: [{ type: 'text', text: JSON.stringify(handler(params?.arguments ?? {}), null, 1) }] }); }
    catch (e) { reply(id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }); }
  } else fail(id, -32601, `Method not found: ${method}`);
}
