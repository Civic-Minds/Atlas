/**
 * The MCP tools that read files on this Mac (CIV-1840, moved here from atlas-mcp.ts in CIV-1864 so they can be tested):
 * trip_time and combined_frequency (the agency's own schedule file). The local server serves them; the hosted Worker
 * doesn't have them. buses_needed moved to the shared tools in CIV-1977: it reads Studio's file through the store.
 */
import { PERIOD_KEYS, PERIOD_MINUTES, PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { hourRange } from '../../shared/timeText';
import * as data from './atlasData';
import { needAgency, window, withAlso, windowOrNow, nowBlock, staleNote, windowNote, windowHas, startsInWindow, type Args } from './toolHelpers';
import * as local from './localData';
import { isoDate } from '../../shared/dateText';
import { handlers as sharedHandlers } from './tools';
import { TIME_PERIODS } from '../../shared/rules/periods';
import type { DayType } from '../../shared/rules/days';

export const localHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  // CIV-2089: stop_frequency plus how often any route leaves the stop, from this Mac's schedule files (the hosted
  // server has no departure times, so its answer says the figure isn't available there).
  stop_frequency: async (args) => {
    const res = await sharedHandlers.stop_frequency(args) as { matched?: string | null; day?: DayType; allRoutes?: unknown } & Record<string, unknown>;
    if (!res.matched || !res.day) return res;
    const a = await needAgency(args.agency);
    let stops: Awaited<ReturnType<typeof local.departuresAtStop>> = null;
    try { stops = await local.departuresAtStop(a.slug, res.matched, res.day); } catch { /* no schedule file on this Mac */ }
    if (!stops?.length) return res;
    const byStop = stops.map(s => ({
      towards: s.towards,
      periods: Object.fromEntries(TIME_PERIODS.map(p => [`${p.label} (${formatPeriodRange(p.key)})`, local.combinedReading(s.starts, p.startHour * 60, p.endHour * 60)]).filter(([, r]) => (r as { departures: number }).departures > 0)),
    }));
    return { ...res, allRoutes: { stops: byStop, rule: `Every route leaving this stop together, the way combined_frequency counts them: two departures ${local.BUNCHED_MINUTES} minute or less apart count as one, so the combined wait can read longer than the trips listed. One entry per side of the street or platform (towards: its most common destinations), since a rider waits at one.` } };
  },
  trip_time: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const w = window(args);
    const ags = await withAlso(a, args);
    const t = await local.tripTimes(ags.map(x => ({ slug: x.slug, label: local.agencyLabel(x.slug, x.name) })), String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType, Array.isArray(args.routes) ? args.routes.map(String) : []);
    const routes = [...t.byRoute.entries()].map(([route, runs]) => {
      const inWindow = w ? runs.filter(x => windowHas(x.start, w)) : runs;
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
      agency: ags.map(x => local.agencyLabel(x.slug, x.name)).join(', '), from: t.from, to: t.to, day: dayType, scheduleRead: t.readOn, scheduleValidThrough: isoDate(t.scheduleEnds), ...(w ? { window: w.label, windowNote: windowNote(w) } : {}),
      ...(t.noDirectTrip ? { answer: 'No scheduled trip goes from the first stop to the second without a transfer on these agencies. Atlas Studio counts direct trips only.' } : {}),
      routes, note: 'Scheduled minutes from leaving the first stop to arriving at the second; an hour needs at least two trips.', source: "The agency's own schedule file that Atlas processed.",
    };
  },
  combined_frequency: async (args) => {
    const a = await needAgency(args.agency);
    // from_time "now" (#1627): the hour from the agency's current time, on today's day type.
    const { w, now } = await windowOrNow(a, args);
    const dayType = now && args.day == null ? now.day : data.parseDay(args.day);
    const ags = await withAlso(a, args);
    const c = await local.combinedDepartures(ags.map(x => ({ slug: x.slug, label: local.agencyLabel(x.slug, x.name) })), String(args.from_stop ?? ''), String(args.to_stop ?? ''), dayType);
    const windows = w ? [{ name: w.label, start: w.start, end: w.end }] : PERIOD_KEYS.map(k => ({ name: `${PERIOD_LABELS[k]} (${formatPeriodRange(k)})`, start: PERIOD_MINUTES[k].start, end: PERIOD_MINUTES[k].end }));
    const all = [...c.byRoute.values()].flat().map(x => x.start);
    // A window that starts after midnight (12 AM–3 AM) is also read as the late night of the service day (24:00–27:00).
    const inWin = (starts: number[], win: { start: number; end: number }) => (w ? startsInWindow(starts, win) : starts);
    return {
      ...staleNote(a, c.scheduleEnds),
      ...(now ? nowBlock(now, !inWin(all, w!).length) : {}),
      agency: ags.map(x => local.agencyLabel(x.slug, x.name)).join(', '), from: c.from, to: c.to, day: dayType, scheduleRead: c.readOn, scheduleValidThrough: isoDate(c.scheduleEnds),
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
