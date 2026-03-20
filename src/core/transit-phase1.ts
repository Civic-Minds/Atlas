import {
    GtfsData,
    GtfsFrequency,
    RawRouteDepartures,
    ALL_DAYS,
} from '../types/gtfs';
import { t2m, getModeName } from './transit-utils';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar';

/**
 * Expand frequency-based trips into individual departure times.
 * Rejects headways < 60 seconds (invalid for scheduled transit analysis).
 * Uses integer-second arithmetic to avoid floating-point accumulation.
 */
function expandFrequencies(frequencies: GtfsFrequency[] | undefined): Map<string, number[]> {
    const expanded = new Map<string, number[]>();
    if (!frequencies || frequencies.length === 0) return expanded;

    const byTrip = new Map<string, GtfsFrequency[]>();
    for (const freq of frequencies) {
        if (!byTrip.has(freq.trip_id)) byTrip.set(freq.trip_id, []);
        byTrip.get(freq.trip_id)!.push(freq);
    }

    for (const [tripId, entries] of byTrip) {
        const departures: number[] = [];
        for (const freq of entries) {
            const startMins = t2m(freq.start_time);
            const endMins = t2m(freq.end_time);
            const headwaySecs = parseInt(freq.headway_secs);
            if (startMins === null || endMins === null || Number.isNaN(headwaySecs) || headwaySecs < 60) continue;

            const startSecs = startMins * 60;
            const endSecs = endMins * 60;
            for (let s = startSecs; s < endSecs; s += headwaySecs) {
                departures.push(s / 60);
            }
        }
        if (departures.length > 0) expanded.set(tripId, departures);
    }

    return expanded;
}

/**
 * Builds a map of trip_id → origin departure time (minutes from midnight).
 * Origin = the stop with the lowest stop_sequence for that trip.
 * Frequency-based trips are expanded into synthetic per-departure entries.
 */
function buildTripDepartures(
    gtfs: GtfsData
): Map<string, { depTime: number; routeId: string; dirId: string; serviceId: string; missingDir: boolean }> {
    const { trips, stopTimes } = gtfs;

    const tripFirstDep = new Map<string, number>();
    const tripFirstSeq = new Map<string, number>();

    for (const st of stopTimes) {
        const seq = parseInt(st.stop_sequence);
        if (Number.isNaN(seq)) continue;
        const existing = tripFirstSeq.get(st.trip_id);
        if (existing === undefined || seq < existing) {
            const dep = t2m(st.departure_time);
            if (dep !== null) {
                tripFirstDep.set(st.trip_id, dep);
                tripFirstSeq.set(st.trip_id, seq);
            }
        }
    }

    const freqExpanded = expandFrequencies(gtfs.frequencies);

    const result = new Map<string, { depTime: number; routeId: string; dirId: string; serviceId: string; missingDir: boolean }>();
    for (const trip of trips) {
        const baseDep = tripFirstDep.get(trip.trip_id);
        if (baseDep === undefined) continue;

        const tripMeta = {
            routeId: trip.route_id,
            dirId: trip.direction_id?.trim() || '0',
            serviceId: trip.service_id,
            missingDir: !trip.direction_id?.trim(),
        };

        const freqDeps = freqExpanded.get(trip.trip_id);
        if (freqDeps) {
            for (let i = 0; i < freqDeps.length; i++) {
                result.set(`${trip.trip_id}__freq_${i}`, { depTime: freqDeps[i], ...tripMeta });
            }
        } else {
            result.set(trip.trip_id, { depTime: baseDep, ...tripMeta });
        }
    }

    return result;
}

/**
 * Deduplicates exact duplicate departure times (same minute) from overlapping
 * service_ids. Preserves legitimately close departures on high-frequency routes.
 */
function deduplicateDepartures(times: number[]): number[] {
    if (times.length === 0) return [];
    const sorted = [...times].sort((a, b) => a - b);
    const result = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== result[result.length - 1]) result.push(sorted[i]);
    }
    return result;
}

/**
 * Phase 1: Extract raw departure data from GTFS.
 *
 * Produces one RawRouteDepartures per route/direction/day (Mon–Sun).
 * No time window filtering, no tier classification — all gaps preserved.
 */
export function computeRawDepartures(gtfs: GtfsData, referenceDate?: string): RawRouteDepartures[] {
    const { routes, calendar, calendarDates } = gtfs;
    if (!routes || !gtfs.trips || !gtfs.stops || !gtfs.stopTimes) return [];

    const routeById = new Map(routes.map(r => [r.route_id, r]));
    const tripData = buildTripDepartures(gtfs);
    const refDate = referenceDate ?? detectReferenceDate(calendar, calendarDates);
    const results: RawRouteDepartures[] = [];

    for (const day of ALL_DAYS) {
        const activeServiceIds = getActiveServiceIds(calendar, calendarDates, day, refDate);
        if (activeServiceIds.size === 0) continue;

        const grouped = new Map<string, { times: number[]; serviceIds: Set<string>; missingDir: boolean }>();

        for (const [, data] of tripData) {
            if (!activeServiceIds.has(data.serviceId)) continue;
            const key = `${data.routeId}::${data.dirId}`;
            if (!grouped.has(key)) grouped.set(key, { times: [], serviceIds: new Set(), missingDir: false });
            const group = grouped.get(key)!;
            group.times.push(data.depTime);
            group.serviceIds.add(data.serviceId);
            if (data.missingDir) group.missingDir = true;
        }

        for (const [key, group] of grouped) {
            const [routeId, dirId] = key.split('::');
            const departureTimes = deduplicateDepartures(group.times);
            if (departureTimes.length < 2) continue;

            const gaps: number[] = [];
            for (let i = 1; i < departureTimes.length; i++) {
                gaps.push(departureTimes[i] - departureTimes[i - 1]);
            }

            const warnings: string[] = [];
            if (group.missingDir) {
                warnings.push(`direction_id missing from feed — all trips merged into one direction; headways may be understated`);
            }

            const route = routeById.get(routeId);
            const routeType = route?.route_type || '3';

            results.push({
                route: routeId,
                dir: dirId,
                day,
                routeType,
                modeName: getModeName(routeType),
                departureTimes,
                gaps,
                serviceSpan: {
                    start: departureTimes[0],
                    end: departureTimes[departureTimes.length - 1],
                },
                tripCount: departureTimes.length,
                serviceIds: Array.from(group.serviceIds),
                warnings,
            });
        }
    }

    return results;
}
