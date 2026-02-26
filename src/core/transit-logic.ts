import { haversineDistance } from './utils';
import {
    GtfsData,
    AnalysisResult,
    CorridorResult,
    SpacingResult
} from '../types/gtfs';

/**
 * Converts HH:MM:SS string to minutes from beginning of day
 */
export const t2m = (s: string): number | null => {
    const p = (s || '').split(':');
    if (p.length < 2) return null;
    return (+p[0]) * 60 + (+p[1]);
};

/**
 * Converts minutes from beginning of day to HH:MM string
 */
export const m2t = (m: number): string => {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return `${String(h).padStart(2, '0')}:${mm}`;
};

/**
 * Computes the median of an array of numbers
 */
export const computeMedian = (arr: number[]): number => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * GTFS route_type mode mapping
 * See: https://gtfs.org/schedule/reference/#routestxt
 */
const MODE_MAP: Record<string, string> = {
    '0': 'Tram/Light Rail',
    '1': 'Subway/Metro',
    '2': 'Commuter Rail',
    '3': 'Bus',
    '4': 'Ferry',
    '5': 'Cable Tram',
    '6': 'Gondola',
    '7': 'Funicular',
    '11': 'Trolleybus',
    '12': 'Monorail',
};

export const getModeName = (routeType: string): string =>
    MODE_MAP[routeType] || 'Transit';

/**
 * Mode-aware tier thresholds.
 * Rail modes use tighter thresholds because riders expect higher frequency
 * on fixed-guideway services.
 */
const MODE_TIERS: Record<string, number[]> = {
    rail: [5, 8, 10, 15, 30],   // subway, metro, commuter rail
    surface: [10, 15, 20, 30, 60], // bus, tram, trolleybus, ferry, etc.
};

function getTiersForMode(routeType: string): number[] {
    const railTypes = new Set(['1', '2']); // subway + commuter rail
    return railTypes.has(routeType) ? MODE_TIERS.rail : MODE_TIERS.surface;
}

/**
 * Determines the frequency tier for a route based on headway analysis.
 * Accepts an optional custom tiers array for mode-aware thresholding.
 */
export const determineTier = (
    headways: number[],
    tripCount: number,
    spanMinutes: number,
    tiers: number[] = [10, 15, 20, 30, 60]
): string => {
    const GRACE = 5;
    const MAX_GRACE_COUNT = 2;

    for (const T of tiers) {
        const minTrips = Math.ceil(spanMinutes / T);
        if (tripCount < minTrips) continue;

        let graceCount = 0;
        let fail = false;
        for (const h of headways) {
            if (h <= T) continue;
            if (h <= T + GRACE) {
                graceCount++;
                if (graceCount > MAX_GRACE_COUNT) { fail = true; break; }
            } else {
                fail = true; break;
            }
        }
        if (!fail) return String(T);
    }

    return 'span';
};

/**
 * Analyzes GTFS data to calculate frequency tiers for all routes/directions/days
 */
export const calculateTiers = (
    gtfs: GtfsData,
    startTimeMins: number,
    endTimeMins: number
): AnalysisResult[] => {
    const { routes, trips, stopTimes, calendar } = gtfs;

    const serviceById = new Map(calendar.map(c => [c.service_id, c]));
    const routeById = new Map(routes.map(r => [r.route_id, r]));

    // 1. Get origin departure per trip
    const tripDepartures = new Map<string, number>();
    const tripToRouteDir = new Map<string, { routeId: string; dirId: string; serviceId: string }>();

    // Efficiently find first stop for each trip
    const tripStopTimes = new Map<string, any[]>();
    for (const st of stopTimes) {
        if (!tripStopTimes.has(st.trip_id)) tripStopTimes.set(st.trip_id, []);
        tripStopTimes.get(st.trip_id)!.push(st);
    }

    for (const trip of trips) {
        const stList = tripStopTimes.get(trip.trip_id);
        if (!stList) continue;

        // Find earliest stop sequence
        const firstStop = stList.reduce((prev, curr) =>
            parseInt(curr.stop_sequence) < parseInt(prev.stop_sequence) ? curr : prev
        );

        const depTime = t2m(firstStop.departure_time);
        if (depTime !== null && depTime >= startTimeMins && depTime <= endTimeMins) {
            tripDepartures.set(trip.trip_id, depTime);
            tripToRouteDir.set(trip.trip_id, {
                routeId: trip.route_id,
                dirId: trip.direction_id || '0',
                serviceId: trip.service_id
            });
        }
    }

    // 2. Group departures by Route, Day, Direction
    const grouped = new Map<string, number[]>(); // "routeId::day::dirId" -> [times]

    for (const [tripId, time] of tripDepartures.entries()) {
        const meta = tripToRouteDir.get(tripId)!;
        const service = serviceById.get(meta.serviceId);
        if (!service) continue;

        const days = [];
        const isWeekday = service.monday === '1' || service.tuesday === '1' ||
            service.wednesday === '1' || service.thursday === '1' || service.friday === '1';
        if (isWeekday) days.push('Weekday');
        if (service.saturday === '1') days.push('Saturday');
        if (service.sunday === '1') days.push('Sunday');

        for (const day of days) {
            const key = `${meta.routeId}::${day}::${meta.dirId}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(time);
        }
    }

    // 3. Analyze each group
    const results: AnalysisResult[] = [];
    const spanMins = endTimeMins - startTimeMins;

    for (const [key, times] of grouped.entries()) {
        const [routeId, day, dirId] = key.split('::');
        const sortedTimes = Array.from(new Set(times)).sort((a, b) => a - b);

        const gaps: number[] = [];
        for (let i = 1; i < sortedTimes.length; i++) {
            const gap = sortedTimes[i] - sortedTimes[i - 1];
            if (gap >= 2 && gap <= 240) gaps.push(gap);
        }

        if (sortedTimes.length < 2) continue;

        const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
        const median = computeMedian(gaps);

        // 4. Dynamic Peak Detection (2-hour sliding window) — O(n) two-pointer
        let peakHeadway = avg;
        let peakWindow = { start: sortedTimes[0], end: sortedTimes[0] + 120 };
        let maxDensity = 0;
        let right = 0;

        for (let left = 0; left < sortedTimes.length; left++) {
            const windowEnd = sortedTimes[left] + 120;
            while (right < sortedTimes.length && sortedTimes[right] <= windowEnd) right++;
            const count = right - left;

            if (count > maxDensity) {
                maxDensity = count;
                peakWindow = { start: sortedTimes[left], end: windowEnd };

                // Calculate headway within this peak window
                const peakGaps = [];
                for (let j = left + 1; j < right; j++) {
                    peakGaps.push(sortedTimes[j] - sortedTimes[j - 1]);
                }
                peakHeadway = peakGaps.length ? peakGaps.reduce((a, b) => a + b, 0) / peakGaps.length : avg;
            }
        }

        const route = routeById.get(routeId);
        const routeType = route?.route_type || '3'; // default to bus
        const modeTiers = getTiersForMode(routeType);
        const tier = determineTier(gaps, sortedTimes.length, spanMins, modeTiers);

        // Calculate Reliability Score (0-100)
        const variance = gaps.length > 1
            ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
            : 0;
        const stdDev = Math.sqrt(variance);

        const significantGaps = gaps.filter(g => g > avg * 1.5).length;
        const outlierPenalty = (significantGaps / gaps.length) * 40;

        const bunchedGaps = gaps.filter(g => g < avg * 0.25).length;
        const bunchingFactor = bunchedGaps / (gaps.length || 1);
        const bunchingPenalty = bunchingFactor * 60;

        const consistency = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 50) : 0;
        const reliability = Math.max(0, consistency - outlierPenalty - bunchingPenalty);

        results.push({
            route: routeId,
            day,
            dir: dirId,
            avgHeadway: avg,
            medianHeadway: median,
            peakHeadway: Math.round(peakHeadway * 10) / 10,
            baseHeadway: Math.round(avg * 10) / 10,
            peakWindow,
            serviceSpan: { start: sortedTimes[0], end: sortedTimes[sortedTimes.length - 1] },
            tier,
            tripCount: sortedTimes.length,
            gaps,
            times: sortedTimes,
            reliabilityScore: Math.round(reliability),
            headwayVariance: Math.round(variance * 10) / 10,
            bunchingFactor: Math.round(bunchingFactor * 100) / 100,
            routeType,
            modeName: getModeName(routeType),
        });
    }

    return results;
};

/**
 * Identifies shared road segments (links) and calculates aggregate frequency.
 */
export const calculateCorridors = (
    gtfs: GtfsData,
    day: string,
    startTimeMins: number,
    endTimeMins: number
): CorridorResult[] => {
    const { trips, stopTimes, calendar } = gtfs;
    const serviceById = new Map(calendar.map(c => [c.service_id, c]));

    const activeTrips = new Set<string>();
    const tripToRoute = new Map<string, string>();

    for (const trip of trips) {
        const service = serviceById.get(trip.service_id);
        if (!service) continue;

        const isMatch = (day === 'Weekday' && service.monday === '1') ||
            (day === 'Saturday' && service.saturday === '1') ||
            (day === 'Sunday' && service.sunday === '1');

        if (isMatch) {
            activeTrips.add(trip.trip_id);
            tripToRoute.set(trip.trip_id, trip.route_id);
        }
    }

    const linkMap = new Map<string, { times: number[], routes: Set<string>, stopA: string, stopB: string }>();

    const tripSequences = new Map<string, any[]>();
    for (const st of stopTimes) {
        if (!activeTrips.has(st.trip_id)) continue;
        if (!tripSequences.has(st.trip_id)) tripSequences.set(st.trip_id, []);
        tripSequences.get(st.trip_id)!.push(st);
    }

    for (const [tripId, sequence] of tripSequences.entries()) {
        const sortedSeq = sequence.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
        const routeId = tripToRoute.get(tripId)!;

        for (let i = 0; i < sortedSeq.length - 1; i++) {
            const stA = sortedSeq[i];
            const stB = sortedSeq[i + 1];
            const depTime = t2m(stA.departure_time);

            if (depTime === null || depTime < startTimeMins || depTime > endTimeMins) continue;

            const linkId = `${stA.stop_id}->${stB.stop_id}`;
            if (!linkMap.has(linkId)) {
                linkMap.set(linkId, {
                    times: [],
                    routes: new Set(),
                    stopA: stA.stop_id,
                    stopB: stB.stop_id
                });
            }

            const linkData = linkMap.get(linkId)!;
            linkData.times.push(depTime);
            linkData.routes.add(routeId);
        }
    }

    const corridorResults: CorridorResult[] = [];
    for (const [linkId, data] of linkMap.entries()) {
        if (data.routes.size < 2) continue;

        const sortedTimes = Array.from(new Set(data.times)).sort((a, b) => a - b);
        if (sortedTimes.length < 2) continue;

        const gaps: number[] = [];
        for (let i = 1; i < sortedTimes.length; i++) {
            gaps.push(sortedTimes[i] - sortedTimes[i - 1]);
        }

        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

        // O(n) two-pointer peak detection
        let maxTripsInWindow = 0;
        let peakAvg = avg;
        let rPtr = 0;
        for (let lPtr = 0; lPtr < sortedTimes.length; lPtr++) {
            const end = sortedTimes[lPtr] + 120;
            while (rPtr < sortedTimes.length && sortedTimes[rPtr] <= end) rPtr++;
            const count = rPtr - lPtr;
            if (count > maxTripsInWindow) {
                maxTripsInWindow = count;
                const pGaps = [];
                for (let j = lPtr + 1; j < rPtr; j++) pGaps.push(sortedTimes[j] - sortedTimes[j - 1]);
                peakAvg = pGaps.length ? pGaps.reduce((a, b) => a + b, 0) / pGaps.length : avg;
            }
        }

        // Calculate actual reliability score for this corridor
        const corrVariance = gaps.length > 1
            ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
            : 0;
        const corrStdDev = Math.sqrt(corrVariance);
        const corrConsistency = avg > 0 ? Math.max(0, 100 - (corrStdDev / avg) * 50) : 0;
        const corrSignificantGaps = gaps.filter(g => g > avg * 1.5).length;
        const corrOutlierPenalty = (corrSignificantGaps / gaps.length) * 40;
        const corrBunchedGaps = gaps.filter(g => g < avg * 0.25).length;
        const corrBunchingFactor = corrBunchedGaps / (gaps.length || 1);
        const corrBunchingPenalty = corrBunchingFactor * 60;
        const corrReliability = Math.max(0, corrConsistency - corrOutlierPenalty - corrBunchingPenalty);

        corridorResults.push({
            linkId,
            stopA: data.stopA,
            stopB: data.stopB,
            routeIds: Array.from(data.routes),
            tripCount: sortedTimes.length,
            avgHeadway: Math.round(avg * 10) / 10,
            peakHeadway: Math.round(peakAvg * 10) / 10,
            reliabilityScore: Math.round(corrReliability)
        });
    }

    return corridorResults.sort((a, b) => a.avgHeadway - b.avgHeadway);
};

/**
 * Calculates stop spacing and identifies redundant pairs.
 */
export const calculateStopSpacing = (
    gtfs: GtfsData,
    routeId: string,
    directionId: string = '0'
): SpacingResult | null => {
    const { trips, stopTimes, stops } = gtfs;

    const trip = trips.find(t => t.route_id === routeId && (t.direction_id || '0') === directionId);
    if (!trip) return null;

    const tripStopTimes = stopTimes
        .filter(st => st.trip_id === trip.trip_id)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

    const stopMap = new Map(stops.map(s => [s.stop_id, s]));
    const routeStops = tripStopTimes
        .map(st => stopMap.get(st.stop_id))
        .filter(Boolean);

    if (routeStops.length < 2) return null;

    const distances: number[] = [];
    const redundantPairs: SpacingResult['redundantPairs'] = [];
    const RADIUS = 400; // Redundancy threshold in meters

    for (let i = 1; i < routeStops.length; i++) {
        const sA = routeStops[i - 1];
        const sB = routeStops[i];
        if (!sA || !sB) continue;

        const dist = haversineDistance(
            parseFloat(sA.stop_lat),
            parseFloat(sA.stop_lon),
            parseFloat(sB.stop_lat),
            parseFloat(sB.stop_lon)
        );

        distances.push(dist);

        if (dist < RADIUS) {
            redundantPairs.push({
                stopA: sA.stop_id,
                stopAName: sA.stop_name,
                stopB: sB.stop_id,
                stopBName: sB.stop_name,
                distance: Math.round(dist)
            });
        }
    }

    const avgSpacing = distances.reduce((a, b) => a + b, 0) / distances.length;
    const medianSpacing = computeMedian(distances);

    return {
        route: routeId,
        direction: directionId,
        avgSpacing: Math.round(avgSpacing),
        medianSpacing: Math.round(medianSpacing),
        totalStops: routeStops.length,
        redundantPairs
    };
};
