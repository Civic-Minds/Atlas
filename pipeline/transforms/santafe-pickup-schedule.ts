import type { GtfsCalendar, GtfsCalendarDate, GtfsData, GtfsStopTime, GtfsTrip } from '../../types/gtfs.js';

/**
 * Santa Fe Pick-Up shuttle (santafetrails, #1076). The city's published schedule runs it every
 * 30 minutes Monday and Tuesday, and every 15 minutes Wednesday to Sunday until 5:00 PM, then
 * every 30 minutes (santafenm.gov/public-works/transit/santa-fe-pick-up). The Passio feed puts
 * every Pick-Up trip on one all-week service at 30 minutes, so Saturday and Sunday read 30.
 *
 * Adds only: one Saturday-Sunday copy of the feed's service (same dates and removals) and, on
 * it, one loop halfway between each pair of the feed's 30-minute loops from 08:30 to 17:00
 * (08:45 ... 16:45), copied from the earlier loop's stop times. The feed's own trips and
 * services are untouched. The first hour (07:45 short trip, next at 08:30) is left as published,
 * which understates the official 15 from 07:45.
 *
 * Wednesday to Friday are deliberately not added. Atlas has one Weekday day type, and its
 * median-count rollup would read Wednesday's 15 for all five weekdays with no variation flag,
 * overstating Monday and Tuesday. Weekday stays at the feed's 30: true as a minimum on every
 * weekday, an understatement for Wednesday to Friday (understate rather than overstate).
 *
 * Any feed that no longer matches this exact shape (one all-week service, full loops every 30
 * minutes 08:30-17:00, nothing in between) is left as published, so an upstream fix is never
 * doubled.
 */
const minutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const ROUTE_LONG_NAME_PREFIX = 'Santa Fe Pick-Up';
const FILL_FROM = minutes('08:30:00');
const FILL_UNTIL = minutes('17:00:00');
const STEP = 30;
const SERVICE_SUFFIX = '::sfpu-weekend';
const TRIP_PREFIX = 'sfpu15-';
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const shift = (time: string | undefined, offset: number): string | undefined => {
  if (!time) return time;
  const [h, m, s] = time.split(':').map(Number);
  const total = h * 3600 + m * 60 + (s || 0) + offset * 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

export function addSantaFePickUpWeekendFrequency(gtfs: GtfsData): { gtfs: GtfsData; added: number } {
  const unchanged = { gtfs, added: 0 };
  const routes = gtfs.routes.filter(r => (r.route_long_name ?? '').startsWith(ROUTE_LONG_NAME_PREFIX));
  if (routes.length !== 1) return unchanged;
  const routeId = routes[0].route_id;
  const trips = gtfs.trips.filter(t => t.route_id === routeId);
  const serviceIds = new Set(trips.map(t => t.service_id));
  if (trips.length === 0 || serviceIds.size !== 1) return unchanged;
  const serviceId = [...serviceIds][0];
  if (gtfs.calendar.some(c => c.service_id === `${serviceId}${SERVICE_SUFFIX}`)) return unchanged;
  const calendarRows = gtfs.calendar.filter(c => c.service_id === serviceId);
  if (calendarRows.length !== 1 || !WEEK.every(day => calendarRows[0][day] === '1')) return unchanged;

  const tripIds = new Set(trips.map(t => t.trip_id));
  const stopTimesByTrip = new Map<string, GtfsStopTime[]>();
  for (const st of gtfs.stopTimes) {
    if (!tripIds.has(st.trip_id)) continue;
    const list = stopTimesByTrip.get(st.trip_id) ?? [];
    list.push(st);
    stopTimesByTrip.set(st.trip_id, list);
  }
  const departures: Array<{ trip: GtfsTrip; start: number; stopTimes: GtfsStopTime[]; loop: boolean }> = [];
  for (const trip of trips) {
    const stopTimes = (stopTimesByTrip.get(trip.trip_id) ?? [])
      .slice().sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (stopTimes.length < 2) continue;
    const first = stopTimes[0].departure_time || stopTimes[0].arrival_time;
    if (!first) return unchanged;
    departures.push({
      trip, start: minutes(first), stopTimes,
      loop: stopTimes[0].stop_id === stopTimes[stopTimes.length - 1].stop_id,
    });
  }
  // Exactly one full loop at each half hour 08:30-17:00 and no trip starting between them.
  const inWindow = departures.filter(d => d.start >= FILL_FROM && d.start <= FILL_UNTIL);
  const expected = (FILL_UNTIL - FILL_FROM) / STEP + 1;
  if (inWindow.length !== expected || inWindow.some(d => !d.loop)) return unchanged;
  inWindow.sort((a, b) => a.start - b.start);
  if (inWindow.some((d, i) => d.start !== FILL_FROM + i * STEP)) return unchanged;

  const newServiceId = `${serviceId}${SERVICE_SUFFIX}`;
  const calendar: GtfsCalendar = { ...calendarRows[0], service_id: newServiceId, monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0' };
  const calendarDates: GtfsCalendarDate[] = gtfs.calendarDates
    .filter(cd => cd.service_id === serviceId)
    .map(cd => ({ ...cd, service_id: newServiceId }));
  const newTrips: GtfsTrip[] = [];
  const newStopTimes: GtfsStopTime[] = [];
  for (const d of inWindow.slice(0, -1)) {
    const tripId = `${TRIP_PREFIX}${d.trip.trip_id}`;
    newTrips.push({ ...d.trip, trip_id: tripId, service_id: newServiceId, block_id: undefined });
    for (const st of d.stopTimes) {
      newStopTimes.push({
        ...st, trip_id: tripId,
        arrival_time: shift(st.arrival_time, STEP / 2)!, departure_time: shift(st.departure_time, STEP / 2)!,
      });
    }
  }
  return {
    gtfs: {
      ...gtfs,
      calendar: [...gtfs.calendar, calendar],
      calendarDates: [...gtfs.calendarDates, ...calendarDates],
      trips: [...gtfs.trips, ...newTrips],
      stopTimes: [...gtfs.stopTimes, ...newStopTimes],
    },
    added: newTrips.length,
  };
}
