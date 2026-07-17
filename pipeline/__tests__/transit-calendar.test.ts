import { describe, it, expect } from 'vitest';
import { detectReferenceDate } from '../transit-calendar.js';
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
