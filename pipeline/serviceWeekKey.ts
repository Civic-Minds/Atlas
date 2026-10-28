/**
 * The refresh unchanged check's view of the week the map reads (CIV-1011 stage 4, the manager
 * 2026-10-27): the service_ids each day of the picked week reads, plus the listing end. The pick
 * depends on the run date, so an unchanged zip is reprocessed when this moves (a new timetable starts,
 * a listing ends) and skipped otherwise, not reprocessed every week. Read from the zip's own calendar
 * files, the same inputs process-core gives pickRiderWeek before the agency's route filters.
 *
 * CIV-1066: it also carries a hash of trips.txt and stop_times.txt, so a feed whose times or trips
 * change under the same service_ids (and the same latest end date, with no feed_version: Miami-Dade's
 * replaced bus package) is processed, while a zip rebuilt byte-differently with the same files is
 * still skipped. Line endings are ignored.
 */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import { DAY_NAMES, pickRiderWeek, serviceAnchor } from './serviceDays.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';

export async function serviceWeekKey(buf: Buffer, anchor: string = serviceAnchor()): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const file = (name: string) => zip.file(name) ?? zip.file(Object.keys(zip.files).find(f => f.endsWith(`/${name}`)) ?? '');
    const rows = async <T>(name: string): Promise<T[]> => {
      const entry = file(name);
      return entry ? parseCsv<T>(await entry.async('text')) : [];
    };
    const week = pickRiderWeek({
      calendar: await rows<GtfsCalendar>('calendar.txt'),
      calendarDates: await rows<GtfsCalendarDate>('calendar_dates.txt'),
      trips: await rows<{ service_id: string; route_id: string }>('trips.txt'),
      routes: await rows<{ route_id: string; route_short_name?: string; route_long_name?: string }>('routes.txt'),
      anchor,
    });
    const text = DAY_NAMES.map(day => `${day}:${week.week.services[day].join(',')}`).join('|') + `|end:${week.listingEnd?.date ?? ''}`;
    const hash = createHash('sha1').update(text);
    for (const name of ['trips.txt', 'stop_times.txt']) {
      const entry = file(name);
      hash.update(`|${name}:`);
      if (entry) hash.update(withoutCarriageReturns(await entry.async('nodebuffer')));
    }
    return hash.digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/** The file's bytes with every carriage return removed, so CRLF and LF copies hash the same. */
function withoutCarriageReturns(buf: Buffer): Buffer {
  if (!buf.includes(13)) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (const b of buf) if (b !== 13) out[n++] = b;
  return out.subarray(0, n);
}
