import { afterEach, describe, expect, it, vi } from 'vitest';
import { synthesizeCalendarFromDates } from '../parseGtfs';
import { detectReferenceDate, getActiveServiceIds } from '../transit-calendar';
import type { GtfsCalendar, GtfsCalendarDate } from '../../types/gtfs';

// #742: the reference date must not depend on the run date landing on a holiday.

const runOn = (ymd: string) => vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00`) });
afterEach(() => { vi.useRealTimers(); });

const cal = (service_id: string, days: string, start_date: string, end_date: string): GtfsCalendar => {
  const [monday, tuesday, wednesday, thursday, friday, saturday, sunday] = days.split('');
  return { service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date } as GtfsCalendar;
};
const tripsFor = (counts: Record<string, number>) => Object.entries(counts).flatMap(([service_id, n]) =>
  Array.from({ length: n }, (_, i) => ({ service_id, route_id: `${service_id}-r${i % 3}` })));
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
/** calendar_dates additions for every date in [start, end] whose weekday (0 = Sunday) is in `dows`. */
const added = (service_id: string, dows: number[], start: string, end: string): GtfsCalendarDate[] => {
  const out: GtfsCalendarDate[] = [];
  const d = new Date(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8));
  for (; ymd(d) <= end; d.setDate(d.getDate() + 1)) if (dows.includes(d.getDay())) out.push({ service_id, date: ymd(d), exception_type: '1' } as GtfsCalendarDate);
  return out;
};

describe('one-day holiday period on the run date (CDTA, MBTA on Oct 12, 2026)', () => {
  // Regular weekday, Saturday and Sunday timetables, plus a one-day Columbus Day group
  // (two services that start and end on Oct 12), as in CDTA's feed.
  const calendar = [
    cal('wk', '1111100', '20260830', '20261231'), cal('sat', '0000010', '20260830', '20261231'), cal('sun', '0000001', '20260830', '20261231'),
    cal('hol-a', '1111100', '20261012', '20261012'), cal('hol-b', '1111100', '20261012', '20261012'),
  ];
  const calendarDates = [{ service_id: 'wk', date: '20261012', exception_type: '2' }] as GtfsCalendarDate[];
  const trips = tripsFor({ wk: 30, sat: 20, sun: 20, 'hol-a': 10, 'hol-b': 10 });

  it('gives the same reference on the holiday as on the next day, with the weekend timetables', () => {
    runOn('20261013');
    const nextDay = detectReferenceDate(calendar, calendarDates, trips);
    runOn('20261012');
    const holiday = detectReferenceDate(calendar, calendarDates, trips);
    expect(holiday).toBe(nextDay);
    expect(holiday).not.toBe('20261012');
    expect(getActiveServiceIds(calendar, calendarDates, 'Saturday', holiday).has('sat')).toBe(true);
    expect(getActiveServiceIds(calendar, calendarDates, 'Sunday', holiday).has('sun')).toBe(true);
  });

  it('still takes a new multi-day period that starts on the run date', () => {
    // A fall timetable starting today is a real period, not a holiday: it stays the reference period.
    const fall = [...calendar.slice(0, 3).map(c => ({ ...c, end_date: '20261011' })),
      cal('fwk', '1111100', '20261012', '20261231'), cal('fsat', '0000010', '20261012', '20261231')];
    const fallTrips = tripsFor({ wk: 30, sat: 20, sun: 20, fwk: 30, fsat: 20 });
    runOn('20261012');
    const ref = detectReferenceDate(fall, [], fallTrips);
    expect(ref >= '20261012' && ref <= '20261231').toBe(true);
    expect(getActiveServiceIds(fall, [], 'Saturday', ref).has('fsat')).toBe(true);
  });
});

describe('holiday week in a calendar_dates-only feed (Metro-North, Oct 12, 2026)', () => {
  // Weekday services listed by date: one through Nov 20, the next from Nov 30, and a
  // Monday-only service through Jan 11 that pulls the period midpoint to Thanksgiving week.
  const dates = (nextStart: string) => [
    ...added('wk1', [1, 2, 3, 4, 5], '20261012', '20261120'),
    ...added('mon', [1], '20261012', '20270111'),
    ...added('wk2', [1, 2, 3, 4, 5], nextStart, '20270129'),
  ];
  const trips = tripsFor({ wk1: 30, mon: 2, wk2: 30 });

  it('moves the reference out of the week with no weekday timetable', () => {
    const calendarDates = dates('20261130');
    const calendar = synthesizeCalendarFromDates(calendarDates);
    runOn('20261012');
    const ref = detectReferenceDate(calendar, calendarDates, trips);
    expect(ref < '20261123' || ref > '20261129').toBe(true);
    for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
      expect(getActiveServiceIds(calendar, calendarDates, day, ref).size).toBeGreaterThan(0);
    }
  });

  it('leaves the reference alone when the weekday timetables are continuous', () => {
    const calendarDates = dates('20261123');
    const calendar = synthesizeCalendarFromDates(calendarDates);
    runOn('20261012');
    expect(detectReferenceDate(calendar, calendarDates, trips)).toBe('20261126');
  });

  it('never moves a feed that has a calendar.txt, even with the same gap', () => {
    const calendar = [cal('wk1', '1111100', '20261012', '20261120'), cal('mon', '1000000', '20261012', '20270111'), cal('wk2', '1111100', '20261130', '20270129')];
    runOn('20261012');
    expect(detectReferenceDate(calendar, [], trips)).toBe('20261126');
  });
});
