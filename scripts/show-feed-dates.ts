import { readFileSync } from 'fs';
import JSZip from 'jszip';
import Papa from 'papaparse';

const parseCsv = (text: string): any[] =>
    Papa.parse(text, { header: true, skipEmptyLines: true, transform: (v: string) => v.trim() }).data as any[];

async function feedDates(zipPath: string) {
    const buf = readFileSync(zipPath);
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buf); } catch { console.log(`  CORRUPT: ${zipPath}`); return; }

    const name = zipPath.split('/').pop();
    let feedStart = '', feedEnd = '', calMin = '', calMax = '';

    const feedInfoFile = zip.file('feed_info.txt');
    if (feedInfoFile) {
        const rows = parseCsv(await feedInfoFile.async('text'));
        feedStart = rows[0]?.feed_start_date || '';
        feedEnd   = rows[0]?.feed_end_date   || '';
    }

    const calFile = zip.file('calendar.txt');
    if (calFile) {
        const rows = parseCsv(await calFile.async('text'));
        const starts = rows.map((r: any) => r.start_date).filter(Boolean).sort();
        const ends   = rows.map((r: any) => r.end_date).filter(Boolean).sort();
        calMin = starts[0] || ''; calMax = ends[ends.length - 1] || '';
    } else {
        const cdFile = zip.file('calendar_dates.txt');
        if (cdFile) {
            const rows = parseCsv(await cdFile.async('text'));
            const dates = rows.map((r: any) => r.date).filter(Boolean).sort();
            calMin = dates[0] || ''; calMax = dates[dates.length - 1] || '';
        }
    }

    const size = Math.round(buf.length / 1024 / 1024 * 10) / 10;
    console.log(`${name}`);
    console.log(`  Size: ${size} MB`);
    console.log(`  feed_info: ${feedStart || '—'} to ${feedEnd || '—'}`);
    console.log(`  calendar:  ${calMin || '—'} to ${calMax || '—'}`);
}

const paths = process.argv.slice(2);
(async () => { for (const p of paths) await feedDates(p); })();
