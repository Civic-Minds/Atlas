/**
 * #1251: refresh's check that a downloaded source is a usable GTFS zip before it is picked. Toronto's open-data link
 * began serving a 22-byte empty zip; refresh took it as the first usable source (an undated zip never reads as
 * expired) and TTC sat on its last timetable for two months. A rejected source falls through to the next one.
 */
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';

function findEntry(zip: JSZip, name: string): JSZip.JSZipObject | null {
  return zip.file(name) ?? zip.file(Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '') ?? null;
}

/** True when the file has a data row after its header, read from the start of the entry only (stop_times is large). */
async function hasDataRow(entry: JSZip.JSZipObject): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let text = '';
    let done = false;
    const stream = entry.nodeStream('nodebuffer');
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      // Stop decompressing: one row is all the check needs.
      (stream as unknown as { pause?: () => void }).pause?.();
      resolve(value);
    };
    stream.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
      if (text.split(/\r?\n/).filter(line => line.trim() !== '').length >= 2) finish(true);
    });
    stream.on('end', () => finish(text.split(/\r?\n/).filter(line => line.trim() !== '').length >= 2));
    stream.on('error', error => { if (!done) { done = true; reject(error); } });
  });
}

/**
 * Why a downloaded source can't be used as a GTFS feed, or null when it can: not a zip, unreadable, no stop_times
 * rows, or no service dates (no calendar.txt or calendar_dates.txt rows). Expiry is judged separately.
 */
export async function feedZipProblem(buf: Buffer): Promise<string | null> {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return `not a zip file (got ${buf.length} bytes starting ${buf.subarray(0, 4).toString('hex')})`;
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (error) {
    return `unreadable zip (${buf.length} bytes: ${error instanceof Error ? error.message : String(error)})`;
  }
  const stopTimes = findEntry(zip, 'stop_times.txt');
  if (!stopTimes) return `no stop_times.txt (${buf.length}-byte zip with ${Object.keys(zip.files).length} files)`;
  if (!(await hasDataRow(stopTimes))) return 'stop_times.txt has no rows';
  let serviceRows = 0;
  for (const name of ['calendar.txt', 'calendar_dates.txt']) {
    const entry = findEntry(zip, name);
    if (entry) serviceRows += parseCsv<Record<string, string>>(await entry.async('text')).length;
  }
  if (serviceRows === 0) return 'no service dates (calendar.txt and calendar_dates.txt are missing or empty)';
  return null;
}
