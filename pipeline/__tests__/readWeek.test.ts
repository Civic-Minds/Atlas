import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWeekOf } from '../readWeek';
import { synthesizeCalendarFromDates } from '../parseGtfs';
import { pickRiderWeek } from '../serviceDays';
import { getActiveServiceIds } from '../transit-calendar';
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

  it('is what phase 1 reads when no date is passed in', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
    expect(mondayEvery(computeRawDepartures(feed()))).toBe(15);
    vi.setSystemTime(new Date('2027-01-13T12:00:00'));
    expect(mondayEvery(computeRawDepartures(feed()))).toBe(30);
  });
});

// GitHub #1538: Kingston's feed has no calendar.txt; calendar_dates lists every date. The calendar parseGtfs synthesizes
// from it marks a service for every Saturday or Sunday in its span, so a reader of that calendar took Sunday Sep 20 from
// a Sunday service not listed that day. The week is read from calendar_dates itself (readWeekOf ignores the synthesized
// calendar), so each day gets exactly its listed services.
describe('calendar_dates-only feed (Kingston, #1538)', () => {
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const days = (from: string, to: string, dow: number[], skip: string[] = []) => {
    const out: string[] = [];
    for (let d = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}T12:00:00Z`); ymd(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (dow.includes(d.getUTCDay()) && !skip.includes(ymd(d))) out.push(ymd(d));
    }
    return out;
  };
  // Sundays Sep 20, Oct 18, Oct 25, Nov 1 and Nov 15 run the SUN_B timetable; every other Sunday runs SUN_A.
  const sunB = ['20260920', '20261018', '20261025', '20261101', '20261115'];
  const services: Record<string, string[]> = {
    WK: days('20260914', '20261218', [1, 2, 3, 4, 5]),
    SAT_A: days('20260912', '20261219', [6]),
    SAT_B: days('20260919', '20261219', [6]),
    SUN_A: days('20260913', '20261220', [0], sunB),
    SUN_B: sunB,
  };
  function kingstonFeed(): GtfsData {
    const trips: GtfsData['trips'] = [];
    const stopTimes: GtfsData['stopTimes'] = [];
    for (const service of Object.keys(services)) {
      for (let i = 0; i < 6; i++) {
        const trip_id = `${service}-${i}`, m = 8 * 60 + i * 30;
        const t = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}:00`;
        trips.push({ route_id: 'R', service_id: service, trip_id, direction_id: '0', shape_id: 'sh' } as GtfsData['trips'][number]);
        stopTimes.push({ trip_id, arrival_time: t(m), departure_time: t(m), stop_id: 'a', stop_sequence: '1' } as GtfsData['stopTimes'][number]);
        stopTimes.push({ trip_id, arrival_time: t(m + 20), departure_time: t(m + 20), stop_id: 'b', stop_sequence: '2' } as GtfsData['stopTimes'][number]);
      }
    }
    const calendarDates = Object.entries(services).flatMap(([service_id, ds]) => ds.map(date => ({ service_id, date, exception_type: '1' })));
    return {
      routes: [{ route_id: 'R', route_short_name: 'R', route_type: '3' }],
      trips,
      stopTimes,
      stops: [{ stop_id: 'a', stop_name: 'A', stop_lat: '44.23', stop_lon: '-76.48' }, { stop_id: 'b', stop_name: 'B', stop_lat: '44.25', stop_lon: '-76.48' }],
      calendar: synthesizeCalendarFromDates(calendarDates as GtfsData['calendarDates']),
      calendarSynthesized: true,
      calendarDates,
    } as unknown as GtfsData;
  }
  const on = (week: ReturnType<typeof readWeekOf>, field: 'saturday' | 'sunday' | 'monday') =>
    week.calendar.filter(c => c[field] === '1').map(c => c.service_id).sort();

  it('the week of Sep 14 reads Saturday Sep 19 as both listed services and Sunday Sep 20 as SUN_B only', () => {
    const week = readWeekOf(kingstonFeed(), { anchor: '20260916' });
    expect(on(week, 'saturday')).toEqual(['SAT_A', 'SAT_B']);
    expect(on(week, 'sunday')).toEqual(['SUN_B']);
    expect(on(week, 'monday')).toEqual(['WK']);
  });

  it('a regular week (Nov 16) reads its own Sunday service, SUN_A', () => {
    const week = readWeekOf(kingstonFeed(), { anchor: '20261118' });
    expect(on(week, 'saturday')).toEqual(['SAT_A', 'SAT_B']);
    expect(on(week, 'sunday')).toEqual(['SUN_A']);
  });
});
