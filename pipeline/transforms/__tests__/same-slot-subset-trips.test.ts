import { describe, expect, it } from 'vitest';
import { dropSameSlotSubsetTrips, PAIRED_SLOT_SHARE_MIN, PAIRED_SLOTS_MIN } from '../same-slot-subset-trips.js';
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
    // Three repeating slots (the dry-run floor); only the first is checked in detail.
    const more = [['EB2', 'LB2', '07:26'], ['EB3', 'LB3', '09:26']] as const;
    const f = feed(
      [trip('EB9910'), trip('LB9910'), ...more.flatMap(([e, l]) => [trip(e), trip(l)])],
      [...express('EB9910'), ...local('LB9910'), ...more.flatMap(([e, l, t]) => [...express(e, t), ...local(l, t)])],
    );
    const { gtfs, dropped, routes } = dropSameSlotSubsetTrips(f);
    expect(dropped).toBe(3);
    expect([...routes]).toEqual(['2']);
    expect(gtfs.trips.map(t => t.trip_id)).toEqual(['LB9910', 'LB2', 'LB3']);
    expect(gtfs.stopTimes.every(st => st.trip_id.startsWith('LB'))).toBe(true);
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
    const shorter = (id: string, t: string) => times(id, [['177', t], ['94', '06:20']]);
    const slots = [['EB9910', 'EB2', 'LB9910', '05:26'], ['EB4', 'EB5', 'LB4', '07:26'], ['EB6', 'EB7', 'LB6', '09:26']] as const;
    const f = feed(
      slots.flatMap(([a, b, l]) => [trip(a), trip(b), trip(l)]),
      slots.flatMap(([a, b, l, t]) => [...express(a, t), ...shorter(b, t), ...local(l, t)]),
    );
    const { gtfs, dropped } = dropSameSlotSubsetTrips(f);
    expect(dropped).toBe(6);
    expect(gtfs.trips.map(t => t.trip_id)).toEqual(['LB9910', 'LB4', 'LB6']);
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
      const f = build([pairAt(1, '06'), pairAt(2, '08'), pairAt(3, '10'), sat(pairAt(4, '06')), sat(single(5, '07')), sat(single(6, '08')), sat(single(7, '09'))]);
      expect(dropSameSlotSubsetTrips(f).dropped).toBe(3);
    });

    it('uses a floor of 3 paired slots', () => expect(PAIRED_SLOTS_MIN).toBe(3));

    // mtd-champaign (first dry run): ten groups had one departure slot, and it was a pair.
    it('does not fire on a one-slot group that is entirely a pair', () => {
      expect(dropSameSlotSubsetTrips(build([pairAt(1, '06')])).dropped).toBe(0);
    });

    it('does not fire when every slot is a pair but fewer than the floor', () => {
      expect(dropSameSlotSubsetTrips(build([pairAt(1, '06'), pairAt(2, '08')])).dropped).toBe(0);
    });

    it('fires at exactly the floor when the pairs are most of the slots', () => {
      expect(dropSameSlotSubsetTrips(build([pairAt(1, '06'), pairAt(2, '08'), pairAt(3, '10')])).dropped).toBe(3);
    });
  });
});
