/**
 * Quick smoke test: run a real GTFS feed through the pipeline and dump results.
 * Usage: npx tsx scripts/test-gtfs-pipeline.ts /path/to/feed.zip
 */
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures } from '../src/core/transit-logic';
import { GtfsData, GtfsShape } from '../src/types/gtfs';

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
    const zipPath = process.argv[2] || '/tmp/gtfs_test.zip';
    console.log(`\n=== GTFS Pipeline Test: ${zipPath} ===\n`);

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
            console.log(`  ✓ ${filename}: ${parsed.length} records`);
        } else if (!OPTIONAL.has(key)) {
            console.log(`  ✗ ${filename}: MISSING (required)`);
        } else {
            console.log(`  - ${filename}: not present (optional)`);
        }
    }

    // Report frequencies.txt usage
    if (gtfsData.frequencies && gtfsData.frequencies.length > 0) {
        console.log(`\n--- frequencies.txt (${gtfsData.frequencies.length} entries) ---`);
        console.log('  These template trips will be expanded into individual departures.\n');
        for (const f of gtfsData.frequencies) {
            console.log(`    trip=${f.trip_id}  ${f.start_time}–${f.end_time}  every ${f.headway_secs}s (${Math.round(parseInt(f.headway_secs) / 60)}min)`);
        }
        console.log();
    }

    // Feed summary
    console.log(`\n--- Feed Summary ---`);
    console.log(`  Agency: ${gtfsData.agencies?.[0]?.agency_name || 'unknown'}`);
    console.log(`  Routes: ${gtfsData.routes?.length || 0}`);
    console.log(`  Trips: ${gtfsData.trips?.length || 0}`);
    console.log(`  Stop times: ${gtfsData.stopTimes?.length || 0}`);
    console.log(`  Stops: ${gtfsData.stops?.length || 0}`);
    console.log(`  Calendar entries: ${gtfsData.calendar?.length || 0}`);
    console.log(`  Calendar dates: ${gtfsData.calendarDates?.length || 0}`);
    console.log(`  Shapes: ${gtfsData.shapes?.length || 0}`);

    // Run Phase 1
    console.log(`\n--- Phase 1: Raw Departures ---\n`);
    const raw = computeRawDepartures(gtfsData as GtfsData);

    if (raw.length === 0) {
        console.log('  No raw departures produced! Check calendar/service matching.');
        return;
    }

    // Group by route for readable output
    const byRoute = new Map<string, typeof raw>();
    for (const r of raw) {
        const key = `${r.route} dir=${r.dir}`;
        if (!byRoute.has(key)) byRoute.set(key, []);
        byRoute.get(key)!.push(r);
    }

    for (const [routeKey, entries] of byRoute) {
        const routeInfo = gtfsData.routes.find((r: any) => r.route_id === entries[0].route);
        const name = routeInfo ? `${routeInfo.route_short_name || routeInfo.route_id} (${routeInfo.route_long_name || ''})` : routeKey;

        console.log(`  Route: ${name} [${routeKey}]`);

        for (const e of entries) {
            const firstDep = `${Math.floor(e.departureTimes[0] / 60)}:${String(e.departureTimes[0] % 60).padStart(2, '0')}`;
            const lastDep = `${Math.floor(e.departureTimes[e.departureTimes.length - 1] / 60)}:${String(e.departureTimes[e.departureTimes.length - 1] % 60).padStart(2, '0')}`;
            const avgGap = e.gaps.length > 0 ? (e.gaps.reduce((a, b) => a + b, 0) / e.gaps.length).toFixed(1) : 'N/A';

            console.log(`    ${e.day.padEnd(10)} trips=${String(e.tripCount).padStart(3)}  span=${firstDep}–${lastDep}  avgGap=${avgGap}min  services=[${e.serviceIds.join(',')}]`);
            if (e.warnings.length > 0) {
                for (const w of e.warnings) console.log(`      ⚠ ${w}`);
            }
        }
        console.log();
    }

    // Summary of frequency-based routes
    if (gtfsData.frequencies?.length > 0) {
        const freqTrips = new Set(gtfsData.frequencies.map((f: any) => f.trip_id));
        const affectedRoutes = new Set<string>();
        for (const trip of gtfsData.trips) {
            if (freqTrips.has(trip.trip_id)) affectedRoutes.add(trip.route_id);
        }
        console.log(`--- Routes using frequencies.txt (expanded) ---`);
        for (const rid of affectedRoutes) {
            const route = gtfsData.routes.find((r: any) => r.route_id === rid);
            console.log(`  ${route?.route_short_name || rid}: ${route?.route_long_name || ''}`);
        }
    }
}

main().catch(console.error);
