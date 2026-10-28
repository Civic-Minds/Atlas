import { GtfsData, CorridorResult, DayName } from '../types/gtfs';
import { t2m } from './transit-utils';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar';
import { PERIOD_KEYS, PERIOD_MINUTES, type PeriodKey } from '../shared/config.js';

/**
 * Combined service where different routes share stops (CIV-1092). A corridor is a run of at
 * least MIN_CORRIDOR_STOPS consecutive stops that two or more routes serve in the same
 * direction, each stop to the same next stop. Its value per period is the wait a rider who
 * turns up at random sees for whichever of those routes comes first: the pooled departures at
 * each stop, bunched pairs as one bus, read over the whole period (riderWait), then the median
 * across the corridor's stops. On weekdays every weekday the corridor runs is read and the worst
 * one is kept, so a route that runs only some weekdays never makes it look better than any one day.
 * Route-level values never read this.
 */

/** Fewest consecutive shared stops that make a corridor (two routes crossing share one or two). */
export const MIN_CORRIDOR_STOPS = 3;
/** Fewest departures in a period for a wait to be read. */
export const MIN_CORRIDOR_DEPARTURES = 3;
/** Weekdays a corridor must run on to be a Weekday corridor (one holiday in the week is left out). */
export const MIN_WEEKDAYS_SERVED = 3;
/** Two departures this close are one bus to a rider: the second shortens nobody's wait. */
export const CORRIDOR_BUNCHED_MINUTES = 1;

export type CorridorWaits = Record<PeriodKey, number | null>;

/**
 * The average wait of a rider arriving at random in [start, end), as an even headway (twice the
 * average wait). It is read from the start of the period, so a period whose buses all come in one
 * burst does not read as that burst's spacing. When the day's last bus leaves more than two of its
 * own gaps before the period ends, service stops partway and the period has no value: an hour of
 * no service would otherwise drop out. `times` is the whole day's list; null under
 * MIN_CORRIDOR_DEPARTURES in the period.
 */
export function riderWait(times: readonly number[], start: number, end: number): number | null {
    const list: number[] = [];
    for (const t of [...new Set(times)].sort((a, b) => a - b)) {
        if (list.length > 0 && t - list[list.length - 1] <= CORRIDOR_BUNCHED_MINUTES) continue;
        list.push(t);
    }
    if (list.filter(t => t >= start && t < end).length < MIN_CORRIDOR_DEPARTURES) return null;
    const until = Math.min(end, list[list.length - 1]);
    if (until <= start) return null;
    let waited = 0;
    let from = start;
    for (const d of list) {
        if (d <= from) continue;
        const to = Math.min(d, until);
        waited += ((d - from) ** 2 - (d - to) ** 2) / 2;
        from = to;
        if (from >= until) break;
    }
    const value = (2 * waited) / (until - start);
    return end - until > 2 * value ? null : value;
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Each period's corridor value: the median of its stops' waits, rounded; null when no stop has one. */
function stretchWaits(stopTimes: Array<Map<string, number[]>>, routes: readonly string[]): CorridorWaits {
    const out = {} as CorridorWaits;
    for (const pk of PERIOD_KEYS) {
        const { start, end } = PERIOD_MINUTES[pk];
        const waits = stopTimes
            .map(byRoute => riderWait(routes.flatMap(r => byRoute.get(r) ?? []), start, end))
            .filter((w): w is number => w != null);
        out[pk] = waits.length > 0 ? Math.round(median(waits)) : null;
    }
    return out;
}

/** The worse (longer) of two waits; a period with no wait on one day has none. */
function worse(a: CorridorWaits, b: CorridorWaits): CorridorWaits {
    const out = {} as CorridorWaits;
    for (const pk of PERIOD_KEYS) out[pk] = a[pk] == null || b[pk] == null ? null : Math.max(a[pk]!, b[pk]!);
    return out;
}

export const calculateCorridors = (
    gtfs: GtfsData,
    day: string,
    referenceDate?: string
): CorridorResult[] => {
    const { trips, stopTimes, calendar, calendarDates, routes } = gtfs;
    const refDate = referenceDate ?? detectReferenceDate(calendar, calendarDates);
    const dayNames: DayName[] = day === 'Weekday'
        ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        : day === 'Saturday' ? ['Saturday'] : ['Sunday'];

    // A route is known to riders by its number; two route_ids with one number are one route.
    const routeKey = new Map<string, string>();
    for (const r of routes ?? []) routeKey.set(r.route_id, r.route_short_name || r.route_long_name || r.route_id);

    const servicesByDay = dayNames.map(d => new Set(getActiveServiceIds(calendar, calendarDates, d, refDate)));
    const anyDay = new Set(servicesByDay.flatMap(s => [...s]));
    const tripInfo = new Map<string, { route: string; routeId: string; service: string }>();
    for (const trip of trips) {
        if (!anyDay.has(trip.service_id)) continue;
        tripInfo.set(trip.trip_id, { route: routeKey.get(trip.route_id) ?? trip.route_id, routeId: trip.route_id, service: trip.service_id });
    }

    // Each trip's stops where riders can board, in order. A stop a trip only sets down at is no
    // departure, and a stop it skips is not on its list, so neither counts there.
    const sequences = new Map<string, Array<{ seq: number; stopId: string; time: number }>>();
    for (const st of stopTimes) {
        if (!tripInfo.has(st.trip_id) || st.pickup_type === '1') continue;
        const time = t2m(st.departure_time || st.arrival_time);
        if (time == null) continue;
        let list = sequences.get(st.trip_id);
        if (!list) sequences.set(st.trip_id, list = []);
        list.push({ seq: parseInt(st.stop_sequence), stopId: st.stop_id, time });
    }

    // Departures on each stop-to-next-stop link, per route and per day, and the routes on it.
    const linkRoutes = new Map<string, Set<string>>();
    const linkTimes = new Map<string, Array<Map<string, number[]>>>();
    const linkRouteIds = new Map<string, Set<string>>();
    const tripLinks: string[][] = [];
    const linkStops = new Map<string, [string, string]>();
    for (const [tripId, list] of sequences) {
        list.sort((a, b) => a.seq - b.seq);
        const { route, routeId, service } = tripInfo.get(tripId)!;
        const links: string[] = [];
        for (let i = 0; i + 1 < list.length; i++) {
            const link = `${list[i].stopId}>${list[i + 1].stopId}`;
            links.push(link);
            linkStops.set(link, [list[i].stopId, list[i + 1].stopId]);
            let set = linkRoutes.get(link);
            if (!set) linkRoutes.set(link, set = new Set());
            set.add(route);
            let ids = linkRouteIds.get(link);
            if (!ids) linkRouteIds.set(link, ids = new Set());
            ids.add(routeId);
            let perDay = linkTimes.get(link);
            if (!perDay) linkTimes.set(link, perDay = servicesByDay.map(() => new Map()));
            servicesByDay.forEach((services, d) => {
                if (!services.has(service)) return;
                const byRoute = perDay![d];
                let times = byRoute.get(route);
                if (!times) byRoute.set(route, times = []);
                times.push(list[i].time);
            });
        }
        tripLinks.push(links);
    }

    // Corridors: runs of consecutive links along a trip that the same two or more routes share.
    const routeSetKey = (link: string) => [...linkRoutes.get(link)!].sort().join('|');
    const runs = new Map<string, { links: string[]; key: string }>();
    for (const links of tripLinks) {
        for (let i = 0; i < links.length;) {
            const key = routeSetKey(links[i]);
            let j = i + 1;
            while (j < links.length && routeSetKey(links[j]) === key) j++;
            if (key.includes('|') && j - i + 1 >= MIN_CORRIDOR_STOPS) {
                const run = links.slice(i, j);
                runs.set(run.join(','), { links: run, key });
            }
            i = j;
        }
    }
    // A trip that starts or ends inside a corridor yields part of it; keep the whole one.
    const all = [...runs.values()];
    const kept = all.filter(r => !all.some(o => o !== r && o.key === r.key && o.links.length > r.links.length
        && `,${o.links.join(',')},`.includes(`,${r.links.join(',')},`)));

    const results: CorridorResult[] = [];
    for (const { links, key } of kept) {
        const routeNames = key.split('|');
        const stopIds = [linkStops.get(links[0])![0], ...links.map(l => linkStops.get(l)![1])];
        let waits: CorridorWaits | null = null;
        let servedDays = 0;
        const routeWaits: Record<string, CorridorWaits> = {};
        servicesByDay.forEach((_, d) => {
            // A weekday with no service on the corridor at all (a holiday in the reference week)
            // is left out; any day it runs counts, and the worst of them is kept.
            const byStop = links.map(l => linkTimes.get(l)![d]);
            if (byStop.every(m => m.size === 0)) return;
            servedDays++;
            const dayWaits = stretchWaits(byStop, routeNames);
            waits = waits ? worse(waits, dayWaits) : dayWaits;
            for (const r of routeNames) {
                const own = stretchWaits(byStop, [r]);
                routeWaits[r] = routeWaits[r] ? worse(routeWaits[r], own) : own;
            }
        });
        // A weekday corridor that runs on fewer than three weekdays is not weekday service.
        if (dayNames.length > 1 && servedDays < MIN_WEEKDAYS_SERVED) continue;
        if (!waits || PERIOD_KEYS.every(pk => waits![pk] == null)) continue;
        results.push({
            corridorId: links.join(','),
            stopIds,
            routeIds: [...new Set(links.flatMap(l => [...linkRouteIds.get(l)!]))].sort(),
            routeNames,
            waits,
            routeWaits,
        });
    }
    return results.sort((a, b) => a.corridorId.localeCompare(b.corridorId));
};
