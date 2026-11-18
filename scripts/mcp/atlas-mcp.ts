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
import { initializeResult, runTool, toolCallResult } from './rpc';
import { PERIOD_KEYS, PERIOD_MINUTES, PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { hourRange } from '../../shared/timeText';
import { STUDIO_TARGETS, groupAtTarget } from '../../shared/studioVehicles';
import { headwayEvery } from '../../shared/headwayText';

// Anything an imported module prints must not reach stdout, which is the protocol channel.
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');
const tools = await import('./tools');
const { needAgency, needPeriod, window, withAlso, staleNote, windowNote, INSTRUCTIONS } = tools;
type Args = Record<string, unknown>;
// The parts that read files on this Mac (trip times, buses needed) stay out of the pure tool code (CIV-1840).
const local = await import('./localData');
const { diskStore } = await import('./diskStore');
// ATLAS_MCP_STORE=split:<folder> reads the split release files in a folder (what the hosted server reads), else the files on this Mac.
const splitDir = process.env.ATLAS_MCP_STORE?.startsWith('split:') ? process.env.ATLAS_MCP_STORE.slice(6) : null;
const { folderReader } = await import('./folderReader');
if (splitDir) {
  const { splitStore } = await import('../../shared/mcpSplitStore');
  data.useStore(splitStore(folderReader(splitDir)));
} else data.useStore(diskStore());
// Testing only (CIV-1860): ATLAS_MCP_LIVE_DIR points the Live tools at a folder laid out like the private Live bucket
// (scripts/mcp/releaseLivePrivate.ts --dry-run writes one under <work>/dry-run).
const liveDir = process.env.ATLAS_MCP_LIVE_DIR;
if (liveDir) {
  const { splitLiveReader, useLiveReader } = await import('./liveData');
  useLiveReader(splitLiveReader(folderReader(liveDir)));
}

const localHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
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
    const neededAt = (at: Partial<Record<number, number>>) => Object.fromEntries(targets.filter(t => at[t] != null).map(t => [headwayEvery(t), at[t]]));
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
        // The same figures Studio's buses-needed page shows for each branch split (groupAtTarget).
        neededAt: neededAt(groupAtTarget(g, 'current')),
        ...(g.atTargetEven ? { neededAtWithBranchesEven: neededAt(groupAtTarget(g, 'even')) } : {}),
      })),
      targetsNote: `Atlas Studio works buses out only for every ${STUDIO_TARGETS.join(', ')} minutes. For any other frequency, say Atlas has no figure; don't work one out yourself.`,
      ...(missing ? { warning: `Atlas Studio works these out only for every ${STUDIO_TARGETS.join(', ')} minutes, not every ${every}. Give the nearest of those; don't work out ${every} yourself.` } : {}),
      howToRead: "'scheduledNow' is buses on these routes at the middle of the period; 'neededAtCurrentFrequency' is buses needed at each pattern's own frequency (running time plus layover, divided by the minutes between buses, rounded up once for the group). Where branches share a middle section, a target is for that middle, and its trips go to the branches in their current shares ('WithBranchesEven' splits them evenly). Trips to and from the garage are not in schedules and not counted.",
      source: "Atlas Studio's buses-needed file, worked out from the agency's own schedule.",
    };
  },
  trip_time: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const w = window(args);
    const ags = await withAlso(a, args);
    const t = await local.tripTimes(ags.map(x => ({ slug: x.slug, label: local.agencyLabel(x.slug, x.name) })), String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType, Array.isArray(args.routes) ? args.routes.map(String) : []);
    const routes = [...t.byRoute.entries()].map(([route, runs]) => {
      const inWindow = w ? runs.filter(x => tools.windowHas(x.start, w)) : runs;
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
    // A window that starts after midnight (12 AM–3 AM) is also read as the late night of the service day (24:00–27:00).
    const inWin = (starts: number[], win: { start: number; end: number }) => (w ? tools.startsInWindow(starts, win) : starts);
    return {
      ...staleNote(a, c.scheduleEnds),
      agency: ags.map(x => local.agencyLabel(x.slug, x.name)).join(', '), from: c.from, to: c.to, day: dayType, scheduleRead: c.readOn,
      ...(c.noDirectTrip ? { answer: 'No scheduled trip goes from the first stop to the second without a transfer on these agencies. Atlas Studio counts direct trips only.' } : {}),
      routes: [...c.byRoute.keys()],
      byWindow: windows.map(win => ({
        window: win.name,
        combined: c.reading(inWin(all, win), win.start, win.end),
        eachRoute: Object.fromEntries([...c.byRoute.entries()].map(([route, runs]) => [route, c.reading(inWin(runs.map(x => x.start), win), win.start, win.end)])),
      })).filter(x => x.combined.departures > 0),
      ...(w ? { windowNote: windowNote(w) } : {}),
      leaveTogether: windows.map(win => ({ window: win.name, departuresCountedAsOne: local.bunchedCount(inWin(all, win), win.start, win.end) })).filter(x => x.departuresCountedAsOne > 0),
      leaveTogetherNote: `Where two routes leave within ${local.BUNCHED_MINUTES} minute of each other, Atlas counts them as one departure, so the combined wait can read longer than the trips listed.`,
      note: 'Departures from the first stop on trips that go on to the second.', source: "The agency's own schedule file that Atlas processed.",
    };
  },
};

const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = { ...tools.handlers, ...localHandlers };
// Every tool's definition, the local ones included.
const TOOLS = tools.TOOLS;

function reply(id: unknown, result: unknown) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id: unknown, code: number, message: string) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Args; protocolVersion?: string } };
  try { msg = JSON.parse(line); } catch { fail(null, -32700, 'Parse error'); continue; }
  const { id, method, params } = msg;
  if (id === undefined) continue; // notifications (initialized, cancelled) need no answer
  if (method === 'initialize') reply(id, initializeResult(params?.protocolVersion, tools.SERVER_VERSION, INSTRUCTIONS));
  else if (method === 'ping') reply(id, {});
  else if (method === 'tools/list') reply(id, { tools: TOOLS });
  else if (method === 'tools/call') {
    const handler = handlers[params?.name ?? ''];
    if (!handler) { fail(id, -32602, `Unknown tool ${params?.name}`); continue; }
    reply(id, toolCallResult(await runTool(handler, params?.arguments ?? {})));
  } else fail(id, -32601, `Method not found: ${method}`);
}
