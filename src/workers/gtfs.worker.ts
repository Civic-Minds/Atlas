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
        const tier = determineTier(gaps, sortedTimes.length, spanMins);

        const variance = gaps.length > 1
            ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
            : 0;
        const stdDev = Math.sqrt(variance);

        // Penalize gaps that are > 1.5x the average
        const significantGaps = gaps.filter(g => g > avg * 1.5).length;
        const outlierPenalty = gaps.length > 0 ? (significantGaps / gaps.length) * 50 : 0;

        // Base consistency (0-100) - coefficient of variation approach
        const consistency = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 80) : 0;

        // Final score combines consistency and outlier penalty
        const reliability = Math.max(0, consistency - outlierPenalty);

        results.push({
            route: routeId,
            day,
            dir: dirId,
            avgHeadway: avg,
            medianHeadway: median,
            tier,
            tripCount: sortedTimes.length,
            gaps,
            times: sortedTimes,
            reliabilityScore: Math.round(reliability),
            headwayVariance: Math.round(variance * 10) / 10
        });
    }

    return results;
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

        self.postMessage({
            type: 'DONE',
            gtfsData: gtfsData,
            analysisResults: results
        });

    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown worker error'
        });
    }
};
