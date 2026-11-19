/**
 * route_now (CIV-1870): how a route is running right now, from the Live recorder's last half hour, through
 * shared/liveNow.ts (Studio's view, CIV-1893, calls the same). Local MCP only for now: the hosted Worker has no handler
 * for it (it lists only tools it can serve) and keeps LIVE_TOOLS off.
 */
import { PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { clockTime } from '../../shared/timeText';
import { dayTypeOfDow } from '../../shared/rules/days';
import { periodKeyForHour } from '../../shared/rules/periods';
import { LIVE_AGENCY_TIMEZONES } from '../../shared/livePollingConfig';
import { LIVE_ARCHIVE_SLUGS } from '../../shared/liveCoverage';
import { bunchedText, cutoffsFrom, gappedText } from '../../shared/liveCutoffs';
import { NOW_RECENT_MIN, NOW_WINDOW_MIN, nowDirections, routeNow, type NowRouteRow } from '../../shared/liveNow';
import { LIVE_STALE_SEC } from '../../shared/rules/live';
import * as data from './atlasData';
import { nowSec, nowSource } from './liveNowData';
import type { Args } from './toolHelpers';

const NOW_SOURCE = "Atlas Live's recordings of where each vehicle was, one reading a minute, over the last half hour: gaps are measured from when vehicles passed stops, not guessed from speed.";
/** What each part of a route_now answer means. */
const NOW_MEANING = {
  gap: 'A gap is the time between two vehicles passing the same stop, whichever branch they run.',
  bunchedNow: `Stretches of stops where the last two vehicles passed within the bunched cut-off, the later one in the last ${NOW_RECENT_MIN} minutes; minutes is the closest pair, minAgo when the later one passed.`,
  gappedNow: 'Stretches of stops where riders have waited longer than the gapped cut-off since the last vehicle seen there; minutes is the longest wait so far.',
  noneSeen: `Stops where the route is scheduled now but no vehicle was seen passing in the whole ${NOW_WINDOW_MIN} minutes: either none ran there, or vehicles ran another way (a diversion). Say both are possible; don't call it a gap.`,
  longestWait: 'The stop where riders have waited longest since the last vehicle seen there.',
  vehicles: `vehiclesNow counts vehicles moving along the route now; standingNow those that haven't moved in ${NOW_RECENT_MIN} minutes (at a terminal, held, out of service).`,
  lastHalfHour: `Every gap at every stop in the last ${NOW_WINDOW_MIN} minutes, and the shares bunched and gapped.`,
};

/** The agency's local clock: day of the week, hour and minutes after midnight. */
function localClock(sec: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(sec * 1000)).map(p => [p.type, p.value]));
  const hour = Number(parts.hour) % 24, minute = Number(parts.minute);
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), hour, minutes: hour * 60 + minute };
}

export const liveNowHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  route_now: async ({ agency: q, route, bunched_within_min, gapped_factor }) => {
    const { cutoffs, custom } = cutoffsFrom({ bunched_within_min, gapped_factor });
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}". Use list_agencies to search.`);
    if (!LIVE_ARCHIVE_SLUGS.includes(a.slug)) return { agency: a.name, live: null, note: `Atlas does not record Live data for ${a.name}, so it has no figures for how its routes are running. It has the published schedule (route_frequency).` };
    const source = nowSource();
    if (!source) return { agency: a.name, live: null, note: `Atlas records ${a.name}'s vehicles but this server can't read the current recordings yet. Offer the latest recorded week (route_reliability, route_bunching).` };
    const timeZone = LIVE_AGENCY_TIMEZONES[a.slug];
    if (!timeZone) throw new Error(`No time zone set for ${a.name}'s Live recordings.`);

    const now = nowSec();
    const clock = localClock(now, timeZone);
    const day = dayTypeOfDow(clock.dow);
    const period = periodKeyForHour(clock.hour);
    const s = data.findRoute(await data.routeList(a, day), String(route ?? ''));
    if (!s) throw new Error(`No route matches "${route}" at ${a.name} on a ${day.toLowerCase()}.`);
    const rows = (await data.routeWithRows(a, day, s)).rows;
    const stops = new Map((await data.stopsOf(a)).map(x => [x.id, x]));
    const directions = nowDirections(rows as unknown as NowRouteRow[], stops, period);
    if (!directions.length) return { agency: a.name, route: s.name, live: null, note: `Atlas has no stop list for route ${s.name} here, so it can't place vehicles on it.` };
    const snapshots = await source.snapshots(a.slug, now - NOW_WINDOW_MIN * 60, now);
    const r = routeNow({ snapshots, routeIds: [...new Set(rows.map(x => String(x.routeId)))], directions, nowSec: now, cutoffs });

    // The reading's day and time in the agency's time zone ("Mon, Nov 16, 6:01 PM"), so an answer never reads as today's when it isn't.
    const asOf = r.asOf != null ? `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(r.asOf * 1000))}, ${clockTime(localClock(r.asOf, timeZone).minutes)}` : null;
    const base = { agency: a.name, route: s.longName ? `${s.name} ${s.longName}` : s.name, source: NOW_SOURCE };
    if (r.stale) {
      return { ...base, live: null, ...(asOf ? { latestReading: asOf } : {}), note: `Atlas has no current reading for this route${asOf ? ` (the latest is from ${asOf}, more than ${LIVE_STALE_SEC / 60} minutes ago)` : ' in the last half hour'}, so it has no figures for right now. Offer the latest recorded week (route_reliability, route_bunching).` };
    }
    return {
      ...base,
      asOf, dataAgeMin: Math.round((r.ageSec ?? 0) / 6) / 10, timeZone,
      scheduleUsed: period ? `${day}, ${PERIOD_LABELS[period]} (${formatPeriodRange(period)})` : `${day}, overnight: no scheduled gaps, so nothing is called gapped`,
      directions: r.directions.map(d => ({ direction: d.direction, vehiclesNow: d.vehiclesNow, standingNow: d.standingNow, bunchedNow: d.bunchedNow, gappedNow: d.gappedNow, noneSeen: d.noneSeen, longestWait: d.longestWait, lastHalfHour: d.lastHalfHour })),
      definitions: {
        bunched: bunchedText(cutoffs.bunchedWithinMin),
        gapped: `${gappedText(cutoffs.gappedFactor)} Each stop's scheduled gap is Atlas's own for this period (branches that share a stop count together).`,
        ...NOW_MEANING,
        ...(custom.length ? { cutoffs: 'Bunched and gapped here use the cut-offs asked for; say so beside each figure.' } : {}),
      },
      note: 'Give the time of the reading with every figure. These figures cover the last half hour only; for how the route usually runs, use route_reliability or route_bunching.',
    };
  },
};
