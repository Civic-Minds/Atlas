/**
 * route_now (CIV-1870): how a route is running right now, from the Live recorder's last half hour. CIV-3173 (the Live
 * core): each direction's vehicles and the gaps between them come from shared/liveCore.ts, the Live map's and Studio's own
 * calculation, so route_now says what the map's card says; the stop-by-stop extras (bunched and gapped stretches, longest
 * wait) come from shared/liveNow.ts. Served by the local MCP and the hosted Worker (workers/atlas-mcp).
 */
import { PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { clockTime } from '../../shared/timeText';
import { serviceDayOf } from './nowClock';
import { periodKeyForHour } from '../../shared/rules/periods';
import { LIVE_AGENCY_TIMEZONES } from '../../shared/livePollingConfig';
import { RECORDING_SLUGS } from '../../shared/liveArchiveFeeds';
import { LIVE_ARCHIVE_SLUGS, routeIsRecorded } from '../../shared/liveCoverage';
import { bunchedText, cutoffsFrom, gappedText } from '../../shared/liveCutoffs';
import { NOW_RECENT_MIN, NOW_WINDOW_MIN, nowDirections, routeNow, type NowRouteRow } from '../../shared/liveNow';
import { LIVE_STALE_SEC } from '../../shared/rules/live';
import { liveAgencyCoverage, recentFromSnapshots, routeDirectionsNow, type DirectionNow } from '../../shared/liveCore';
import { inferLiveDirection } from '../../shared/liveDirection';
import type { SegmentDelayData } from '../../shared/liveSegmentData';
import { liveLineText, type LiveRowGap } from '../../shared/liveWording';
import { liveFiles } from '../../local-api/liveFiles';
import * as data from './atlasData';
import { nowSec, nowSource } from './liveNowData';
import { routeKeyForShortName } from '../../src/utils/routeKey';
import { routeDirectionOverrides } from '../../src/utils/routeCardDirectionGroups';
import { liveScheduledRows } from '../../src/utils/liveScheduledHeadway';
import type { Args } from './toolHelpers';
import { latestSnapshot } from '../../shared/liveSource';
import { liveRecorderFeed } from '../../shared/liveRecorderFeeds';
import { networkCountAnswer, networkCountFrom } from '../../shared/liveNetworkCount';
import { fleetNetworkText } from '../../shared/studioWording';

const NOW_SOURCE = "Atlas Live's recordings of where each vehicle was, one reading a minute, over the last half hour: gaps are measured from when vehicles passed stops, not guessed from speed.";
/** What each part of a route_now answer means. */
const NOW_MEANING = {
  gap: 'A gap is the time between two vehicles passing the same stop, whichever branch they run.',
  bunchedNow: `Stretches of stops where the last two vehicles passed within the bunched cut-off, the later one in the last ${NOW_RECENT_MIN} minutes; minutes is the closest pair, minAgo when the later one passed.`,
  gappedNow: 'Stretches of stops where riders have waited longer than the gapped cut-off since the last vehicle seen there; minutes is the longest wait so far.',
  noneSeen: `Stops where the route is scheduled now but no vehicle was seen passing in the whole ${NOW_WINDOW_MIN} minutes: either none ran there, or vehicles ran another way (a diversion). Say both are possible; don't call it a gap.`,
  longestWait: 'The stop where riders have waited longest since the last vehicle seen there.',
  vehicles: `vehiclesNow counts the vehicles on this direction now, as the Live map's route card counts them; standingNow, of the vehicles seen on it, those that haven't moved in ${NOW_RECENT_MIN} minutes (at a terminal, held, out of service).`,
  gapsNow: "The gaps between this direction's vehicles now, in the Live map's route card's own words (\"live 3–5 min\"): how long ago the vehicle ahead passed the spot where the one behind is. Missing when too few were measured.",
  lastHalfHour: `Every gap at every stop in the last ${NOW_WINDOW_MIN} minutes, and the shares bunched and gapped.`,
};

/** The agency's local clock: day of the week, hour and minutes after midnight. */
function localClock(sec: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(sec * 1000)).map(p => [p.type, p.value]));
  const hour = Number(parts.hour) % 24, minute = Number(parts.minute);
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), hour, minutes: hour * 60 + minute };
}

/** The route's Live analysis (its line, timetable and trips), the file the Live card reads; null where Live has none. */
async function routeAnalysis(slug: string, route: string): Promise<(SegmentDelayData & { tripDirections?: Record<string, string[]>; directionLabels?: Record<string, string> }) | null> {
  try {
    const raw = await liveFiles().read(`${slug}-${route}-segments.json`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** The core's direction that shares most vehicles with one of route_now's (their direction numbers can differ). */
function pairedCore(core: readonly DirectionNow[], ids: readonly string[]): DirectionNow | null {
  const mine = new Set(ids);
  let best: DirectionNow | null = null, most = 0;
  for (const d of core) { const n = d.vehicleIds.filter(id => mine.has(id)).length; if (n > most) { best = d; most = n; } }
  return best;
}

export const liveNowHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  // CIV-3207: the agency's vehicles out right now across its whole network, Studio Fleet's "In service now" and "Not on a
  // trip" (CIV-2939), from the same recorder count Fleet reads (shared/liveNetworkCount.ts), by the same freshness rule.
  network_now: async ({ agency: q }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}". Use list_agencies to search.`);
    // The agencies Fleet's count is served for (atlas-live-read /live/network-count): recorded, and shown on Live (not Kingston).
    const feed = RECORDING_SLUGS.includes(a.slug) && liveAgencyCoverage(a.slug).hasVehicles ? liveRecorderFeed(a.slug) : null;
    if (!LIVE_ARCHIVE_SLUGS.includes(a.slug) || !feed) return { agency: a.name, live: null, note: `Atlas does not record Live data for ${a.name}, so it has no count of vehicles out now. It has the published schedule (buses_needed gives the vehicles the schedule needs, where Studio has built it).` };
    const source = nowSource();
    const timeZone = LIVE_AGENCY_TIMEZONES[a.slug];
    if (!source?.store || !timeZone) return { agency: a.name, live: null, note: `Atlas records ${a.name}'s vehicles but this server can't read the current recordings yet, so it has no count for right now.` };
    const now = nowSec();
    const answer = networkCountAnswer(await latestSnapshot(source.store, a.slug, now, feed.paceSec), now);
    const count = networkCountFrom(answer);
    const asOf = answer ? `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(answer.at * 1000))}, ${clockTime(localClock(answer.at, timeZone).minutes)}` : null;
    if (!count) return { agency: a.name, live: null, ...(asOf ? { latestReading: asOf } : {}), note: `Atlas has no current count of ${a.name}'s vehicles${asOf ? ` (the latest is from ${asOf}, too old to call current)` : ''}, so it has no figure for right now.` };
    const words = fleetNetworkText(undefined);
    return {
      agency: a.name, asOf, dataAgeMin: Math.round((answer!.ageSec) / 6) / 10, timeZone,
      inServiceNow: count.onTrip,
      ...(count.noTrip != null ? { notOnATrip: count.noTrip, ...(count.atGarage != null ? { ofThemAtGarages: count.atGarage } : {}) } : {}),
      definitions: {
        inServiceNow: `"${words.inServiceNow}" in Studio Fleet: vehicles reporting a position on a trip, across the agency's whole network, in the recorder's latest reading.`,
        ...(count.noTrip != null ? { notOnATrip: `"${words.notOnTrip}" in Studio Fleet: vehicles reporting a position with no trip (at a garage, deadheading, out of service); not counted as in service.` } : {}),
        ...(count.atGarage != null ? { ofThemAtGarages: 'Of the vehicles not on a trip, those standing in a group at one spot, as at a garage.' } : {}),
      },
      note: 'Give the time of the reading with the figure. For how one route is running now (gaps, bunching), use route_now; for the vehicles the schedule needs, buses_needed.',
      source: NOW_SOURCE,
    };
  },
  route_now: async ({ agency: q, route, bunched_within_min, gapped_factor }) => {
    const { cutoffs, custom } = cutoffsFrom({ bunched_within_min, gapped_factor });
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}". Use list_agencies to search.`);
    if (!LIVE_ARCHIVE_SLUGS.includes(a.slug)) return { agency: a.name, live: null, note: `Atlas does not record Live data for ${a.name}, so it has no figures for how its routes are running. It has the published schedule (route_frequency).` };
    // #1621: an agency whose recording is paused has no readings at all, which isn't a quiet half hour.
    if (!RECORDING_SLUGS.includes(a.slug)) return { agency: a.name, live: null, note: `Atlas's recording of ${a.name}'s vehicles is paused, so it has no current readings and no figures for right now. Offer the published schedule (route_frequency), or a recorded week only if route_reliability has one.` };
    const source = nowSource();
    if (!source) return { agency: a.name, live: null, note: `Atlas records ${a.name}'s vehicles but this server can't read the current recordings yet. Offer the latest recorded week (route_reliability, route_bunching).` };
    const timeZone = LIVE_AGENCY_TIMEZONES[a.slug];
    if (!timeZone) return { agency: a.name, live: null, note: `Atlas records ${a.name}'s vehicles but can't read its current recordings yet, so it has no figures for right now. Offer the latest recorded week (route_reliability, route_bunching).` };

    const now = nowSec();
    const clock = localClock(now, timeZone);
    // #1690: the same service day as the schedule tools' "now": after midnight, the previous day's late period.
    const { day } = serviceDayOf(clock.dow, clock.hour);
    const period = periodKeyForHour(clock.hour);
    const s = data.findRoute(await data.routeList(a, day), String(route ?? ''));
    if (!s) throw new Error(await data.routeInOtherFileNote(a, String(route ?? ''), day) ?? `No route matches "${route}" at ${a.name} on a ${day.toLowerCase()}.`);
    const rows = (await data.routeWithRows(a, day, s)).rows;
    const stops = new Map((await data.stopsOf(a)).map(x => [x.id, x]));
    const directions = nowDirections(rows as unknown as NowRouteRow[], stops, period);
    if (!directions.length) return { agency: a.name, route: s.name, live: null, note: `Atlas has no stop list for route ${s.name} here, so it can't place vehicles on it.` };
    const routeIds = [...new Set(rows.map(x => String(x.routeId)))];
    // A route Atlas Live doesn't record has no readings at all, which is not the same as a recorded route with no vehicles on it.
    if (!routeIsRecorded(a.slug, routeIds)) return { agency: a.name, route: s.longName ? `${s.name} ${s.longName}` : s.name, live: null, note: `Atlas has no current reading for this route: Atlas Live doesn't record it, so it has no figures for right now. Offer the published schedule (route_frequency).` };
    const snapshots = await source.snapshots(a.slug, now - NOW_WINDOW_MIN * 60, now);
    const r = routeNow({ snapshots, routeIds, directions, nowSec: now, cutoffs });
    // CIV-3173: the Live map card's own reading, from the same recordings, where Live has the route's analysis.
    const analysis = await routeAnalysis(a.slug, s.shortName || s.name);
    const ids = new Set(routeIds);
    const newest = snapshots.at(-1);
    // Each vehicle's direction, as the map gives the core its own: the feed's, else where route_now placed it (the pattern it
    // passed most stops on), else the map's own placement on the route's directional lines (shared/liveDirection.ts,
    // resolveLiveVehicles), here drawn through the route's stops. Feeds often send none (TTC), and trips the analysis's
    // timetable doesn't list (504C replacement buses) are counted only through it.
    const placedDir = new Map(r.directions.flatMap(d => d.vehicleIdsNow.map(id => [id, d.directionId] as const)));
    const lines = directions.flatMap(d => d.patterns.map(p => ({ type: 'Feature' as const, properties: { directionId: d.directionId }, geometry: { type: 'LineString' as const, coordinates: p.map(x => [x.lon, x.lat]) } })));
    const directionOf = (v: { id: string; d: number | null; lat: number; lon: number }) => v.d ?? placedDir.get(v.id) ?? inferLiveDirection({ lat: v.lat, lon: v.lon, directionId: null, headsign: null }, lines).directionId;
    const core = analysis ? routeDirectionsNow(analysis, recentFromSnapshots(snapshots, id => ids.has(id)), now, period, (newest?.vehicles ?? []).filter(v => ids.has(v.r)).map(v => ({ tripId: v.tripId ?? '', directionId: directionOf(v) }))) : [];
    // CIV-2055: each direction's Scheduled lines as the Live route card shows them (its shared stretch, each branch and
    // short turn), from the card's own reading, for the agency's day and period, not this server's clock.
    const fc = { type: 'FeatureCollection' as const, features: rows.map(properties => ({ type: 'Feature' as const, geometry: null, properties })) as unknown as GeoJSON.Feature[] };
    const routeKey = routeKeyForShortName(a.slug, fc.features, s.shortName || s.name, day);
    const overrides = routeDirectionOverrides([a as Parameters<typeof routeDirectionOverrides>[0][number]], a.slug, s.shortName || s.name);
    const scheduledFor = (directionId: number, label: string) => (routeKey && period ? liveScheduledRows(fc, routeKey, day, period, directionId, overrides, label).map(x => ({ label: x.label, value: x.value })) : []);

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
      directions: r.directions.map(d => { const c = pairedCore(core, d.vehicleIdsNow); return { direction: d.direction, scheduled: scheduledFor(d.directionId, d.direction), vehiclesNow: c && !c.incomplete ? c.vehicles : d.vehiclesNow, standingNow: d.standingNow, ...(c?.gaps ? { gapsNow: liveLineText({ from: c.gaps.rangeFrom, longest: c.gaps.longest.min } as Pick<LiveRowGap, 'from' | 'longest'> as LiveRowGap) } : {}), bunchedNow: d.bunchedNow, gappedNow: d.gappedNow, noneSeen: d.noneSeen, longestWait: d.longestWait, lastHalfHour: d.lastHalfHour }; }),
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
