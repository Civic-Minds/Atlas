/**
 * Batch Phase 1 + Phase 2 stress test across multiple GTFS feeds.
 * Usage: npx tsx scripts/stress-test-tiers.ts /path/to/gtfs-folder/
 * Runs every *.zip in the folder through both analysis phases and prints a
 * tier-distribution summary table so anomalies are easy to spot.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { computeRawDepartures, applyAnalysisCriteria } from '../src/core/transit-logic';
import { GtfsData, GtfsShape, AnalysisCriteria } from '../src/types/gtfs';
import { DEFAULT_CRITERIA } from '../src/core/defaults';

const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, transform: (v: string) => v.trim() });
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
        grouped.get(p.shape_id)!.push({ seq: parseInt(p.shape_pt_sequence) || 0, lat, lon });
    }
    return Array.from(grouped.entries()).map(([id, pts]) => ({
        id,
        points: pts.sort((a, b) => a.seq - b.seq).map(p => [p.lat, p.lon] as [number, number]),
    }));
};

const GTFS_FILES: Record<string, string> = {
    agencies: 'agency.txt', routes: 'routes.txt', trips: 'trips.txt',
    stops: 'stops.txt', stopTimes: 'stop_times.txt', calendar: 'calendar.txt',
    calendarDates: 'calendar_dates.txt', shapes: 'shapes.txt',
    feedInfo: 'feed_info.txt', frequencies: 'frequencies.txt',
};
const OPTIONAL = new Set(['feedInfo', 'shapes', 'calendar', 'calendarDates', 'agencies', 'frequencies']);

async function processZip(zipPath: string): Promise<void> {
    const name = basename(zipPath, '.zip');
    let buf: Buffer;
    try {
        buf = readFileSync(zipPath);
    } catch (e: any) {
        console.log(`\n${name}: ✗ Cannot read file — ${e.message}`);
        return;
    }
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(buf);
    } catch (e: any) {
        console.log(`\n${name}: ✗ Failed to open zip — ${e.message}`);
        return;
    }

    const gtfsData: any = { agencies: [], shapes: [], calendar: [], calendarDates: [], frequencies: [] };
    for (const [key, filename] of Object.entries(GTFS_FILES)) {
        const zipFile = zip.file(filename);
        if (zipFile) {
            const text = await zipFile.async('text');
            const parsed = parseCsv(text);
            gtfsData[key] = key === 'shapes' ? groupShapes(parsed as any[]) : parsed;
        } else if (!OPTIONAL.has(key)) {
            console.log(`\n${name}: ✗ Missing required file ${filename}`);
            return;
        }
    }

    let raw: ReturnType<typeof computeRawDepartures>;
    try {
        raw = computeRawDepartures(gtfsData as GtfsData);
    } catch (e: any) {
        console.log(`\n${name}: ✗ Phase 1 crashed — ${e.message}`);
        return;
    }

    if (raw.length === 0) {
        console.log(`\n${name}: ✗ Phase 1 produced 0 departures`);
        return;
    }

    let results: ReturnType<typeof applyAnalysisCriteria>;
    try {
        results = applyAnalysisCriteria(raw, DEFAULT_CRITERIA);
    } catch (e: any) {
        console.log(`\n${name}: ✗ Phase 2 crashed — ${e.message}`);
        return;
    }

    // Weekday results only, one per route (dir 0)
    const weekday = results.filter(r => r.day === 'Weekday' && r.dir === '0');
    if (weekday.length === 0) {
        console.log(`\n${name}: ✗ Phase 2 produced 0 weekday results`);
        return;
    }

    // Count tiers
    const tierCounts = new Map<string, number>();
    for (const r of weekday) {
        const t = r.tier ?? 'none';
        tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1);
    }

    // Find anomalies: routes with null/undefined tier, or reliability score 0
    const nullTiers = weekday.filter(r => !r.tier).length;
    const zeroReliability = weekday.filter(r => r.reliabilityScore === 0).length;
    const noHeadway = weekday.filter(r => r.avgHeadway == null || isNaN(r.avgHeadway)).length;

    const agency = gtfsData.agencies?.[0]?.agency_name || name;
    // Tiers are stored as numeric strings ('5','8','10','15','20','30','60') plus 'span'/'none'
    const tierOrder = ['5', '8', '10', '15', '20', '30', '60', 'span', 'none'];
    const tierLabels: Record<string, string> = { '5': 'Rapid', '8': 'Freq++', '10': 'Freq+', '15': 'Freq', '20': 'Good', '30': 'Basic', '60': 'Infreq', span: 'span', none: 'none' };
    const tierStr = tierOrder
        .filter(t => tierCounts.has(t))
        .map(t => `${tierLabels[t]}:${tierCounts.get(t)}`)
        .join('  ');

    const anomalyStr = [
        nullTiers > 0 ? `⚠ ${nullTiers} null tiers` : '',
        zeroReliability > 0 ? `⚠ ${zeroReliability} zero-reliability` : '',
        noHeadway > 0 ? `⚠ ${noHeadway} NaN headway` : '',
    ].filter(Boolean).join('  ') || '✓ clean';

    console.log(`\n${agency.padEnd(42)} routes=${String(weekday.length).padStart(3)}  ${tierStr}`);
    console.log(`${''.padEnd(42)} ${anomalyStr}`);

    // Show worst-reliability routes (bottom 3)
    const sorted = [...weekday].filter(r => r.reliabilityScore != null)
        .sort((a, b) => a.reliabilityScore - b.reliabilityScore);
    if (sorted.length > 0) {
        const worst = sorted.slice(0, 3);
        console.log(`  Lowest reliability:`);
        for (const r of worst) {
            const route = gtfsData.routes.find((rt: any) => rt.route_id === r.route);
            const label = route ? `${route.route_short_name || r.route} (${route.route_long_name || ''})`.trim() : r.route;
            console.log(`    ${label.substring(0, 35).padEnd(35)} tier=${String(r.tier).padEnd(6)} reliability=${r.reliabilityScore}%  avgHeadway=${r.avgHeadway?.toFixed(1)}m`);
        }
    }
}

async function main() {
    const folder = process.argv[2] || '/Users/ryan/Desktop/Data/GTFS';
    const zips = readdirSync(folder)
        .filter(f => f.endsWith('.zip'))
        .map(f => join(folder, f))
        .sort();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`ATLAS PHASE 2 STRESS TEST — ${zips.length} feeds from ${folder}`);
    console.log(`${'='.repeat(80)}`);

    for (const zip of zips) {
        await processZip(zip);
    }

    console.log(`\n${'='.repeat(80)}\nDone.\n`);
}

main().catch(console.error);
