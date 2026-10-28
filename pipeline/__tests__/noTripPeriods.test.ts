import { describe, expect, it } from 'vitest';
import { historyNoTripPeriods, weekdayNoTripPeriods } from '../noTripPeriods';
import type { GtfsStopTime, GtfsTrip } from '../../types/gtfs';
import type { DayName } from '../../shared/dayTypes';

const trip = (trip_id: string, route_id: string, service_id = 'wk'): GtfsTrip => ({ trip_id, route_id, service_id });
const times = (trip_id: string, ...hhmm: string[]): GtfsStopTime[] =>
  hhmm.map((t, i) => ({ trip_id, arrival_time: t, departure_time: t, stop_id: `s${i}`, stop_sequence: String(i) }));
const weekdays = (ids: string[]) => new Map<DayName, Set<string>>(
  (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as DayName[]).map(d => [d, new Set(ids)]),
);

describe('weekdayNoTripPeriods (CIV-471)', () => {
  it('flags only the periods a peak-only route never runs in (Brampton 81 shape)', () => {
    const gtfs = {
      trips: [trip('a', '81'), trip('b', '81')],
      stopTimes: [...times('a', '06:30:00', '07:10:00'), ...times('b', '16:00:00', '16:40:00')],
    };
    expect(weekdayNoTripPeriods(gtfs, weekdays(['wk']))['81']).toEqual(['midday', 'evening', 'late', 'overnight']);
  });

  it('counts a trip still running into a period, not only one that starts in it', () => {
    const gtfs = { trips: [trip('a', '1')], stopTimes: times('a', '08:45:00', '09:10:00') };
    expect(weekdayNoTripPeriods(gtfs, weekdays(['wk']))['1']).not.toContain('midday');
  });

  it('counts one lone trip: a period with 1 or 2 trips is not "no trips"', () => {
    const gtfs = { trips: [trip('a', '1'), trip('b', '1')], stopTimes: [...times('a', '07:00:00', '07:30:00'), ...times('b', '12:00:00', '12:20:00')] };
    expect(weekdayNoTripPeriods(gtfs, weekdays(['wk']))['1']).not.toContain('midday');
  });

  it('reads a trip written before midnight as the next night too, and one past 24:00 as the night', () => {
    const gtfs = {
      trips: [trip('a', '1'), trip('b', '2')],
      stopTimes: [...times('a', '00:30:00', '01:00:00'), ...times('b', '24:30:00', '25:00:00')],
    };
    const out = weekdayNoTripPeriods(gtfs, weekdays(['wk']));
    expect(out['1']).not.toContain('late');
    expect(out['2']).not.toContain('late');
  });

  it('leaves out weekend-only trips and routes with no weekday trip', () => {
    const gtfs = { trips: [trip('a', '1', 'sat'), trip('b', '2')], stopTimes: [...times('a', '12:00:00', '12:30:00'), ...times('b', '07:00:00', '07:30:00')] };
    const out = weekdayNoTripPeriods(gtfs, weekdays(['wk']));
    expect(out['1']).toBeUndefined();
    expect(out['2']).toContain('midday');
  });

  it('a period with a trip on any one weekday is not flagged', () => {
    const active = weekdays(['wk']);
    active.set('Friday', new Set(['wk', 'fri']));
    const gtfs = { trips: [trip('a', '1'), trip('b', '1', 'fri')], stopTimes: [...times('a', '07:00:00', '07:30:00'), ...times('b', '12:00:00', '12:30:00')] };
    expect(weekdayNoTripPeriods(gtfs, active)['1']).not.toContain('midday');
  });
});

describe('historyNoTripPeriods (CIV-471)', () => {
  const f = (routeId: string, routeShortName: string, day = 'Weekday') => ({ properties: { routeId, routeShortName, day } });
  const key = (p: Record<string, unknown>) => String(p.routeShortName ?? '') || null;

  it('flags a period for a route key only when every route filed under it is flagged', () => {
    const out = historyNoTripPeriods([f('81a', '81'), f('81b', '81'), f('5', '5')], key, {
      '81a': ['midday', 'evening'], '81b': ['midday'], '5': [],
    });
    expect(out).toEqual({ '81': ['midday'], '5': [] });
  });

  it('leaves out a key with a route it has no reading for, and everything without a map', () => {
    expect(historyNoTripPeriods([f('x', '9')], key, {})).toEqual({});
    expect(historyNoTripPeriods([f('x', '9')], key, undefined)).toEqual({});
  });

  it('reads only weekday features', () => {
    expect(historyNoTripPeriods([f('s', '7', 'Saturday')], key, { s: ['midday'] })).toEqual({});
  });
});
