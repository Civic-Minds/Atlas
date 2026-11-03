import { describe, expect, it } from 'vitest';
import { dropSameSlotSubsetTrips } from '../same-slot-subset-trips.js';
import type { GtfsData } from '../../../types/gtfs.js';

// MNR Southeast (Bus), Sunday: EB9910 and LB9910 leave Wassaic (177) at 05:26; the express runs
// to Southeast (94) direct, the local calls at every stop between (CIV-1086, CIV-1098).
const trip = (trip_id: string, trip_headsign = 'Southeast (Bus)', service_id = 'sun') =>
  ({ route_id: '2', service_id, trip_id, trip_headsign, direction_id: '1' });
const times = (trip_id: string, stops: [string, string][]) =>
  stops.map(([stop_id, t], i) => ({ trip_id, stop_id, stop_sequence: String(i + 1), arrival_time: `${t}:00`, departure_time: `${t}:00` }));
const feed = (trips: ReturnType<typeof trip>[], stopTimes: ReturnType<typeof times>, frequencies: Array<{ trip_id: string }> = []): GtfsData => ({
  agencies: [], routes: [], stops: [], calendar: [], calendarDates: [], shapes: [], trips, stopTimes, frequencies,
} as unknown as GtfsData);
const express = (id: string, start = '05:26') => times(id, [['177', start], ['176', '05:36'], ['94', '06:26']]);
const local = (id: string, start = '05:26') => times(id, [['177', start], ['176', '05:36'], ['101', '05:46'], ['100', '06:01'], ['98', '06:14'], ['97', '06:29'], ['94', '06:54']]);

describe('same-slot subset trips (CIV-1098)', () => {
  it('leaves out the express that leaves with a local serving all its stops', () => {
    const { gtfs, dropped, routes } = dropSameSlotSubsetTrips(feed([trip('EB9910'), trip('LB9910')], [...express('EB9910'), ...local('LB9910')]));
    expect(dropped).toBe(1);
    expect([...routes]).toEqual(['2']);
    expect(gtfs.trips.map(t => t.trip_id)).toEqual(['LB9910']);
    expect(gtfs.stopTimes.every(st => st.trip_id === 'LB9910')).toBe(true);
  });

  it('keeps trips that leave at different times, from different first stops, or on other services', () => {
    const apart = feed([trip('EB'), trip('LB')], [...express('EB', '05:20'), ...local('LB')]);
    expect(dropSameSlotSubsetTrips(apart).dropped).toBe(0);
    const otherService = feed([trip('EB', 'Southeast (Bus)', 'sat'), trip('LB')], [...express('EB'), ...local('LB')]);
    expect(dropSameSlotSubsetTrips(otherService).dropped).toBe(0);
    // A short turn starting mid-route at the same minute a full trip leaves the origin is another departure.
    const midRoute = feed([trip('S'), trip('LB')], [...times('S', [['101', '05:26'], ['100', '05:41'], ['94', '06:30']]), ...local('LB')]);
    expect(dropSameSlotSubsetTrips(midRoute).dropped).toBe(0);
  });

  it('keeps a pair published under two names (a Limited beside a local)', () => {
    const named = feed([trip('LTD', 'Southeast LIMITED'), trip('LB')], [...express('LTD'), ...local('LB')]);
    expect(dropSameSlotSubsetTrips(named).dropped).toBe(0);
  });

  it('keeps both when neither serves all of the other\'s stops', () => {
    const other = times('X', [['177', '05:26'], ['175', '05:40'], ['94', '06:30']]);
    expect(dropSameSlotSubsetTrips(feed([trip('X'), trip('LB')], [...other, ...local('LB')])).dropped).toBe(0);
    // The same stops in both: exact copies, which the same-minute dedupe already removes at every stop.
    expect(dropSameSlotSubsetTrips(feed([trip('A'), trip('B')], [...local('A'), ...local('B')])).dropped).toBe(0);
  });

  it('leaves out every subset trip of a slot with three', () => {
    const shorter = times('EB2', [['177', '05:26'], ['94', '06:20']]);
    const { gtfs, dropped } = dropSameSlotSubsetTrips(feed([trip('EB9910'), trip('EB2'), trip('LB9910')], [...express('EB9910'), ...shorter, ...local('LB9910')]));
    expect(dropped).toBe(2);
    expect(gtfs.trips.map(t => t.trip_id)).toEqual(['LB9910']);
  });

  it('never compares trips expanded from frequencies.txt', () => {
    const f = feed([trip('EB9910'), trip('LB9910')], [...express('EB9910'), ...local('LB9910')], [{ trip_id: 'EB9910' }]);
    expect(dropSameSlotSubsetTrips(f).dropped).toBe(0);
  });
});
