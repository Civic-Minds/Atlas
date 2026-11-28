import { describe, expect, it } from 'vitest';
import { scheduledDirection, type ScheduleTrip } from '../scheduleTrips';
import { vehiclesFromRecords } from '../live-vehicles';
import type { LiveRecord } from '../../shared/liveJoin';

// CIV-3044 (#1796): Burlington 1's feed put buses of both directions under "Appleby GO"; the timetable by trip id is right.
const route = { shortName: '1', displayName: 'Plains-Fairview' };
const schedule = new Map<string, ScheduleTrip>([
  ['703721', { d: 0, h: 'East to Appleby GO' }],
  ['703725', { d: 1, h: 'West to Hamilton' }],
  ['900001', { d: 1, h: null }],
]);

describe('scheduledDirection (CIV-3044)', () => {
  it('takes the direction and destination from the timetable by trip id, over the feed', () => {
    expect(scheduledDirection({ tripId: '703725', d: 0, hs: 'Appleby GO' }, schedule, route)).toEqual({ directionId: 1, headsign: 'Hamilton' });
    expect(scheduledDirection({ tripId: '703721', d: null, hs: null }, schedule, route)).toEqual({ directionId: 0, headsign: 'Appleby GO' });
  });

  it('keeps the timetable direction when the trip has no headsign', () => {
    expect(scheduledDirection({ tripId: '900001', d: 0, hs: 'Appleby GO' }, schedule, route)).toEqual({ directionId: 1, headsign: null });
  });

  it('leaves a trip the timetable lacks for the shape backup, not the feed', () => {
    expect(scheduledDirection({ tripId: 'unknown', d: 0, hs: 'Appleby GO' }, schedule, route)).toEqual({ directionId: null, headsign: null });
    expect(scheduledDirection({ tripId: '', d: 1, hs: 'Hamilton' }, schedule, route)).toEqual({ directionId: null, headsign: null });
  });

  it('keeps the feed values when the agency has no timetable loaded', () => {
    expect(scheduledDirection({ tripId: '703725', d: 0, hs: 'Appleby GO' }, new Map(), route)).toEqual({ directionId: 0, headsign: 'Appleby GO' });
    expect(scheduledDirection({ tripId: '703725', d: 0, hs: 'Appleby GO' }, null, route)).toEqual({ directionId: 0, headsign: 'Appleby GO' });
  });

  it('vehiclesFromRecords gives each vehicle its timetable direction', () => {
    const rec = (id: string, tripId: string): LiveRecord => ({ id, r: 'R1', tripId, d: 0, lat: 43.3, lon: -79.8, brg: null, t: 1, label: id, currentStatus: null, delay: null, hs: 'Appleby GO', stu: [] });
    const out = vehiclesFromRecords('burlington', [rec('a', '703721'), rec('b', '703725'), rec('c', 'other')], () => route, new Map(), 2, 2, schedule);
    expect(out.map(v => [v.id, v.directionId, v.headsign])).toEqual([['a', 0, 'Appleby GO'], ['b', 1, 'Hamilton'], ['c', null, null]]);
  });
});
