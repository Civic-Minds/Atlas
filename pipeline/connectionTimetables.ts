/**
 * Stop timetables for the connection check (CIV-101): every trip's real times at a few stops on
 * one real date, read straight from a GTFS zip. Separate from process-core on purpose: the
 * published per-stop lists keep only trips that pass the frequency rules and pool day types
 * across calendars, which would drop exactly the few-a-day trips a connection check needs.
 *
 * A service counts on a date only when GTFS says it runs that exact date (servicesRunningOn:
 * calendar range and weekday flag, plus calendar_dates additions, minus removals).
 */
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import { servicesRunningOn, addDaysYmd } from './serviceDates.js';
import { gtfsTimeToMinutes } from '../shared/connections.js';
import { expandTripFrequencyOffsets } from './process-core.js';
import { parseFrequencyWindow, type FrequencyWindow } from './transit-utils.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';

type Row = Record<string, string>;

export interface FeedFilter {
  /** Keep only this agency_id's routes (shared multi-agency zips such as Telluride's). */
  agencyId?: string;
  excludeRouteShortNames?: readonly string[];
  onDemandRoutes?: readonly string[];
}

export interface FeedStop {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  parentStation: string | null;
}

/** A trip's stop at one stop: arrival and departure in minutes, and whether riders can get off or on. */
export interface StopEvent {
  stopId: string;
  tripId: string;
  routeName: string;
  headsign: string | null;
  arrival: number;
  departure: number;
  canAlight: boolean;
  canBoard: boolean;
}

export interface ConnectionFeed {
  stops: FeedStop[];
  /** Parent stations' names by stop_id (location_type 1), so a station's gates read as the station ("Union Station"). */
  stationNames: Map<string, string>;
  /** Stops some kept trip lets riders board at (a stop listed but never served, like Bustang's stops in RTD's feed, is left out). */
  boardingStopIds: Set<string>;
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  /** Services of kept routes, so a date with only another agency's service reads as no service. */
  keptServices: Set<string>;
  /** Stop events on a date at the given stops. */
  eventsOn(date: string, stopIds: ReadonlySet<string>): StopEvent[];
}

async function readRows(zip: JSZip, name: string): Promise<Row[]> {
  const entry = zip.file(name) ?? zip.file(Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '');
  return entry ? parseCsv<Row>(await entry.async('text')) : [];
}

export async function loadConnectionFeed(buf: Buffer, filter: FeedFilter = {}): Promise<ConnectionFeed> {
  const zip = await JSZip.loadAsync(buf);
  const [stopsRows, routesRows, tripsRows, calendar, calendarDates] = await Promise.all([
    readRows(zip, 'stops.txt'), readRows(zip, 'routes.txt'), readRows(zip, 'trips.txt'),
    readRows(zip, 'calendar.txt') as Promise<unknown> as Promise<GtfsCalendar[]>,
    readRows(zip, 'calendar_dates.txt') as Promise<unknown> as Promise<GtfsCalendarDate[]>,
  ]);
  const excluded = new Set([...(filter.excludeRouteShortNames ?? []), ...(filter.onDemandRoutes ?? [])]);
  const routes = new Map<string, string>();
  for (const r of routesRows) {
    if (filter.agencyId && (r.agency_id ?? '') !== filter.agencyId) continue;
    if (excluded.has(r.route_short_name ?? '')) continue;
    routes.set(r.route_id, (r.route_short_name || r.route_long_name || r.route_id).trim());
  }
  const trips = new Map<string, { routeName: string; serviceId: string; headsign: string | null }>();
  const keptServices = new Set<string>();
  for (const t of tripsRows) {
    const routeName = routes.get(t.route_id);
    if (!routeName) continue;
    trips.set(t.trip_id, { routeName, serviceId: t.service_id, headsign: t.trip_headsign?.trim() || null });
    keptServices.add(t.service_id);
  }
  const stationNames = new Map(stopsRows.filter(s => s.location_type === '1').map(s => [s.stop_id, (s.stop_name ?? '').trim()]));
  const stops: FeedStop[] = stopsRows
    .filter(s => (s.location_type ?? '0') === '0' || s.location_type === '')
    .map(s => ({ stopId: s.stop_id, name: (s.stop_name ?? '').trim(), lat: Number(s.stop_lat), lon: Number(s.stop_lon), parentStation: s.parent_station || null }))
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));

  // stop_times is the big file: read it once, keep each kept trip's rows in order.
  const stText = await (zip.file('stop_times.txt') ?? zip.file(Object.keys(zip.files).find(f => f.endsWith('/stop_times.txt')) ?? ''))?.async('text') ?? '';
  const stRows = parseCsv<Row>(stText).filter(r => trips.has(r.trip_id));
  const byTrip = new Map<string, Row[]>();
  for (const r of stRows) {
    const list = byTrip.get(r.trip_id);
    if (list) list.push(r); else byTrip.set(r.trip_id, [r]);
  }
  // frequencies.txt (Grand Valley Transit): a template trip repeats every headway in its window;
  // the same expansion the map uses (single-trip rows count once, overlapping rows dedupe).
  const windowsByTrip = new Map<string, FrequencyWindow[]>();
  for (const f of await readRows(zip, 'frequencies.txt')) {
    const w = parseFrequencyWindow(f as { trip_id: string; start_time: string; end_time: string; headway_secs: string });
    if (w && trips.has(f.trip_id)) windowsByTrip.set(f.trip_id, [...(windowsByTrip.get(f.trip_id) ?? []), w]);
  }
  const boardingStopIds = new Set<string>();
  for (const list of byTrip.values()) {
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    list.forEach((r, i) => { if (i < list.length - 1 && r.pickup_type !== '1') boardingStopIds.add(r.stop_id); });
  }

  return {
    stops,
    stationNames,
    boardingStopIds,
    calendar,
    calendarDates,
    keptServices,
    eventsOn(date, stopIds) {
      const running = servicesRunningOn(calendar, calendarDates, date);
      const out: StopEvent[] = [];
      for (const [tripId, list] of byTrip) {
        const trip = trips.get(tripId)!;
        if (!running.has(trip.serviceId)) continue;
        const times = list.map(r => gtfsTimeToMinutes(r.departure_time) ?? gtfsTimeToMinutes(r.arrival_time)).filter((t): t is number => t !== null);
        const windows = windowsByTrip.get(tripId);
        const offsets = windows && times.length
          ? expandTripFrequencyOffsets(times[0], windows, times[times.length - 1] - times[0])
          : [0];
        for (const offset of offsets) list.forEach((r, i) => {
          if (!stopIds.has(r.stop_id)) return;
          // Blank arrival falls back to departure and the other way round (untimed stops are skipped).
          const arrivalRaw = gtfsTimeToMinutes(r.arrival_time) ?? gtfsTimeToMinutes(r.departure_time);
          const departureRaw = gtfsTimeToMinutes(r.departure_time) ?? gtfsTimeToMinutes(r.arrival_time);
          if (arrivalRaw === null || departureRaw === null) return;
          const arrival = arrivalRaw + offset;
          const departure = departureRaw + offset;
          out.push({
            stopId: r.stop_id, tripId, routeName: trip.routeName, headsign: trip.headsign, arrival, departure,
            // Nobody gets off at a trip's first stop or on at its last.
            canAlight: i > 0 && r.drop_off_type !== '1',
            canBoard: i < list.length - 1 && r.pickup_type !== '1',
          });
        });
      }
      return out;
    },
  };
}

/** Whether any kept route runs on the date. */
export function runsOn(feed: ConnectionFeed, date: string): boolean {
  for (const id of servicesRunningOn(feed.calendar, feed.calendarDates, date)) if (feed.keptServices.has(id)) return true;
  return false;
}

/**
 * The date a feed is read for one day type. The checked date when the feed's schedule covers it;
 * when the schedule has ended before it (expiry < date), the latest date with service on the
 * same weekday, up to a year back, so an expired feed shows its last real timetable, labelled
 * outdated, as Atlas does on the map. A current feed with no service that day reads the checked
 * date (no buses), never another day.
 */
export function readDateFor(feed: ConnectionFeed, date: string, feedExpiry: string | null): string {
  if (!feedExpiry || feedExpiry >= date) return date;
  for (let back = 7; back <= 366; back += 7) {
    const d = addDaysYmd(date, -back);
    if (d <= feedExpiry && runsOn(feed, d)) return d;
  }
  return date;
}
