import { describe, it, expect } from 'vitest';
import { detectReferenceDate, getActiveServiceIds } from '../transit-calendar.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../../types/gtfs.js';

function cal(service_id: string, days: string, start_date: string, end_date: string): GtfsCalendar {
  const on = (d: string) => (days.includes(d) ? '1' : '0');
  return {
    service_id,
    monday: on('mo'), tuesday: on('tu'), wednesday: on('we'), thursday: on('th'),
    friday: on('fr'), saturday: on('sa'), sunday: on('su'),
    start_date, end_date,
  };
}

function added(service_id: string, date: string): GtfsCalendarDate {
  return { service_id, date, exception_type: '1' };
}

function removed(service_id: string, date: string): GtfsCalendarDate {
  return { service_id, date, exception_type: '2' };
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Every Monday-Friday date from start to end inclusive, as YYYYMMDD. */
function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8));
  for (; ymd(d) <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() >= 1 && d.getDay() <= 5) out.push(ymd(d));
  }
  return out;
}

function weekdayUnion(calendar: GtfsCalendar[], calendarDates: GtfsCalendarDate[], ref: string): string[] {
  const ids = new Set<string>();
  for (const day of WEEKDAY_NAMES) for (const id of getActiveServiceIds(calendar, calendarDates, day, ref)) ids.add(id);
  return [...ids].sort();
}

describe('detectReferenceDate', () => {
  it('ignores calendarDates that recur across multiple years (Emery Go-Round pattern)', () => {
    // Real dominant service: weekday + Sat + Sun, all starting the same date.
    const calendar = [
      cal('wkdy1', 'mo,tu,we,th,fr', '20240101', '20250101'),
      cal('wkdy2', 'mo,tu,we,th,fr', '20240101', '20250101'),
      cal('sat', 'sa', '20240101', '20250101'),
      cal('sun', 'su', '20240101', '20250101'),
    ];
    // Recurring Christmas-week exceptions recorded across three separate years —
    // not a tight one-time window, so their midpoint isn't a reliable signal.
    const calendarDates = [
      added('wkdy1', '20221224'),
      added('wkdy1', '20231224'),
      added('wkdy1', '20251231'),
    ];
    const ref = detectReferenceDate(calendar, calendarDates);
    // Should reflect the real dominant group's window (2024-01-01..2025-01-01), not
    // the ~2024-06-ish midpoint of the scattered multi-year holiday exceptions.
    expect(ref.startsWith('2024')).toBe(true);
  });

  it('overrides with a tight calendarDates cluster when it precedes the calendar-derived reference (Foothill pattern)', () => {
    // A single year-long multi-entry group pulls the naive reference to mid-year (~July).
    const calendar = [
      cal('wkdy', 'mo,tu,we,th,fr', '20240101', '20241231'),
      cal('wknd', 'sa,su', '20240101', '20241231'),
    ];
    // But the actual service window, per calendarDates, is a tight cluster in January —
    // more than 90 days before the calendar-derived mid-year reference.
    const calendarDates = [
      added('wkdy', '20240105'),
      added('wkdy', '20240108'),
      added('wkdy', '20240110'),
      added('wkdy', '20240112'),
    ];
    const ref = detectReferenceDate(calendar, calendarDates);
    expect(ref.startsWith('202401')).toBe(true);
  });

  it('does not override when the calendarDates cluster is later than the calendar reference (Kingston pattern)', () => {
    // Calendar-derived reference already lands early (Jan-Apr window).
    const calendar = [
      cal('wkdy', 'mo,tu,we,th,fr', '20240101', '20240401'),
      cal('wknd', 'sa,su', '20240101', '20240401'),
    ];
    // A later, tight calendarDates cluster (e.g. a phantom/placeholder service)
    // should not pull the reference forward.
    const calendarDates = [
      added('wkdy', '20240901'),
      added('wkdy', '20240905'),
      added('wkdy', '20240910'),
    ];
    const ref = detectReferenceDate(calendar, calendarDates);
    expect(ref.startsWith('202409')).toBe(false);
  });

  it('excludes a near-empty placeholder group even when it starts later (Dutchess pattern)', () => {
    const calendar = [
      cal('wkdy1', 'mo,tu,we,th,fr', '20240101', '20241231'),
      cal('wkdy2', 'mo,tu,we,th,fr', '20240101', '20241231'),
      // Later-starting group, but only carries a couple of trips.
      cal('placeholder1', 'mo', '20241201', '20241231'),
      cal('placeholder2', 'tu', '20241201', '20241231'),
    ];
    const trips = [
      ...Array.from({ length: 300 }, (_, i) => ({ service_id: 'wkdy1', trip_id: `w1-${i}` })),
      ...Array.from({ length: 300 }, (_, i) => ({ service_id: 'wkdy2', trip_id: `w2-${i}` })),
      { service_id: 'placeholder1', trip_id: 'p1' },
      { service_id: 'placeholder2', trip_id: 'p2' },
    ];
    const ref = detectReferenceDate(calendar, undefined, trips);
    expect(ref.startsWith('2024-12') || ref.startsWith('202412')).toBe(false);
  });
});

describe('getActiveServiceIds', () => {
  it('applies calendar_dates exception_type=2 to calendar.txt services (Grenoble pattern)', () => {
    // Two overlapping weekday periods; the superseded one is cancelled via type 2 on
    // every date of the overlap, as the real TAG Grenoble feed does (a removal on one
    // date only is a holiday, covered below). 20240615 is a Saturday → Monday 20240617.
    const calendar = [
      cal('old', 'mo,tu,we,th,fr', '20240101', '20241231'),
      cal('new', 'mo,tu,we,th,fr', '20240601', '20241231'),
    ];
    const calendarDates = weekdaysBetween('20240603', '20240830').map(d => removed('old', d));
    const active = getActiveServiceIds(calendar, calendarDates, 'Monday', '20240615');
    expect(active.has('new')).toBe(true);
    expect(active.has('old')).toBe(false);
  });

  it('keeps the superseded period removed when a school-holiday week is the reference week (Grenoble pattern)', () => {
    // Term service 'term' and holiday-week service 'vac' overlap. Each date removes the
    // one not running: 'vac' on term dates, 'term' on the two holiday weeks. A holiday
    // week swaps one service for another rather than removing normal service, so it is
    // read as before, and the two periods are never both counted.
    const calendar = [
      cal('term', 'mo,tu,we,th,fr', '20261001', '20261218'),
      cal('vac', 'mo,tu,we,th,fr', '20261001', '20261218'),
    ];
    const holidayWeeks = new Set(weekdaysBetween('20261019', '20261030'));
    const calendarDates = weekdaysBetween('20261001', '20261218').map(d =>
      removed(holidayWeeks.has(d) ? 'term' : 'vac', d));
    for (const day of WEEKDAY_NAMES) {
      expect([...getActiveServiceIds(calendar, calendarDates, day, '20261021')]).toEqual(['vac']);
      expect([...getActiveServiceIds(calendar, calendarDates, day, '20261111')]).toEqual(['term']);
    }
  });

  it('keeps both overlapping calendar services when no type-2 removal applies', () => {
    const calendar = [
      cal('a', 'mo,tu,we,th,fr', '20240101', '20241231'),
      cal('b', 'mo,tu,we,th,fr', '20240601', '20241231'),
    ];
    const active = getActiveServiceIds(calendar, [], 'Monday', '20240615');
    expect(active.has('a')).toBe(true);
    expect(active.has('b')).toBe(true);
  });

  it('includes calendar_dates-only services with enough weekday occurrences', () => {
    // Four Mondays within 90 days of ref — regular calendar_dates-only service.
    const calendarDates = [
      added('cd_only', '20240603'),
      added('cd_only', '20240610'),
      added('cd_only', '20240617'),
      added('cd_only', '20240624'),
    ];
    const active = getActiveServiceIds([], calendarDates, 'Monday', '20240615');
    expect(active.has('cd_only')).toBe(true);
  });

  it('picks the single-occurrence service closest to referenceDate (GO-style)', () => {
    // Each Monday is its own service_id (count 1). Prefer the one nearest ref.
    const calendarDates = [
      added('week1', '20240603'),
      added('week2', '20240610'),
      added('week3', '20240617'), // nearest Monday to 20240615
      added('week4', '20240624'),
    ];
    const active = getActiveServiceIds([], calendarDates, 'Monday', '20240615');
    expect([...active]).toEqual(['week3']);
  });

  it('uses single-day calendar entries only when no multi-day service is active (Burlington holiday pattern)', () => {
    const calendar = [
      cal('regular', 'mo,tu,we,th,fr', '20240101', '20241231'),
      // Single-day holiday with all DOW=1 — must not merge with regular weekdays.
      cal('victoria', 'mo,tu,we,th,fr,sa,su', '20240520', '20240520'),
    ];
    const active = getActiveServiceIds(calendar, [], 'Monday', '20240520');
    expect(active.has('regular')).toBe(true);
    expect(active.has('victoria')).toBe(false);
  });

  it('falls back to single-day calendar when multi-day has no coverage on that DOW', () => {
    // Multi-day is weekends only; Monday falls through to single-day Pass B.
    const calendar = [
      cal('weekend', 'sa,su', '20240101', '20241231'),
      cal('special_monday', 'mo', '20240617', '20240617'),
    ];
    const active = getActiveServiceIds(calendar, [], 'Monday', '20240615');
    expect(active.has('special_monday')).toBe(true);
    expect(active.has('weekend')).toBe(false);
  });
});

describe('getActiveServiceIds holiday in the reference week (#658)', () => {
  // TTC shape: regular Mon-Fri service 1, an all-zero placeholder holiday service 4
  // added on Thanksgiving Monday, which also removes service 1.
  const calendar = [
    cal('1', 'mo,tu,we,th,fr', '20260930', '20261031'),
    cal('4', '', '20260930', '20261031'),
  ];
  const calendarDates = [added('4', '20261012'), removed('1', '20261012')];

  it('reads a holiday Monday from a typical week instead of picking the holiday service', () => {
    expect([...getActiveServiceIds(calendar, calendarDates, 'Monday', '20261015')]).toEqual(['1']);
    expect(weekdayUnion(calendar, calendarDates, '20261015')).toEqual(['1']);
  });

  it('leaves weeks without a holiday unchanged', () => {
    expect([...getActiveServiceIds(calendar, calendarDates, 'Monday', '20261022')]).toEqual(['1']);
  });

  it('handles a feed that starts mid-week with the holiday in its first week', () => {
    // Starts on a Thursday (Oct 8), so the holiday Monday is the feed's first Monday and
    // the typical week has to come from after it.
    const midWeek = [cal('1', 'mo,tu,we,th,fr', '20261008', '20261106'), cal('4', '', '20261008', '20261106')];
    expect([...getActiveServiceIds(midWeek, calendarDates, 'Monday', '20261010')]).toEqual(['1']);
  });

  it('leaves the day empty rather than merging the holiday service when no typical week exists (short feed)', () => {
    const shortFeed = [cal('1', 'mo,tu,we,th,fr', '20261012', '20261016'), cal('4', '', '20261012', '20261016')];
    expect(getActiveServiceIds(shortFeed, calendarDates, 'Monday', '20261014').size).toBe(0);
    expect(weekdayUnion(shortFeed, calendarDates, '20261014')).toEqual(['1']);
  });

  it('moves the whole week so every day describes the same week', () => {
    // Monday is a holiday, and an alternating service 'alt' runs only in odd weeks.
    // Moving Monday alone to the next week would read 'alt' from a different week than
    // Tuesday-Friday; moving the whole week keeps the days consistent.
    const cal3 = [cal('reg', 'mo,tu,we,th,fr', '20260928', '20261127'), cal('alt', 'mo,tu,we,th,fr', '20260928', '20261127')];
    const evenWeeks = new Set([...weekdaysBetween('20261005', '20261009'), ...weekdaysBetween('20261019', '20261023'),
      ...weekdaysBetween('20261102', '20261106'), ...weekdaysBetween('20261116', '20261120')]);
    const dates = [
      ...weekdaysBetween('20260928', '20261127').filter(d => evenWeeks.has(d)).map(d => removed('alt', d)),
      removed('reg', '20261012'),
    ];
    // Reference week Oct 12-16 is an odd week ('alt' runs); Monday Oct 12 also lost 'reg'.
    // The next odd week (Oct 26-30) is read for every day.
    for (const day of WEEKDAY_NAMES) {
      expect([...getActiveServiceIds(cal3, dates, day, '20261014')].sort()).toEqual(['alt', 'reg']);
    }
  });

  it('does not mix a university-break week with term weeks', () => {
    // 'term' runs in term weeks, 'break' in break weeks; each removes the other. A break
    // week swaps services rather than removing normal service, so it is read as before,
    // and the Weekday union never holds both.
    const term = [cal('term', 'mo,tu,we,th,fr', '20261101', '20270131'), cal('break', 'mo,tu,we,th,fr', '20261101', '20270131')];
    const breakDates = new Set(weekdaysBetween('20261221', '20270101'));
    const dates = weekdaysBetween('20261102', '20270129').map(d => removed(breakDates.has(d) ? 'term' : 'break', d));
    expect(weekdayUnion(term, dates, '20261224')).toEqual(['break']);
  });

  it('leaves out a calendar_dates-only replacement service added on the holiday (WMATA pattern)', () => {
    // 'hol' replaces the regular service on holidays and break days, often enough that
    // its Tuesday count alone would pass the regular-service threshold.
    const cal2 = [cal('reg', 'mo,tu,we,th,fr', '20260913', '20270327')];
    const holDates = ['20261013', '20261103', '20261222', '20261229', '20270126'];
    const dates = holDates.flatMap(d => [added('hol', d), removed('reg', d)]);
    expect([...getActiveServiceIds(cal2, dates, 'Tuesday', '20261219')]).toEqual(['reg']);
  });

  it('does not touch feeds that only use calendar_dates.txt', () => {
    // Regular weekday service listed date by date, skipping the holiday; the holiday
    // service has one date. Step 2 already excludes it.
    const dates = [
      ...weekdaysBetween('20260928', '20261030').filter(d => d !== '20261012').map(d => added('wk', d)),
      added('hol', '20261012'),
    ];
    expect([...getActiveServiceIds([], dates, 'Monday', '20261015')]).toEqual(['wk']);
  });
});
