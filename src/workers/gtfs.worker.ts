import JSZip from 'jszip';
import Papa from 'papaparse';

// Direct copy of types from gtfsUtils to avoid import issues in worker context
// if the main module uses things like 'window' or 'environment' variables
export interface GtfsData {
    routes: any[];
    trips: any[];
    stops: any[];
    stopTimes: any[];
    calendar: any[];
    shapes: any[];
    feedInfo?: any;
}

export interface AnalysisResult {
    route: string;
    day: string;
    dir: string;
    avgHeadway: number;
    medianHeadway: number;
    tier: string;
    tripCount: number;
    gaps: number[];
    times: number[];
    reliabilityScore: number;
    headwayVariance: number;
    bunchingFactor: number;
    peakHeadway?: number;
    baseHeadway?: number;
    peakWindow?: { start: number; end: number };
    serviceSpan?: { start: number; end: number };
}

export interface SpacingResult {
    route: string;
    direction: string;
    avgSpacing: number;
    medianSpacing: number;
    totalStops: number;
    redundantPairs: Array<{
        stopA: string;
        stopAName: string;
        stopB: string;
        stopBName: string;
        distance: number;
    }>;
}

export interface CorridorResult {
    linkId: string;
    stopA: string;
    stopB: string;
    routeIds: string[];
    tripCount: number;
    avgHeadway: number;
    peakHeadway: number;
    reliabilityScore: number;
}

const t2m = (s: string): number | null => {
    const p = (s || '').split(':');
    if (p.length < 2) return null;
    return (+p[0]) * 60 + (+p[1]);
};

const computeMedian = (arr: number[]): number => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calculateStopSpacing = (
    gtfs: GtfsData,
    routeId: string,
    directionId: string = '0'
): SpacingResult | null => {
    const { trips, stopTimes, stops } = gtfs;

    const trip = trips.find(t => t.route_id === routeId && (t.direction_id || '0') === directionId);
    if (!trip) return null;

    const tst = stopTimes
        .filter(st => st.trip_id === trip.trip_id)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

    const stopMap = new Map(stops.map(s => [s.stop_id, s]));
    const routeStops = tst.map(st => stopMap.get(st.stop_id)).filter(Boolean);

    if (routeStops.length < 2) return null;

    const distances: number[] = [];
    const redundantPairs: SpacingResult['redundantPairs'] = [];
    const RADIUS = 400;

    for (let i = 1; i < routeStops.length; i++) {
        const sA = routeStops[i - 1];
        const sB = routeStops[i];
        const dist = haversineDistance(
            parseFloat(sA.stop_lat), parseFloat(sA.stop_lon),
            parseFloat(sB.stop_lat), parseFloat(sB.stop_lon)
        );
        distances.push(dist);
        if (dist < RADIUS) {
            redundantPairs.push({
                stopA: sA.stop_id, stopAName: sA.stop_name,
                stopB: sB.stop_id, stopBName: sB.stop_name,
                distance: Math.round(dist)
            });
        }
    }

    return {
        route: routeId,
        direction: directionId,
        avgSpacing: Math.round(distances.reduce((a, b) => a + b, 0) / distances.length),
        medianSpacing: Math.round(computeMedian(distances)),
        totalStops: routeStops.length,
        redundantPairs
    };
};

const determineTier = (headways: number[], tripCount: number, spanMinutes: number): string => {
    const tiers = [10, 15, 20, 30, 60];
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

const calculateTiers = (
    gtfs: GtfsData,
    startTimeMins: number,
    endTimeMins: number
): AnalysisResult[] => {
    const { routes, trips, stopTimes, calendar } = gtfs;

    const routeById = new Map(routes.map(r => [r.route_id, r]));
    const serviceById = new Map(calendar.map(c => [c.service_id, c]));

    const tripDepartures = new Map<string, number>();
    const tripToRouteDir = new Map<string, { routeId: string; dirId: string; serviceId: string }>();

    const tripStopTimes = new Map<string, any[]>();
    for (const st of stopTimes) {
        if (!tripStopTimes.has(st.trip_id)) tripStopTimes.set(st.trip_id, []);
        tripStopTimes.get(st.trip_id)!.push(st);
    }

    for (const trip of trips) {
        const stList = tripStopTimes.get(trip.trip_id);
        if (!stList) continue;

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

    const grouped = new Map<string, number[]>();

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

        // Dynamic Peak Detection (2-hour sliding window)
        let peakHeadway = avg;
        let peakWindow = { start: sortedTimes[0], end: sortedTimes[0] + 120 };
        let maxDensity = 0;

        for (let i = 0; i < sortedTimes.length; i++) {
            const windowStart = sortedTimes[i];
            const windowEnd = windowStart + 120;
            const tripsInWindow = sortedTimes.filter(t => t >= windowStart && t <= windowEnd);

            if (tripsInWindow.length > maxDensity) {
                maxDensity = tripsInWindow.length;
                peakWindow = { start: windowStart, end: windowEnd };

                const peakGaps = [];
                for (let j = 1; j < tripsInWindow.length; j++) {
                    peakGaps.push(tripsInWindow[j] - tripsInWindow[j - 1]);
                }
                peakHeadway = peakGaps.length ? peakGaps.reduce((a, b) => a + b, 0) / peakGaps.length : avg;
            }
        }

        const tier = determineTier(gaps, sortedTimes.length, spanMins);

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
            bunchingFactor: Math.round(bunchingFactor * 100) / 100
        });
    }

    return results;
};

const calculateCorridors = (
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

        let maxTripsInWindow = 0;
        let peakAvg = avg;
        for (let i = 0; i < sortedTimes.length; i++) {
            const end = sortedTimes[i] + 120;
            const windowTrips = sortedTimes.filter(t => t >= sortedTimes[i] && t <= end);
            if (windowTrips.length > maxTripsInWindow) {
                maxTripsInWindow = windowTrips.length;
                const pGaps = [];
                for (let j = 1; j < windowTrips.length; j++) pGaps.push(windowTrips[j] - windowTrips[j - 1]);
                peakAvg = pGaps.length ? pGaps.reduce((a, b) => a + b, 0) / pGaps.length : avg;
            }
        }

        corridorResults.push({
            linkId,
            stopA: data.stopA,
            stopB: data.stopB,
            routeIds: Array.from(data.routes),
            tripCount: sortedTimes.length,
            avgHeadway: Math.round(avg * 10) / 10,
            peakHeadway: Math.round(peakAvg * 10) / 10,
            reliabilityScore: 100
        });
    }

    return corridorResults.sort((a, b) => a.avgHeadway - b.avgHeadway);
};

const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
    });
    return result.data as T[];
};

self.onmessage = async (e) => {
    const { file, startTimeMins, endTimeMins } = e.data;

    try {
        self.postMessage({ type: 'STATUS', message: 'Loading ZIP archive...' });
        const zip = await JSZip.loadAsync(file);

        const files = {
            routes: 'routes.txt',
            trips: 'trips.txt',
            stops: 'stops.txt',
            stopTimes: 'stop_times.txt',
            calendar: 'calendar.txt',
            shapes: 'shapes.txt',
            feedInfo: 'feed_info.txt'
        };

        const gtfsData: Partial<GtfsData> = {
            shapes: []
        };

        for (const [key, filename] of Object.entries(files)) {
            self.postMessage({ type: 'STATUS', message: `Parsing ${filename}...` });
            const zipFile = zip.file(filename);
            if (zipFile) {
                const text = await zipFile.async('text');
                const parsed = parseCsv(text);

                if (key === 'shapes') {
                    const groupedShapes = new Map();
                    (parsed as any[]).forEach(p => {
                        if (!groupedShapes.has(p.shape_id)) groupedShapes.set(p.shape_id, []);
                        groupedShapes.get(p.shape_id).push([
                            parseFloat(p.shape_pt_lat),
                            parseFloat(p.shape_pt_lon)
                        ]);
                    });
                    gtfsData.shapes = Array.from(groupedShapes.entries()).map(([id, points]) => ({
                        id,
                        points
                    }));
                } else {
                    (gtfsData as any)[key] = parsed;
                }
            } else if (key !== 'feedInfo' && key !== 'shapes') {
                throw new Error(`Missing required GTFS file: ${filename}`);
            }
        }

        self.postMessage({ type: 'STATUS', message: 'Calculating frequency tiers...' });
        const results = calculateTiers(gtfsData as GtfsData, startTimeMins, endTimeMins);

        self.postMessage({ type: 'STATUS', message: 'Calculating stop spacing diagnostics...' });
        const spacingResults: SpacingResult[] = [];
        const checkedRoutes = new Set<string>();

        for (const res of results) {
            const key = `${res.route}::${res.dir}`;
            if (!checkedRoutes.has(key)) {
                const spacing = calculateStopSpacing(gtfsData as GtfsData, res.route, res.dir);
                if (spacing) spacingResults.push(spacing);
                checkedRoutes.add(key);
            }
        }

        self.postMessage({
            type: 'DONE',
            gtfsData: gtfsData,
            analysisResults: results,
            spacingResults
        });

    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown worker error'
        });
    }
};
