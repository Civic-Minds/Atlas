import {
    GtfsData,
    GtfsFrequency,
    RawRouteDepartures,
    ALL_DAYS,
} from '../types/gtfs';
import { t2m, getModeName, expandTripFrequencyWindows, parseFrequencyWindow, type FrequencyWindow } from './transit-utils';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar';
import { isRailLikeRoute } from '../shared/modes';

/**
 * Expand frequency-based trips into individual departure times.
 * Rejects headways < 60 seconds (invalid for scheduled transit analysis).
 * Uses the same rules as stop-level expansion in process-core
 * (expandTripFrequencyWindows): a row that is one scheduled trip adds only that
 * trip (#702, #706), and a later row's departures inside an earlier row's
 * window on the same trip are not counted twice (#711).
 */
function expandFrequencies(
    frequencies: GtfsFrequency[] | undefined,
    stopTimes: GtfsData['stopTimes'],
): Map<string, number[]> {
    const expanded = new Map<string, number[]>();
    if (!frequencies || frequencies.length === 0) return expanded;

    const byTrip = new Map<string, FrequencyWindow[]>();
    for (const freq of frequencies) {
        const window = parseFrequencyWindow(freq);
        if (!window) continue;
        if (!byTrip.has(freq.trip_id)) byTrip.set(freq.trip_id, []);
        byTrip.get(freq.trip_id)!.push(window);
    }

    // First-to-last stop_times span per frequency trip, measured the same way as
    // process-core (earliest and latest departure_time or arrival_time).
    const spanBounds = new Map<string, [number, number]>();
    for (const st of stopTimes ?? []) {
        if (!byTrip.has(st.trip_id)) continue;
        const mins = t2m(st.departure_time || st.arrival_time);
        if (mins === null) continue;
        const bounds = spanBounds.get(st.trip_id);
        if (!bounds) spanBounds.set(st.trip_id, [mins, mins]);
        else {
            if (mins < bounds[0]) bounds[0] = mins;
            if (mins > bounds[1]) bounds[1] = mins;
        }
    }

    for (const [tripId, windows] of byTrip) {
        const bounds = spanBounds.get(tripId);
        const departures = expandTripFrequencyWindows(windows, bounds ? bounds[1] - bounds[0] : undefined);
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
): Map<string, { depTime: number; routeId: string; dirId: string; serviceId: string; missingDir: boolean; shapeId: string | null; headsign: string | null; routeVariant: string | null }> {
    const { trips, stopTimes } = gtfs;

    const tripFirstDep = new Map<string, number>();
    const tripFirstSeq = new Map<string, number>();

    // Pre-index the last stop of each trip to serve as fallback trip_headsign
    const lastStopByTrip = new Map<string, string>(); // tripId -> stop_id
    const maxSeqByTrip = new Map<string, number>();   // tripId -> max stop_sequence
    for (const st of stopTimes) {
        const seq = parseInt(st.stop_sequence);
        if (Number.isNaN(seq)) continue;
        const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
        if (seq > currentMax) {
            maxSeqByTrip.set(st.trip_id, seq);
            lastStopByTrip.set(st.trip_id, st.stop_id);
        }

        const existing = tripFirstSeq.get(st.trip_id);
        if (existing === undefined || seq < existing) {
            const dep = t2m(st.departure_time) ?? t2m(st.arrival_time);
            if (dep !== null) {
                tripFirstDep.set(st.trip_id, dep);
                tripFirstSeq.set(st.trip_id, seq);
            }
        }
    }

    // Map stopId to stop_name
    const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));

    const freqExpanded = expandFrequencies(gtfs.frequencies, stopTimes);

    const result = new Map<string, { depTime: number; routeId: string; dirId: string; serviceId: string; missingDir: boolean; shapeId: string | null; headsign: string | null; routeVariant: string | null }>();
    for (const trip of trips) {
        let headsign = trip.trip_headsign?.trim() || null;
        if (!headsign) {
            const lastStopId = lastStopByTrip.get(trip.trip_id);
            if (lastStopId) {
                headsign = stopNameById.get(lastStopId) ?? null;
            }
        }

        const tripMeta = {
            routeId: trip.route_id,
            dirId: trip.direction_id?.trim() || '0',
            serviceId: trip.service_id,
            missingDir: !trip.direction_id?.trim(),
            shapeId: trip.shape_id ?? null,
            headsign: headsign,
            routeVariant: trip.route_variant?.trim() || null,
        };

        const freqDeps = freqExpanded.get(trip.trip_id);
        if (freqDeps) {
            // Frequency-based trip: use synthetic departures; stop_times baseDep not required.
            for (let i = 0; i < freqDeps.length; i++) {
                result.set(`${trip.trip_id}__freq_${i}`, { depTime: freqDeps[i], ...tripMeta });
            }
        } else {
            const baseDep = tripFirstDep.get(trip.trip_id);
            if (baseDep === undefined) continue;
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
export function computeRawDepartures(gtfs: GtfsData, referenceDate?: string, shapeFilter?: Map<string, Set<string>>, agencySlug?: string): RawRouteDepartures[] {
    const { routes, calendar, calendarDates } = gtfs;
    if (!routes || !gtfs.trips || !gtfs.stops || !gtfs.stopTimes) return [];

    const routeById = new Map(routes.map(r => [r.route_id, r]));
    const tripData = buildTripDepartures(gtfs);
    const refDate = referenceDate ?? detectReferenceDate(calendar, calendarDates, gtfs.trips);
    const results: RawRouteDepartures[] = [];

    for (const day of ALL_DAYS) {
        const activeServiceIds = getActiveServiceIds(calendar, calendarDates, day, refDate);
        if (activeServiceIds.size === 0) continue;

        const grouped = new Map<string, {
            routeId: string; dirId: string; headsign?: string; shapeId?: string; routeVariant?: string;
            times: number[]; serviceIds: Set<string>; missingDir: boolean;
        }>();

        for (const [, data] of tripData) {
            if (!activeServiceIds.has(data.serviceId)) continue;
            // Split by headsign and physical shape so two branches with the same displayed
            // destination cannot be interleaved into a falsely short frequency.
            const key = (data.headsign)
                ? `${data.routeId}::${data.dirId}::${data.headsign}::${data.shapeId ?? ''}::${data.routeVariant ?? ''}`
                : `${data.routeId}::${data.dirId}::${data.shapeId ?? ''}::${data.routeVariant ?? ''}`;
            const baseKey = `${data.routeId}::${data.dirId}`;
            if (shapeFilter) {
                // Prefer headsign-specific filter when available (handles genuine headsign
                // branches like DRT 905 "A - Windfields Farm" vs "C - Uxbridge"). Falls
                // back to the base routeId::dirId filter for undifferentiated short-turns.
                const headsignKey = data.headsign ? `${baseKey}::${data.headsign}` : null;
                const expected = (headsignKey && shapeFilter.has(headsignKey))
                    ? shapeFilter.get(headsignKey)!
                    : shapeFilter.get(baseKey);
                if (expected && !expected.has(data.shapeId as string)) continue;
            }
            if (!grouped.has(key)) grouped.set(key, {
                routeId: data.routeId,
                dirId: data.dirId,
                headsign: data.headsign || undefined,
                shapeId: data.shapeId || undefined,
                routeVariant: data.routeVariant || undefined,
                times: [],
                serviceIds: new Set(),
                missingDir: false,
            });
            const group = grouped.get(key)!;
            group.times.push(data.depTime);
            group.serviceIds.add(data.serviceId);
            if (data.missingDir) group.missingDir = true;
        }

        for (const [, group] of grouped) {
            const { routeId, dirId, headsign, shapeId, routeVariant } = group;
            const departureTimes = deduplicateDepartures(group.times);
            // #720: one departure is kept; phase 2 draws it as one-off (TARC 99).
            if (departureTimes.length === 0) continue;

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
                headsign,
                routeVariant,
                day,
                routeType,
                modeName: getModeName(routeType),
                railLike: isRailLikeRoute({
                    routeType,
                    routeLongName: route?.route_long_name,
                    routeShortName: route?.route_short_name,
                    agencySlug,
                }),
                shapeId,
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

    // #720: a group with one departure is kept only when its route direction has no group with
    // two or more on any day, so a route whose every pattern runs once a day (TARC 99, coast-rta's
    // TL-1xx trippers) is drawn as one-off, while a stray single trip of a route with a timetable
    // (a short-turn train, a Monday-only template trip) stays out of that route's numbers.
    const timetabled = new Set(results.filter(r => r.departureTimes.length >= 2).map(r => `${r.route}::${r.dir}`));
    return results.filter(r => r.departureTimes.length >= 2 || !timetabled.has(`${r.route}::${r.dir}`));
}
