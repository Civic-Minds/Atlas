import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWeekOf } from '../readWeek';
import { pickRiderWeek } from '../serviceDays';
import { detectReferenceDate, getActiveServiceIds } from '../transit-calendar';
import { computeRawDepartures } from '../transit-phase1';
import type { GtfsData } from '../../types/gtfs';

// CIV-1101: one service-day model. readWeekOf is the week every calendar reader without a date of
// its own uses; it is pickRiderWeek's week, and the old picker only behind the kill switch.
const cal = (service_id: string, days: string, start_date: string, end_date: string) => {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = days.split('');
  return { service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date };
};

/** A fall timetable (Mon-Fri every 15) that ends Dec 18, then a winter one (every 30). */
function feed(): GtfsData {
  const trips: GtfsData['trips'] = [];
  const stopTimes: GtfsData['stopTimes'] = [];
  for (const [service, every] of [['FALL', 15], ['WINTER', 30]] as const) {
    for (let m = 7 * 60, i = 0; m < 19 * 60; m += every, i++) {
      const trip_id = `${service}-${i}`;
      trips.push({ route_id: 'R', service_id: service, trip_id, direction_id: '0', shape_id: 'sh' } as GtfsData['trips'][number]);
      const t = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}:00`;
      stopTimes.push({ trip_id, arrival_time: t(m), departure_time: t(m), stop_id: 'a', stop_sequence: '1' } as GtfsData['stopTimes'][number]);
      stopTimes.push({ trip_id, arrival_time: t(m + 20), departure_time: t(m + 20), stop_id: 'b', stop_sequence: '2' } as GtfsData['stopTimes'][number]);
    }
  }
  return {
    routes: [{ route_id: 'R', route_short_name: 'R', route_type: '3' }],
    trips,
    stopTimes,
    stops: [{ stop_id: 'a', stop_name: 'A', stop_lat: '43.70', stop_lon: '-79.40' }, { stop_id: 'b', stop_name: 'B', stop_lat: '43.72', stop_lon: '-79.40' }],
    calendar: [cal('FALL', '1111100', '20260831', '20261218'), cal('WINTER', '1111100', '20261221', '20270430')],
    calendarDates: [],
  } as unknown as GtfsData;
}

const mondayEvery = (raw: ReturnType<typeof computeRawDepartures>) => {
  const times = raw.find(r => r.day === 'Monday')?.departureTimes ?? [];
  return times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : null;
};

describe('readWeekOf (CIV-1101)', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('is the picked rider week, as calendar rows for that week only', () => {
    const gtfs = feed();
    const week = readWeekOf(gtfs, { anchor: '20261021' });
    const rider = pickRiderWeek({ calendar: gtfs.calendar, calendarDates: [], trips: gtfs.trips, routes: gtfs.routes, anchor: '20261021' });
    expect(week.referenceDate).toBe(rider.referenceDate);
    expect(week.calendar).toEqual(rider.calendar);
    expect(week.calendarDates).toEqual([]);
    expect([...getActiveServiceIds(week.calendar, week.calendarDates, 'Monday', week.referenceDate)]).toEqual(['FALL']);
    const winter = readWeekOf(gtfs, { anchor: '20270113' });
    expect([...getActiveServiceIds(winter.calendar, winter.calendarDates, 'Monday', winter.referenceDate)]).toEqual(['WINTER']);
  });

  it('falls back to the old picker only behind the kill switch', () => {
    const gtfs = feed();
    vi.stubEnv('ATLAS_LEGACY_REFERENCE_DATE', '1');
    const legacy = readWeekOf(gtfs, { anchor: '20261021' });
    expect(legacy.riderWeek).toBeNull();
    expect(legacy.referenceDate).toBe(detectReferenceDate(gtfs.calendar, gtfs.calendarDates, gtfs.trips));
    expect(legacy.calendar).toBe(gtfs.calendar);
  });

  it('is what phase 1 reads when no date is passed in', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
    expect(mondayEvery(computeRawDepartures(feed()))).toBe(15);
    vi.setSystemTime(new Date('2027-01-13T12:00:00'));
    expect(mondayEvery(computeRawDepartures(feed()))).toBe(30);
  });
});
