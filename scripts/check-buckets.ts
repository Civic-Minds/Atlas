
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures, applyAnalysisCriteria } from '../src/core/transit-logic';
import { GtfsData, GtfsShape, AnalysisCriteria } from '../src/types/gtfs';

const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return result.data as T[];
};

const groupShapes = (parsed: any[]): GtfsShape[] => {
    const grouped = new Map<string, { seq: number; lat: number; lon: number }[]>();
    for (const p of parsed) {
        if (!p.shape_id) continue;
        const lat = parseFloat(p.shape_pt_lat);
        const lon = parseFloat(p.shape_pt_lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
        if (!grouped.has(p.shape_id)) grouped.set(p.shape_id, []);
        grouped.get(p.shape_id)!.push({
            seq: parseInt(p.shape_pt_sequence) || 0, lat, lon,
        });
    }
    return Array.from(grouped.entries()).map(([id, pts]) => ({
        id,
        points: pts.sort((a, b) => a.seq - b.seq).map(p => [p.lat, p.lon] as [number, number]),
    }));
};

const GTFS_FILES: Record<string, string> = {
    agencies: 'agency.txt',
    routes: 'routes.txt',
    trips: 'trips.txt',
    stops: 'stops.txt',
    stopTimes: 'stop_times.txt',
    calendar: 'calendar.txt',
    calendarDates: 'calendar_dates.txt',
    shapes: 'shapes.txt',
    feedInfo: 'feed_info.txt',
    frequencies: 'frequencies.txt',
};

const OPTIONAL = new Set(['feedInfo', 'shapes', 'calendar', 'calendarDates', 'agencies', 'frequencies']);

async function main() {
    const zipPath = process.argv[2];
    if (!zipPath) {
        console.error('Usage: npx tsx scripts/check-buckets.ts <path-to-gtfs.zip>');
        process.exit(1);
    }

    const buf = readFileSync(zipPath);
    const zip = await JSZip.loadAsync(buf);

    const gtfsData: any = { agencies: [], shapes: [], calendarDates: [], frequencies: [] };

    for (const [key, filename] of Object.entries(GTFS_FILES)) {
        const zipFile = zip.file(filename);
        if (zipFile) {
            const text = await zipFile.async('text');
            const parsed = parseCsv(text);
            if (key === 'shapes') {
                gtfsData.shapes = groupShapes(parsed as any[]);
            } else {
                gtfsData[key] = parsed;
            }
        }
    }

    const raw = computeRawDepartures(gtfsData as GtfsData);
    
    // Default criteria as per Verifier
    const criteria: AnalysisCriteria = {
        id: 'default',
        name: 'Standard Audit',
        dayTypes: {
            Weekday: { timeWindow: { start: 420, end: 1200 }, tiers: [10, 15, 20, 30, 60] }, // 7am - 8pm
            Saturday: { timeWindow: { start: 480, end: 1200 }, tiers: [10, 15, 20, 30, 60] }, // 8am - 8pm
            Sunday: { timeWindow: { start: 480, end: 1200 }, tiers: [10, 15, 20, 30, 60] },
        },
        graceMinutes: 5,
        maxGraceViolations: 2
    };

    const results = applyAnalysisCriteria(raw, criteria);

    const targetRoutes = ['72', 'FX2', '6', '200', '194'];
    
    console.log('\n=== TIER (BUCKET) ANALYSIS ===\n');
    for (const routeId of targetRoutes) {
        const routeResults = results.filter(r => r.route === routeId && r.day === 'Weekday');
        if (routeResults.length === 0) continue;

        const routeInfo = gtfsData.routes.find((r: any) => r.route_id === routeId);
        console.log(`Route: ${routeInfo?.route_short_name || routeId} (${routeInfo?.route_long_name || ''})`);
        
        for (const r of routeResults) {
            const bucketLabel = r.tier === 'span' ? 'Non-Frequent / Span Only' : `${r.tier}-min Frequent`;
            console.log(`  Dir ${r.dir}: Bucket = [ ${bucketLabel} ]`);
            console.log(`    - Avg Headway: ${r.avgHeadway.toFixed(1)}m`);
            console.log(`    - Peak Headway: ${r.peakHeadway?.toFixed(1) || 'N/A'}m`);
            console.log(`    - Reliability: ${r.reliabilityScore}%`);
            console.log(`    - Warnings: ${r.warnings?.join(', ') || 'None'}`);
        }
        console.log();
    }
}

main().catch(console.error);
