/**
 * The MCP tools that read files on this Mac (CIV-1840, moved here from atlas-mcp.ts in CIV-1864 so they can be tested):
 * buses_needed (Studio's buses-needed file), trip_time and combined_frequency (the agency's own schedule file). The local
 * server serves them; the hosted Worker doesn't have them.
 */
import { PERIOD_KEYS, PERIOD_MINUTES, PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { hourRange } from '../../shared/timeText';
import { STUDIO_TARGETS, groupAtTarget } from '../../shared/studioVehicles';
import { headwayEvery } from '../../shared/headwayText';
import * as data from './atlasData';
import { needAgency, window, withAlso, periodOrNow, windowOrNow, nowBlock, staleNote, windowNote, windowHas, startsInWindow, type Args } from './toolHelpers';
import * as local from './localData';

export const localHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  buses_needed: async (args) => {
    const a = await needAgency(args.agency);
    // period "now" (#1627): the agency's current part of the day. The figures are for a representative weekday.
    const { key, now } = await periodOrNow(a, args.period, null);
    const nowInfo = now ? { ...nowBlock(now), ...(now.day !== 'Weekday' ? { nowDayNote: `It's ${now.day} there now, but buses-needed figures are for a weekday.` } : {}) } : {};
    const route = String(args.route ?? '');
    const every = args.every != null ? Number(args.every) : null;
    const res = local.busesNeeded(a.slug, route, key);
    const period = `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`;
    if (!res.cached) return { agency: a.name, route, period, ...nowInfo, answer: `Atlas Studio has no buses-needed figures for ${a.name} yet. They are worked out once per agency ahead of time, not while you wait. Don't estimate a number yourself.` };
    if (!res.groups.length) return { agency: a.name, route, period, ...nowInfo, answer: `Route ${route} isn't in ${a.name}'s buses-needed figures for the ${PERIOD_LABELS[key].replace(/^(?![AP]M)\w/, c => c.toLowerCase())}: it may not run then, or its number is written differently.` };
    const missing = every != null && !STUDIO_TARGETS.includes(every);
    const targets = every != null && !missing ? [every] : [...STUDIO_TARGETS];
    const neededAt = (at: Partial<Record<number, number>>) => Object.fromEntries(targets.filter(t => at[t] != null).map(t => [headwayEvery(t), at[t]]));
    return {
      agency: a.name, route, period, ...nowInfo,
      ...(res.olderSchedule ? { note: `These figures come from an older schedule file (${res.feed}) than the newest one on this Mac.` } : {}),
      day: `A representative weekday in the week of ${res.referenceDate}.`,
      groups: res.groups.map(g => ({
        routesSharingBuses: g.routes,
        scheduledNow: g.scheduled,
        neededAtCurrentFrequency: g.implied,
        // Summed over every direction and branch of the group (#1618), not one round trip.
        runningMinutesAllPatterns: g.runningMin,
        layoverMinutesAllPatterns: g.layoverMin,
        // The same figures Studio's buses-needed page shows for each branch split (groupAtTarget).
        neededAt: neededAt(groupAtTarget(g, 'current')),
        ...(g.atTargetEven ? { neededAtWithBranchesEven: neededAt(groupAtTarget(g, 'even')) } : {}),
      })),
      targetsNote: `Atlas Studio works buses out only for every ${STUDIO_TARGETS.join(', ')} minutes. For any other frequency, say Atlas has no figure; don't work one out yourself.`,
      ...(missing ? { warning: `Atlas Studio works these out only for every ${STUDIO_TARGETS.join(', ')} minutes, not every ${every}. Give the nearest of those; don't work out ${every} yourself.` } : {}),
      howToRead: "'scheduledNow' is buses on these routes at the middle of the period; 'neededAtCurrentFrequency' is buses needed at each pattern's own frequency (running time plus layover, divided by the minutes between buses, rounded up once for the group). Where branches share a middle section, a target is for that middle, and its trips go to the branches in their current shares ('WithBranchesEven' splits them evenly). Trips to and from the garage are not in schedules and not counted. 'runningMinutesAllPatterns' and 'layoverMinutesAllPatterns' add up every direction and branch of the group, so they are not one round trip: never divide them by a frequency to check or replace a count.",
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
      agency: ags.map(x => local.agencyLabel(x.slug, x.name)).join(', '), from: t.from, to: t.to, day: dayType, scheduleRead: t.readOn, ...(w ? { window: w.label, windowNote: windowNote(w) } : {}),
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
