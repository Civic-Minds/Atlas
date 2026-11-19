import { describe, expect, it } from 'vitest';
import { dropSameSlotSubsetTrips, PAIRED_SLOT_SHARE_MIN } from '../same-slot-subset-trips.js';
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

  // Dry-run narrowing: a pair counts once only where it repeats across most of the route's departures.
  describe('narrowed to repeating pairs', () => {
    const pairAt = (n: number, hh: string) => {
      const s = `${hh}:00`;
      const e = times(`EB${n}`, [['177', s], ['176', `${hh}:10`], ['94', `${hh}:50`]]);
      const l = times(`LB${n}`, [['177', s], ['176', `${hh}:10`], ['101', `${hh}:20`], ['94', `${hh}:55`]]);
      return { trips: [trip(`EB${n}`), trip(`LB${n}`)], st: [...e, ...l] };
    };
    const single = (n: number, hh: string) => ({ trips: [trip(`LB${n}`)], st: times(`LB${n}`, [['177', `${hh}:00`], ['176', `${hh}:10`], ['101', `${hh}:20`], ['94', `${hh}:55`]]) });
    const build = (parts: { trips: ReturnType<typeof trip>[]; st: ReturnType<typeof times> }[]) =>
      feed(parts.flatMap(p => p.trips), parts.flatMap(p => p.st));

    it('uses a share of more than half', () => expect(PAIRED_SLOT_SHARE_MIN).toBe(0.5));

    it('leaves out the subset trips when most slots are pairs', () => {
      const { dropped } = dropSameSlotSubsetTrips(build([pairAt(1, '06'), pairAt(2, '08'), pairAt(3, '10'), single(4, '12')]));
      expect(dropped).toBe(3);
    });

    it('keeps a one-off pair among many departures', () => {
      const { dropped, gtfs } = dropSameSlotSubsetTrips(build([pairAt(1, '06'), single(2, '07'), single(3, '08'), single(4, '09')]));
      expect(dropped).toBe(0);
      expect(gtfs.trips).toHaveLength(5);
    });

    it('keeps pairs when exactly half the slots are pairs', () => {
      expect(dropSameSlotSubsetTrips(build([pairAt(1, '06'), single(2, '08')])).dropped).toBe(0);
    });

    it('judges each service on its own', () => {
      const sat = (p: ReturnType<typeof pairAt>) => ({ ...p, trips: p.trips.map(t => ({ ...t, service_id: 'sat' })) });
      const f = build([pairAt(1, '06'), pairAt(2, '08'), sat(pairAt(3, '06')), sat(single(4, '07')), sat(single(5, '08')), sat(single(6, '09'))]);
      expect(dropSameSlotSubsetTrips(f).dropped).toBe(2);
    });
  });
});
