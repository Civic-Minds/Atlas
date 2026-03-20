/**
 * accuracy-snapshot.ts — benchmark route yield for the Atlas GTFS pipeline.
 *
 * Runs benchmark feeds and reports % of routes that produce any departures.
 * Route yield = routesWithDepartures / totalRoutes.
 * NOTE: measures whether the pipeline produces output, not whether that output
 * is correct. Use manual spot-checks against trips.txt for correctness.
 *
 * Usage:
 *   npx tsx scripts/accuracy-snapshot.ts           → JSON to stdout
 *   npx tsx scripts/accuracy-snapshot.ts --compare → compare vs /tmp/atlas-snapshot-before.json
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures } from '../src/core/transit-logic';
import { GtfsData, GtfsShape } from '../src/types/gtfs';

const BENCHMARKS = [
    { name: 'York Region Transit',  path: '/Users/ryan/Desktop/Data/GTFS/Canada/Ontario/York Region Transit.zip' },
    { name: 'Phoenix Valley Metro', path: '/Users/ryan/Desktop/Data/GTFS/United States/Arizona/Phoenix Valley Metro.zip' },
    { name: 'Calgary Transit',      path: '/Users/ryan/Desktop/Data/GTFS/Canada/Alberta/Calgary Transit.zip' },
    { name: 'Spokane Transit',      path: '/Users/ryan/Desktop/Data/GTFS/United States/Washington/Spokane Transit.zip' },
] as const;

type BenchmarkResult = {
    name: string;
    totalRoutes: number;
    routesWithDepartures: number;
    routeYield: number;
    status: 'ok' | 'crashed' | 'empty';
    error?: string;
};

const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse<T>(text, { header: true, skipEmptyLines: true, transform: (v: string) => v.trim() });
    return result.data;
};

const groupShapes = (parsed: any[]): GtfsShape[] => {
    const grouped = new Map<string, { seq: number; lat: number; lon: number }[]>();
    for (const p of parsed) {
        if (!p.shape_id) continue;
        const lat = parseFloat(p.shape_pt_lat);
        const lon = parseFloat(p.shape_pt_lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
        if (!grouped.has(p.shape_id)) grouped.set(p.shape_id, []);
        grouped.get(p.shape_id)!.push({ seq: parseInt(p.shape_pt_sequence) || 0, lat, lon });
    }
    return Array.from(grouped.entries()).map(([id, pts]) => ({
        id,
        points: pts.sort((a, b) => a.seq - b.seq).map(p => [p.lat, p.lon] as [number, number]),
    }));
};

async function runBenchmark(name: string, zipPath: string): Promise<BenchmarkResult> {
    try {
        const buf = readFileSync(zipPath);
        const zip = await JSZip.loadAsync(buf);

        const readFile = async (filename: string, optional = false): Promise<string | null> => {
            const f = zip.file(filename);
            if (!f && !optional) throw new Error(`Missing required file: ${filename}`);
            return f ? f.async('text') : null;
        };

        const gtfsData: any = { agencies: [], shapes: [], calendar: [], calendarDates: [], frequencies: [] };

        gtfsData.routes    = parseCsv(await readFile('routes.txt') as string);
        gtfsData.trips     = parseCsv(await readFile('trips.txt') as string);
        gtfsData.stops     = parseCsv(await readFile('stops.txt') as string);
        gtfsData.stopTimes = parseCsv(await readFile('stop_times.txt') as string);

        const calText = await readFile('calendar.txt', true);
        if (calText) gtfsData.calendar = parseCsv(calText);

        const calDatesText = await readFile('calendar_dates.txt', true);
        if (calDatesText) gtfsData.calendarDates = parseCsv(calDatesText);

        const freqText = await readFile('frequencies.txt', true);
        if (freqText) gtfsData.frequencies = parseCsv(freqText);

        const shapesText = await readFile('shapes.txt', true);
        if (shapesText) gtfsData.shapes = groupShapes(parseCsv(shapesText as string));

        const agencyText = await readFile('agency.txt', true);
        if (agencyText) gtfsData.agencies = parseCsv(agencyText);

        const totalRoutes = gtfsData.routes.length;
        if (totalRoutes === 0) {
            return { name, totalRoutes: 0, routesWithDepartures: 0, routeYield: 0, status: 'empty' };
        }

        const raw = computeRawDepartures(gtfsData as GtfsData);
        const routesWithDepsSet = new Set(raw.filter(r => r.tripCount > 0).map(r => r.route));
        const routesWithDepartures = routesWithDepsSet.size;
        const routeYield = parseFloat(((routesWithDepartures / totalRoutes) * 100).toFixed(2));

        return { name, totalRoutes, routesWithDepartures, routeYield, status: 'ok' };
    } catch (err: any) {
        return { name, totalRoutes: 0, routesWithDepartures: 0, routeYield: 0, status: 'crashed', error: String(err.message) };
    }
}

async function main() {
    const isCompare = process.argv.includes('--compare');
    const BEFORE_FILE = '/tmp/atlas-snapshot-before.json';

    process.stderr.write(`Running ${BENCHMARKS.length} benchmark feeds...\n`);

    const results: BenchmarkResult[] = [];
    for (const b of BENCHMARKS) {
        process.stderr.write(`  ${b.name}...\n`);
        results.push(await runBenchmark(b.name, b.path));
    }

    const totalRoutes = results.reduce((s, r) => s + r.totalRoutes, 0);
    const totalWithDeps = results.reduce((s, r) => s + r.routesWithDepartures, 0);
    const overallRouteYield = totalRoutes > 0
        ? parseFloat(((totalWithDeps / totalRoutes) * 100).toFixed(2))
        : 0;

    let gitHash = 'unknown';
    try {
        gitHash = execSync('git rev-parse --short HEAD', {
            cwd: '/Users/ryan/Desktop/Mag/Tools/Atlas',
            encoding: 'utf8',
        }).trim();
    } catch {}

    if (isCompare) {
        if (!existsSync(BEFORE_FILE)) {
            console.error('No before snapshot found at', BEFORE_FILE);
            process.exit(1);
        }
        const before = JSON.parse(readFileSync(BEFORE_FILE, 'utf8'));
        console.log('\n=== Route Yield Comparison ===');
        console.log(`Before: ${before.overallRouteYield}%  (git ${before.gitHash})  ->  After: ${overallRouteYield}%  (git ${gitHash})\n`);
        for (const after of results) {
            const bef = before.benchmarks.find((b: BenchmarkResult) => b.name === after.name);
            if (!bef) { console.log(`  ${after.name}: NEW  ${after.routeYield}%`); continue; }
            const delta = (after.routeYield - bef.routeYield).toFixed(2);
            const arrow = after.routeYield > bef.routeYield ? 'UP' : after.routeYield < bef.routeYield ? 'DOWN' : '=';
            const statusNote = after.status !== 'ok' ? ` [${after.status}${after.error ? ': ' + after.error : ''}]` : '';
            console.log(`  ${after.name.padEnd(25)} ${String(bef.routeYield).padStart(6)}% -> ${String(after.routeYield).padStart(6)}%  ${arrow} ${delta}%  (${after.routesWithDepartures}/${after.totalRoutes} routes)${statusNote}`);
        }
        const overallDelta = (overallRouteYield - before.overallRouteYield).toFixed(2);
        const overallArrow = overallRouteYield > before.overallRouteYield ? 'UP' : overallRouteYield < before.overallRouteYield ? 'DOWN' : '=';
        console.log(`\n  OVERALL: ${before.overallRouteYield}% -> ${overallRouteYield}%  ${overallArrow} ${overallDelta}%\n`);
    } else {
        const snapshot = {
            timestamp: new Date().toISOString(),
            gitHash,
            overallRouteYield,
            totalRoutes,
            totalWithDepartures: totalWithDeps,
            benchmarks: results,
        };
        console.log(JSON.stringify(snapshot, null, 2));
    }
}

main().catch(console.error);
