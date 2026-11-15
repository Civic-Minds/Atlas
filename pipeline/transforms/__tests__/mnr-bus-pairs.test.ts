import { describe, expect, it } from 'vitest';
import { dropMnrExpressBusPairs } from '../mnr-bus-pairs.js';
import type { GtfsData } from '../../../types/gtfs.js';

// MNR Southeast (Bus), Sunday: EB9910 and LB9910 leave Wassaic (177) at 05:26; the express runs
// to Southeast (94) direct, the local calls at every stop between.
const trip = (trip_id: string, trip_headsign = 'Southeast (Bus)', service_id = 'sun') =>
  ({ route_id: '2', service_id, trip_id, trip_headsign, direction_id: '1' });
const times = (trip_id: string, stops: [string, string][]) =>
  stops.map(([stop_id, t], i) => ({ trip_id, stop_id, stop_sequence: String(i + 1), arrival_time: `${t}:00`, departure_time: `${t}:00` }));
const feed = (trips: ReturnType<typeof trip>[], stopTimes: ReturnType<typeof times>): GtfsData => ({
  agencies: [], routes: [], stops: [], calendar: [], calendarDates: [], shapes: [], trips, stopTimes,
} as unknown as GtfsData);
const express = (id: string, start = '05:26') => times(id, [['177', start], ['176', '05:36'], ['94', '06:26']]);
const local = (id: string, start = '05:26') => times(id, [['177', start], ['176', '05:36'], ['101', '05:46'], ['100', '06:01'], ['98', '06:14'], ['97', '06:29'], ['94', '06:54']]);

describe('MNR express/local bus pairs (CIV-1086)', () => {
  it('leaves out the express that leaves with a local serving all its stops', () => {
    const { gtfs, dropped } = dropMnrExpressBusPairs(feed([trip('EB9910'), trip('LB9910')], [...express('EB9910'), ...local('LB9910')]));
    expect(dropped).toBe(1);
    expect(gtfs.trips.map(t => t.trip_id)).toEqual(['LB9910']);
    expect(gtfs.stopTimes.every(st => st.trip_id === 'LB9910')).toBe(true);
  });

  it('keeps trips that leave at different times, run on other services, or are not buses', () => {
    const apart = feed([trip('EB'), trip('LB')], [...express('EB', '05:20'), ...local('LB')]);
    expect(dropMnrExpressBusPairs(apart).dropped).toBe(0);
    const otherService = feed([trip('EB', 'Southeast (Bus)', 'sat'), trip('LB')], [...express('EB'), ...local('LB')]);
    expect(dropMnrExpressBusPairs(otherService).dropped).toBe(0);
    const trains = feed([trip('A', 'Southeast'), trip('B', 'Southeast')], [...express('A'), ...local('B')]);
    expect(dropMnrExpressBusPairs(trains).dropped).toBe(0);
  });

  it('keeps both when neither serves all of the other\'s stops', () => {
    const other = times('X', [['177', '05:26'], ['175', '05:40'], ['94', '06:30']]);
    expect(dropMnrExpressBusPairs(feed([trip('X'), trip('LB')], [...other, ...local('LB')])).dropped).toBe(0);
  });

  // CIV-1307: weekday LB964 leaves Wassaic at 13:26 and EB964 at 13:54; both reach Southeast at 14:54.
  it('leaves out the express that reaches the end with a local serving all its stops', () => {
    const lateExpress = times('EB964', [['177', '13:54'], ['176', '14:04'], ['94', '14:54']]);
    const earlyLocal = times('LB964', [['177', '13:26'], ['176', '13:36'], ['101', '13:46'], ['100', '14:01'], ['98', '14:14'], ['97', '14:29'], ['94', '14:54']]);
    const { gtfs, dropped } = dropMnrExpressBusPairs(feed([trip('EB964', 'Southeast (Bus)', 'wkd'), trip('LB964', 'Southeast (Bus)', 'wkd')], [...lateExpress, ...earlyLocal]));
    expect(dropped).toBe(1);
    expect(gtfs.trips.map(t => t.trip_id)).toEqual(['LB964']);
  });

  it('keeps buses that reach the end at different minutes, or where the earlier one skips stops', () => {
    const lateExpress = times('EB', [['177', '13:54'], ['176', '14:04'], ['94', '14:55']]);
    const earlyLocal = times('LB', [['177', '13:26'], ['176', '13:36'], ['101', '13:46'], ['94', '14:54']]);
    expect(dropMnrExpressBusPairs(feed([trip('EB'), trip('LB')], [...lateExpress, ...earlyLocal])).dropped).toBe(0);
    const sameEnd = times('EB', [['177', '05:54'], ['176', '06:04'], ['94', '06:54']]);
    const otherLocal = times('X', [['177', '05:26'], ['175', '05:40'], ['94', '06:54']]);
    expect(dropMnrExpressBusPairs(feed([trip('EB'), trip('X')], [...sameEnd, ...otherLocal])).dropped).toBe(0);
  });
});
