import { readFileSync } from 'fs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { detectReferenceDate, getActiveServiceIds } from '../src/core/transit-logic';

const parseCsv = (text: string): any[] =>
    Papa.parse(text, { header: true, skipEmptyLines: true, transform: (v: string) => v.trim() }).data as any[];

async function main() {
    const buf = readFileSync('/Users/ryan/Desktop/Data/GTFS/New Zealand/Wellington Metlink NZ.zip');
    const zip = await JSZip.loadAsync(buf);

    const calText = await zip.file('calendar.txt')!.async('text');
    const cdText = await zip.file('calendar_dates.txt')!.async('text');
    const cal = parseCsv(calText);
    const cd = parseCsv(cdText);

    // Sample calendar
    console.log('Calendar sample (first 5):');
    for (const e of cal.slice(0, 5)) console.log(' ', JSON.stringify(e));
    
    // What start_dates are there?
    const starts = [...new Set(cal.map((e: any) => e.start_date))].sort();
    const ends = [...new Set(cal.map((e: any) => e.end_date))].sort();
    console.log('\nDistinct start_dates:', starts.slice(0, 10));
    console.log('Distinct end_dates:', ends.slice(0, 10));

    const refDate = detectReferenceDate(cal, cd);
    console.log('\ndetectReferenceDate =', refDate);

    const activeMonday = getActiveServiceIds(cal, cd, 'Monday', refDate);
    const activeTuesday = getActiveServiceIds(cal, cd, 'Tuesday', refDate);
    console.log('Active service IDs for Monday:', activeMonday.size, '(first 5:', [...activeMonday].slice(0, 5), ')');
    console.log('Active service IDs for Tuesday:', activeTuesday.size);
    
    // Try a nearby date explicitly
    for (const testDate of ['20260317', '20260318', '20260319', '20260320']) {
        const ids = getActiveServiceIds(cal, cd, 'Monday', testDate);
        console.log(`  With refDate=${testDate}: Monday active=${ids.size}`);
    }
}
main().catch(console.error);
