/**
 * Server-side GTFS parser.
 * Node.js port of src/core/parseGtfs.ts — accepts a Buffer instead of File.
 * Uses JSZip + PapaParser (both work in Node).
 */

import JSZip from 'jszip';
import Papa from 'papaparse';

export interface GtfsRoute {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type: string;
  route_color?: string;
  route_text_color?: string;
  route_desc?: string;
  route_url?: string;
}

export interface GtfsStop {
  stop_id: string;
  stop_code?: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: string;
  stop_lon: string;
  zone_id?: string;
  location_type?: string;
  parent_station?: string;
  stop_url?: string;
  wheelchair_boarding?: string;
}

export interface GtfsTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: string;
  block_id?: string;
  shape_id?: string;
  wheelchair_accessible?: string;
  bikes_allowed?: string;
}

export interface GtfsStopTime {
  trip_id: string;
  stop_id: string;
  stop_sequence: string;
  arrival_time?: string;
  departure_time?: string;
}

export interface GtfsCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export interface GtfsCalendarDate {
  service_id: string;
  date: string;
  exception_type: string;
}

export interface GtfsAgency {
  agency_id?: string;
  agency_name: string;
  agency_url?: string;
  agency_timezone?: string;
}

export interface GtfsFeedInfo {
  feed_publisher_name?: string;
  feed_version?: string;
  feed_start_date?: string;
  feed_end_date?: string;
}

export interface GtfsFrequency {
  trip_id: string;
  start_time: string;
  end_time: string;
  headway_secs: string;
}

export interface GtfsShapePoint {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
}

export interface ParsedGtfs {
  agencies: GtfsAgency[];
  routes: GtfsRoute[];
  stops: GtfsStop[];
  trips: GtfsTrip[];
  /** First departure time (minutes from midnight) per trip_id — extracted during streaming parse */
  tripFirstDep: Map<string, { depTime: number; seq: number }>;
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  feedInfo: GtfsFeedInfo[];
  frequencies: GtfsFrequency[];
  shapePoints: GtfsShapePoint[];
}

function parseCsv<T>(text: string): T[] {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transform: (value: string) => value.trim(),
    transformHeader: (header: string) =>
      header.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
  });
  return result.data as T[];
}

function synthesizeCalendar(calendarDates: GtfsCalendarDate[]): GtfsCalendar[] {
  const addedByService = new Map<string, string[]>();
  for (const cd of calendarDates) {
    if (cd.exception_type !== '1') continue;
    if (!addedByService.has(cd.service_id)) addedByService.set(cd.service_id, []);
    addedByService.get(cd.service_id)!.push(cd.date);
  }

  const results: GtfsCalendar[] = [];
  for (const [serviceId, dates] of addedByService) {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    let minDate = dates[0];
    let maxDate = dates[0];

    for (const dateStr of dates) {
      const y = parseInt(dateStr.substring(0, 4));
      const m = parseInt(dateStr.substring(4, 6)) - 1;
      const d = parseInt(dateStr.substring(6, 8));
      const dow = new Date(y, m, d).getDay();
      dayCounts[dow]++;
      if (dateStr < minDate) minDate = dateStr;
      if (dateStr > maxDate) maxDate = dateStr;
    }

    const totalWeeks = Math.max(1, dates.length / 7);
    const threshold = Math.max(2, totalWeeks * 0.2);

    const entry: GtfsCalendar = {
      service_id: serviceId,
      monday: dayCounts[1] >= threshold ? '1' : '0',
      tuesday: dayCounts[2] >= threshold ? '1' : '0',
      wednesday: dayCounts[3] >= threshold ? '1' : '0',
      thursday: dayCounts[4] >= threshold ? '1' : '0',
      friday: dayCounts[5] >= threshold ? '1' : '0',
      saturday: dayCounts[6] >= threshold ? '1' : '0',
      sunday: dayCounts[0] >= threshold ? '1' : '0',
      start_date: minDate,
      end_date: maxDate,
    };

    const hasActiveDay = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
      .some(d => (entry as any)[d] === '1');
    if (hasActiveDay) results.push(entry);
  }
  return results;
}

export async function parseGtfsBuffer(buffer: Buffer): Promise<ParsedGtfs> {
  const zip = await JSZip.loadAsync(buffer);

  // Auto-detect subdirectory layout
  let basePath = '';
  if (!zip.file('routes.txt')) {
    const routesEntry = Object.keys(zip.files).find(
      f => f.endsWith('/routes.txt') && !zip.files[f].dir
    );
    if (routesEntry) basePath = routesEntry.slice(0, -'routes.txt'.length);
  }

  async function readFile(name: string): Promise<string | null> {
    const f = zip.file(basePath + name);
    return f ? f.async('text') : null;
  }

  const routesTxt = await readFile('routes.txt');
  if (!routesTxt) throw new Error('Missing required GTFS file: routes.txt');

  const tripsTxt = await readFile('trips.txt');
  if (!tripsTxt) throw new Error('Missing required GTFS file: trips.txt');

  const stopsTxt = await readFile('stops.txt');
  if (!stopsTxt) throw new Error('Missing required GTFS file: stops.txt');

  // Read stop_times.txt as a Node.js stream — never decompress the whole file into a string.
  // stop_times.txt is 200-500MB decompressed for large feeds (TTC, NYC MTA).
  const stopTimesEntry = zip.file(basePath + 'stop_times.txt');
  if (!stopTimesEntry) throw new Error('Missing required GTFS file: stop_times.txt');

  const agenciesTxt   = await readFile('agency.txt');
  const calendarTxt   = await readFile('calendar.txt');
  const calDatesTxt   = await readFile('calendar_dates.txt');
  const feedInfoTxt   = await readFile('feed_info.txt');
  const freqsTxt      = await readFile('frequencies.txt');
  const shapesTxt     = await readFile('shapes.txt');

  const routes       = parseCsv<GtfsRoute>(routesTxt);
  const trips        = parseCsv<GtfsTrip>(tripsTxt);
  const stops        = parseCsv<GtfsStop>(stopsTxt);

  // Stream stop_times, keeping only the first departure per trip.
  const tripFirstDep = new Map<string, { depTime: number; seq: number }>();
  let stopTimesHeader: string[] | null = null;

  await new Promise<void>((resolve, reject) => {
    const stream = stopTimesEntry.nodeStream();
    Papa.parse(stream as any, {
      header: true,
      skipEmptyLines: true,
      transform: (v: string) => v.trim(),
      transformHeader: (h: string) => h.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
      step: (row: { data: any }) => {
        const st = row.data as GtfsStopTime;
        const seq = parseInt(st.stop_sequence);
        if (isNaN(seq) || !st.trip_id) return;
        const existing = tripFirstDep.get(st.trip_id);
        if (existing === undefined || seq < existing.seq) {
          const raw = st.departure_time || st.arrival_time || '';
          const parts = raw.split(':');
          if (parts.length < 2) return;
          const h = parseInt(parts[0]), m = parseInt(parts[1]);
          if (isNaN(h) || isNaN(m)) return;
          tripFirstDep.set(st.trip_id, { depTime: h * 60 + m, seq });
        }
      },
      complete: () => resolve(),
      error: (err: Error) => reject(err),
    });
  });
  const stopTimes: GtfsStopTime[] = [];
  const agencies     = agenciesTxt ? parseCsv<GtfsAgency>(agenciesTxt) : [];
  const calendarDates = calDatesTxt ? parseCsv<GtfsCalendarDate>(calDatesTxt) : [];
  const feedInfo     = feedInfoTxt ? parseCsv<GtfsFeedInfo>(feedInfoTxt) : [];
  const frequencies  = freqsTxt ? parseCsv<GtfsFrequency>(freqsTxt) : [];
  const shapePoints  = shapesTxt ? parseCsv<GtfsShapePoint>(shapesTxt) : [];

  let calendar = calendarTxt ? parseCsv<GtfsCalendar>(calendarTxt) : [];
  if (calendar.length === 0 && calendarDates.length > 0) {
    calendar = synthesizeCalendar(calendarDates);
  }

  if (calendar.length === 0 && calendarDates.length === 0) {
    throw new Error('GTFS feed must contain either calendar.txt or calendar_dates.txt');
  }

  // Single-agency feeds: fill in agency_id on routes if missing
  if (agencies.length === 1 && agencies[0].agency_id) {
    for (const r of routes) {
      if (!r.agency_id) r.agency_id = agencies[0].agency_id;
    }
  }

  // Synthesize agency from feed_info if agency.txt is missing
  if (agencies.length === 0) {
    const name = feedInfo[0]?.feed_publisher_name ?? 'Unknown Agency';
    agencies.push({ agency_name: name });
  }

  return { agencies, routes, stops, trips, tripFirstDep, calendar, calendarDates, feedInfo, frequencies, shapePoints };
}
