import { describe, expect, it } from 'vitest';
import { addSantaFePickUpWeekendFrequency } from '../santafe-pickup-schedule.js';
import type { GtfsData } from '../../../types/gtfs.js';

// Shape of the santafetrails Passio feed (feed_version 20260917): route 7561 on the one all-week
// service 60852.162030, a 07:45 short trip, then full loops every 30 minutes 08:30-19:30.
const SERVICE = '60852.162030';
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;

const feed = (opts: { starts?: number[]; splitService?: boolean; routeName?: string } = {}): GtfsData => {
  const starts = opts.starts ?? Array.from({ length: 23 }, (_, i) => 8 * 60 + 30 + i * 30);
  const trips = [{ route_id: '7561', service_id: SERVICE, trip_id: 'short', block_id: 'b', shape_id: 's1', direction_id: '1' }];
  const stopTimes = [
    { trip_id: 'short', arrival_time: '07:45:00', departure_time: '07:45:00', stop_id: 'plaza', stop_sequence: '1' },
    { trip_id: 'short', arrival_time: '07:55:00', departure_time: '07:55:00', stop_id: 'canyon', stop_sequence: '2' },
  ];
  starts.forEach((start, i) => {
    const id = `t${i}`;
    trips.push({ route_id: '7561', service_id: opts.splitService && i % 2 ? 'other' : SERVICE, trip_id: id, block_id: 'b', shape_id: 's2', direction_id: '1' });
    stopTimes.push(
      { trip_id: id, arrival_time: hhmm(start), departure_time: hhmm(start), stop_id: 'plaza', stop_sequence: '1' },
      { trip_id: id, arrival_time: hhmm(start + 13), departure_time: hhmm(start + 13), stop_id: 'canyon', stop_sequence: '2' },
      { trip_id: id, arrival_time: hhmm(start + 27), departure_time: hhmm(start + 27), stop_id: 'plaza', stop_sequence: '3' },
    );
  });
  const allWeek = { monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20250101', end_date: '20271231' };
  return {
    agencies: [], stops: [], shapes: [],
    routes: [
      { route_id: '7561', route_short_name: '', route_long_name: opts.routeName ?? 'Santa Fe Pick-Up! Historic-Canyon Road Shuttle', route_type: '3' },
      { route_id: '7551', route_short_name: '1', route_long_name: 'Downtown - Agua Fria', route_type: '3' },
    ],
    trips, stopTimes,
    calendar: [{ service_id: SERVICE, ...allWeek }, { service_id: 'other', ...allWeek }],
    calendarDates: ['20250101', '20250526', '20250704', '20250901', '20251127', '20251128', '20251225', '20260119']
      .map(date => ({ service_id: SERVICE, date, exception_type: '2' })),
  } as unknown as GtfsData;
};

describe('Santa Fe Pick-Up weekend frequency (#1076)', () => {
  it('adds the 08:45-16:45 loops on a Saturday-Sunday copy of the service, with its removals', () => {
    const { gtfs, added } = addSantaFePickUpWeekendFrequency(feed());
    expect(added).toBe(17);
    const service = `${SERVICE}::sfpu-weekend`;
    const cal = gtfs.calendar.find(c => c.service_id === service)!;
    expect([cal.monday, cal.tuesday, cal.wednesday, cal.thursday, cal.friday, cal.saturday, cal.sunday])
      .toEqual(['0', '0', '0', '0', '0', '1', '1']);
    expect([cal.start_date, cal.end_date]).toEqual(['20250101', '20271231']);
    expect(gtfs.calendarDates.filter(cd => cd.service_id === service)).toHaveLength(8);
    const newTrips = gtfs.trips.filter(t => t.service_id === service);
    expect(newTrips.every(t => t.route_id === '7561' && t.shape_id === 's2' && t.direction_id === '1' && !t.block_id)).toBe(true);
    const firstStops = newTrips.map(t => gtfs.stopTimes.find(st => st.trip_id === t.trip_id && st.stop_sequence === '1')!.departure_time).sort();
    expect(firstStops[0]).toBe('08:45:00');
    expect(firstStops[16]).toBe('16:45:00');
    // Each copy keeps its loop's running time (08:30 loop ends 08:57, its copy 09:12).
    const copy = gtfs.stopTimes.filter(st => st.trip_id === 'sfpu15-t0');
    expect(copy.map(st => st.arrival_time)).toEqual(['08:45:00', '08:58:00', '09:12:00']);
    // The feed's own trips and services are untouched.
    expect(gtfs.trips.filter(t => t.service_id === SERVICE)).toHaveLength(24);
    expect(gtfs.calendar.find(c => c.service_id === SERVICE)!.wednesday).toBe('1');
  });

  it('does nothing when run a second time', () => {
    const once = addSantaFePickUpWeekendFrequency(feed()).gtfs;
    expect(addSantaFePickUpWeekendFrequency(once).added).toBe(0);
  });

  it('leaves a feed with a departure between the half hours as published', () => {
    const starts = Array.from({ length: 23 }, (_, i) => 8 * 60 + 30 + i * 30);
    expect(addSantaFePickUpWeekendFrequency(feed({ starts: [...starts, 9 * 60 + 15] })).added).toBe(0);
  });

  it('leaves Pick-Up trips on more than one service as published', () => {
    expect(addSantaFePickUpWeekendFrequency(feed({ splitService: true })).added).toBe(0);
  });

  it('leaves a feed without the Pick-Up route as published', () => {
    expect(addSantaFePickUpWeekendFrequency(feed({ routeName: 'Canyon Road Shuttle' })).added).toBe(0);
  });
});

