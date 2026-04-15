import { PopulationPoint, CoverageResult, CatalogRoute } from '../types/gtfs';
import { haversineDistance } from './utils';

/**
 * Calculates transit coverage for a given set of population points and analyzed routes.
 * A population point is "covered" if it is within bufferMeters of a stop on a route 
 * that meets the frequency criteria.
 */
export function calculateCoverage(
    points: PopulationPoint[],
    routes: CatalogRoute[],
    bufferMeters: number = 800 // ~10 min walk
): CoverageResult {
    let coveredPopulation = 0;
    let totalPopulation = 0;

    // 1. Get all stops from the "frequent" routes
    // For now, CatalogRoute has a 'shape' but not 'stops'.
    // We might need to handle this differently if we only have shapes.
    // Let's assume for Equity-Lite that we check proximity to the ROUTE SHAPE.
    
    const coveredStatus = new Array(points.length).fill(false);

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        totalPopulation += p.count;

        // Check proximity to any route shape
        for (const route of routes) {
            if (coveredStatus[i]) break; // Already covered

            // Check each point in the route shape
            for (const [lat, lon] of route.shape) {
                const dist = haversineDistance(p.lat, p.lon, lat, lon);
                if (dist <= bufferMeters) {
                    coveredStatus[i] = true;
                    coveredPopulation += p.count;
                    break;
                }
            }
        }
    }

    return {
        totalPopulation,
        coveredPopulation,
        percentCovered: totalPopulation > 0 ? (coveredPopulation / totalPopulation) * 100 : 0
    };
}

/**
 * Parses a simple CSV of population points.
 * Expected format: id,lat,lon,count,[tags...]
 */
export function parsePopulationCsv(csvText: string): PopulationPoint[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const latIdx = headers.indexOf('lat');
    const lonIdx = headers.indexOf('lon');
    const countIdx = headers.indexOf('count');
    const idIdx = headers.indexOf('id');

    if (latIdx === -1 || lonIdx === -1 || countIdx === -1) {
        throw new Error('Population CSV must contain lat, lon, and count columns.');
    }

    const points: PopulationPoint[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 3) continue;

        points.push({
            id: idIdx !== -1 ? cols[idIdx] : `p-${i}`,
            lat: parseFloat(cols[latIdx]),
            lon: parseFloat(cols[lonIdx]),
            count: parseInt(cols[countIdx]) || 0
        });
    }

    return points;
}
