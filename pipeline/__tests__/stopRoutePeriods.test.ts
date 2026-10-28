import { describe, expect, it } from 'vitest';
import { buildStopRoutePeriodBits } from '../stopRoutePeriods';
import { noTripsInPeriod, stopRoutePeriodBit, stopRoutePeriodBitsForSpan } from '../../shared/stopRoutePeriods';
import type { DayType } from '../../shared/dayTypes';

const run = (opts: {
  trips: Array<{ trip_id: string; route_id: string; service_id: string }>;
  stops: Record<string, Array<{ stop_id: string; departure_time?: string; arrival_time?: string }>>;
  days?: Record<string, DayType[]>;
  parents?: Record<string, string>;
  windows?: Record<string, Array<{ start: number; end: number; headwayMinutes: number }>>;
}) => {
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  for (const [tripId, rows] of Object.entries(opts.stops)) {
    const mins = rows.map(r => r.departure_time || r.arrival_time).filter(Boolean).map(t => {
      const [h, m] = t!.split(':').map(Number);
      return h * 60 + m;
    });
    if (mins.length) { first.set(tripId, Math.min(...mins)); last.set(tripId, Math.max(...mins)); }
  }
  return buildStopRoutePeriodBits({
    trips: opts.trips,
    stopTimesByTripId: new Map(Object.entries(opts.stops)),
    serviceIdToDayTypes: new Map(Object.entries(opts.days ?? { wk: ['Weekday'] }).map(([k, v]) => [k, new Set(v)])),
    childToParent: new Map(Object.entries(opts.parents ?? {})),
    frequencyRowsByTripId: new Map(Object.entries(opts.windows ?? {})),
    firstDepartureByTripId: first,
    lastDepartureByTripId: last,
  });
};

describe('stop route periods (CIV-1052)', () => {
  // MiWay 314 at stop 0814 (#1169): one 08:20 school trip. AM peak has a trip; midday has none.
  it('marks the period of a lone trip and leaves the rest clear', () => {
    const bits = run({
      trips: [{ trip_id: 't1', route_id: '314', service_id: 'wk' }],
      stops: { t1: [{ stop_id: 'a', departure_time: '07:55:00' }, { stop_id: '0814', arrival_time: '08:20:00', departure_time: '08:20:00' }] },
    }).get('0814')!.get('314')!;
    expect(noTripsInPeriod([bits], 'Weekday', 'amPeak')).toBe(false);
    expect(noTripsInPeriod([bits], 'Weekday', 'midday')).toBe(true);
    expect(noTripsInPeriod([bits], 'Saturday', 'amPeak')).toBe(true);
  });

  it('counts an untimed stop time over its trip span, and a parent station too', () => {
    const out = run({
      trips: [{ trip_id: 't1', route_id: 'r', service_id: 'wk' }],
      stops: { t1: [{ stop_id: 'a', departure_time: '08:50:00' }, { stop_id: 'b' }, { stop_id: 'c', arrival_time: '09:20:00' }] },
      parents: { b: 'station' },
    });
    for (const stop of ['b', 'station']) {
      const v = out.get(stop)!.get('r')!;
      expect(noTripsInPeriod([v], 'Weekday', 'amPeak')).toBe(false);
      expect(noTripsInPeriod([v], 'Weekday', 'midday')).toBe(false);
      expect(noTripsInPeriod([v], 'Weekday', 'pmPeak')).toBe(true);
    }
  });

  it('counts a frequencies.txt template over its windows, not its literal times', () => {
    const v = run({
      trips: [{ trip_id: 't1', route_id: 'r', service_id: 'wk' }],
      stops: { t1: [{ stop_id: 'a', departure_time: '00:00:00' }, { stop_id: 'b', departure_time: '00:20:00' }] },
      windows: { t1: [{ start: 16 * 60, end: 18 * 60, headwayMinutes: 10 }] },
    }).get('b')!.get('r')!;
    expect(noTripsInPeriod([v], 'Weekday', 'pmPeak')).toBe(false);
    expect(noTripsInPeriod([v], 'Weekday', 'late')).toBe(true);
  });

  it('reads an early time as the night before too, and a drop-off visit as a trip', () => {
    expect(stopRoutePeriodBitsForSpan('Sunday', 120, 120) & stopRoutePeriodBit('Sunday', 'overnight')).not.toBe(0);
    expect(stopRoutePeriodBitsForSpan('Sunday', 30, 30) & stopRoutePeriodBit('Sunday', 'late')).not.toBe(0);
    const v = run({
      trips: [{ trip_id: 't1', route_id: 'r', service_id: 'sat' }],
      stops: { t1: [{ stop_id: 'a', arrival_time: '12:00:00' }] },
      days: { sat: ['Saturday'] },
    }).get('a')!.get('r')!;
    expect(noTripsInPeriod([v], 'Saturday', 'midday')).toBe(false);
  });

  it('makes no claim on data from before the field', () => {
    expect(noTripsInPeriod([undefined], 'Weekday', 'midday')).toBeNull();
    expect(noTripsInPeriod([0, undefined], 'Weekday', 'midday')).toBeNull();
    expect(noTripsInPeriod([], 'Weekday', 'midday')).toBeNull();
  });
});
