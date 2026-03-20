import { GtfsData, SpacingResult } from '../types/gtfs';
import { computeMedian } from './transit-utils';
import { haversineDistance } from './utils';

/**
 * Calculates stop spacing for a route/direction and identifies redundant
 * stop pairs closer than 400m.
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
    const routeStops = tripStopTimes.map(st => stopMap.get(st.stop_id)).filter(Boolean);
    if (routeStops.length < 2) return null;

    const distances: number[] = [];
    const redundantPairs: SpacingResult['redundantPairs'] = [];
    const RADIUS = 400;

    for (let i = 1; i < routeStops.length; i++) {
        const sA = routeStops[i - 1];
        const sB = routeStops[i];
        if (!sA || !sB) continue;

        const latA = parseFloat(sA.stop_lat);
        const lonA = parseFloat(sA.stop_lon);
        const latB = parseFloat(sB.stop_lat);
        const lonB = parseFloat(sB.stop_lon);
        if (Number.isNaN(latA) || Number.isNaN(lonA) || Number.isNaN(latB) || Number.isNaN(lonB)) continue;

        const dist = haversineDistance(latA, lonA, latB, lonB);
        distances.push(dist);

        if (dist < RADIUS) {
            redundantPairs.push({
                stopA: sA.stop_id,
                stopAName: sA.stop_name,
                stopB: sB.stop_id,
                stopBName: sB.stop_name,
                distance: Math.round(dist),
            });
        }
    }

    if (distances.length === 0) return null;

    return {
        route: routeId,
        direction: directionId,
        avgSpacing: Math.round(distances.reduce((a, b) => a + b, 0) / distances.length),
        medianSpacing: Math.round(computeMedian(distances)),
        totalStops: routeStops.length,
        redundantPairs,
    };
};
