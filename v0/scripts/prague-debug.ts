import { readFileSync } from 'fs';
import { parseGtfsZip } from '../src/core/parseGtfs.js';
import { computeRawDepartures } from '../src/core/transit-phase1.js';
import { applyAnalysisCriteria } from '../src/core/transit-phase2.js';
import { DEFAULT_CRITERIA } from '../src/core/defaults.js';
import { detectReferenceDate, getActiveServiceIds } from '../src/core/transit-calendar.js';

async function main() {
    const buf = readFileSync('/Users/ryan/Desktop/Data/GTFS/Europe/Czech Republic/Prague PID Czech.zip');
    const gtfs = await parseGtfsZip(buf as unknown as ArrayBuffer);

    const badRef = detectReferenceDate(gtfs.calendar!, gtfs.calendarDates!);
    const goodRef = '20260320'; // today

    for (const [label, ref] of [['auto (bad)', badRef], ['today (good)', goodRef]] as [string,string][]) {
        const raw = computeRawDepartures(gtfs, ref);
        const results = applyAnalysisCriteria(raw, DEFAULT_CRITERIA);
        const weekday = results.filter(r => r.day === 'Weekday');
        const l992 = weekday.find(r => r.route === 'L992' && r.dir === '0');
        console.log(`\n[${label}] refDate=${ref}`);
        console.log(`  Total weekday routes: ${weekday.length}`);
        console.log(`  L992 weekday dir=0: ${l992 ? l992.tripCount + ' trips, tier=' + l992.tier : 'NOT FOUND'}`);
    }
}
main().catch(console.error);
