import { describe, expect, it } from 'vitest';
import { dropOneOffRailTrips, serviceDates } from '../oneOffServices';
import { synthesizeCalendarFromDates } from '../parseGtfs';

// Shapes of the #1138 sweep: CapMetro 550's event trains (service 16-172, two Wednesdays, own shapes)
// on top of the Mon-Thu timetable; Metro-North style one-date service_ids carrying the real timetable
// on the regular shapes. Rail is route_type 2.
const routes = [{ route_id: 'R', route_short_name: 'R', route_type: '2' }];
const add = (service: string, dates: string[]) => dates.map(date => ({ service_id: service, date, exception_type: '1' }));
const trip = (trip_id: string, service_id: string, shape_id: string) => ({ trip_id, route_id: 'R', service_id, shape_id, direction_id: '0' });
const st = (trip_id: string) => ({ trip_id, stop_id: 's', stop_sequence: '1', departure_time: '12:00:00', arrival_time: '12:00:00' });

function feed(calendarDates: ReturnType<typeof add>, trips: ReturnType<typeof trip>[]) {
  return { routes, trips, stopTimes: trips.map(t => st(t.trip_id)), calendar: synthesizeCalendarFromDates(calendarDates as never), calendarDates } as never;
}

const WEEKDAYS = ['20261026', '20261027', '20261028', '20261029', '20261102', '20261103', '20261104', '20261105'];

describe('one-off event trains on rail (#1138)', () => {
  it('drops a two-date service on a shape of its own, run on top of the regular timetable (CapMetro 550)', () => {
    const gtfs = feed([...add('22-172', WEEKDAYS), ...add('16-172', ['20261028', '20261104'])], [
      trip('a', '22-172', 'main'), trip('b', '22-172', 'main'), trip('event', '16-172', 'event-shape'),
    ]);
    const { gtfs: out, dropped } = dropOneOffRailTrips(gtfs, 'x');
    expect(dropped).toEqual([{ routeId: 'R', serviceId: '16-172', trips: 1 }]);
    expect((out as { trips: { trip_id: string }[] }).trips.map(t => t.trip_id)).toEqual(['a', 'b']);
    expect((out as { stopTimes: { trip_id: string }[] }).stopTimes.map(s => s.trip_id)).toEqual(['a', 'b']);
  });

  it('keeps one-date service_ids that run the regular shapes (Metro-North, NJ Transit, SEPTA)', () => {
    const gtfs = feed([...add('regular', WEEKDAYS), ...add('oct28', ['20261028']), ...add('oct29', ['20261029'])], [
      trip('a', 'regular', 'main'), trip('b', 'oct28', 'main'), trip('c', 'oct29', 'main'),
    ]);
    expect(dropOneOffRailTrips(gtfs, 'x').dropped).toEqual([]);
  });

  it('keeps a one-off service on a date with no regular service (a holiday timetable, LA rolling ids)', () => {
    const gtfs = feed([...add('regular', WEEKDAYS), ...add('holiday', ['20261111'])], [
      trip('a', 'regular', 'main'), trip('h', 'holiday', 'holiday-shape'),
    ]);
    expect(dropOneOffRailTrips(gtfs, 'x').dropped).toEqual([]);
  });

  it('keeps every trip when the route has no regular service at all', () => {
    const gtfs = feed([...add('d1', ['20261026']), ...add('d2', ['20261027'])], [trip('a', 'd1', 'one'), trip('b', 'd2', 'two')]);
    expect(dropOneOffRailTrips(gtfs, 'x').dropped).toEqual([]);
  });

  it('reads only the listed dates of a calendar synthesized from calendar_dates', () => {
    // 16-172 on two Wednesdays a month apart: its synthesized row spans every Wednesday between them.
    const calendarDates = [...add('16-172', ['20260909', '20261028'])];
    const dates = serviceDates(synthesizeCalendarFromDates(calendarDates as never), calendarDates as never);
    expect([...dates.get('16-172')!].sort()).toEqual(['20260909', '20261028']);
  });

  it('leaves buses alone', () => {
    const gtfs = { ...(feed([...add('22-172', WEEKDAYS), ...add('16-172', ['20261028'])], [trip('a', '22-172', 'main'), trip('e', '16-172', 'event')]) as object), routes: [{ route_id: 'R', route_short_name: 'R', route_type: '3' }] } as never;
    expect(dropOneOffRailTrips(gtfs, 'x').dropped).toEqual([]);
  });
});
