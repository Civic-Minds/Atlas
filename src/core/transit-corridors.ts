import { GtfsData, CorridorResult, DayName } from '../types/gtfs';
import { t2m } from './transit-utils';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar';

/**
 * Identifies shared road segments (links) between consecutive stops and
 * calculates aggregate frequency for corridors served by 2+ routes.
 */
export const calculateCorridors = (
    gtfs: GtfsData,
    day: string,
    startTimeMins: number,
    endTimeMins: number,
    referenceDate?: string
): CorridorResult[] => {
    const { trips, stopTimes, calendar, calendarDates } = gtfs;
    const refDate = referenceDate ?? detectReferenceDate(calendar, calendarDates);

    const dayNames: DayName[] = day === 'Weekday'
        ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        : day === 'Saturday' ? ['Saturday'] : ['Sunday'];

    const activeServiceIds = new Set<string>();
    for (const d of dayNames) {
        for (const id of getActiveServiceIds(calendar, calendarDates, d, refDate)) {
            activeServiceIds.add(id);
        }
    }

    const activeTrips = new Set<string>();
    const tripToRoute = new Map<string, string>();
    for (const trip of trips) {
        if (!activeServiceIds.has(trip.service_id)) continue;
        activeTrips.add(trip.trip_id);
        tripToRoute.set(trip.trip_id, trip.route_id);
    }

    const linkMap = new Map<string, { times: number[]; routes: Set<string>; stopA: string; stopB: string }>();
    const tripSequences = new Map<string, typeof stopTimes>();

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
                linkMap.set(linkId, { times: [], routes: new Set(), stopA: stA.stop_id, stopB: stB.stop_id });
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
        for (let i = 1; i < sortedTimes.length; i++) gaps.push(sortedTimes[i] - sortedTimes[i - 1]);

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

        const corrVariance = gaps.length > 1
            ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
            : 0;
        const corrStdDev = Math.sqrt(corrVariance);
        const corrConsistency = avg > 0 ? Math.max(0, 100 - (corrStdDev / avg) * 50) : 0;
        const corrOutlierPenalty = (gaps.filter(g => g > avg * 1.5).length / gaps.length) * 40;
        const corrBunchingFactor = gaps.filter(g => g < avg * 0.25).length / (gaps.length || 1);
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
            reliabilityScore: Math.round(corrReliability),
        });
    }

    return corridorResults.sort((a, b) => a.avgHeadway - b.avgHeadway);
};
