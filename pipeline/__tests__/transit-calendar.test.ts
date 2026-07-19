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
    // Two overlapping weekday periods; the superseded one is cancelled via type 2
    // on the nearest Monday to the reference date (20240615 is a Saturday → Monday 20240617).
    const calendar = [
      cal('old', 'mo,tu,we,th,fr', '20240101', '20241231'),
      cal('new', 'mo,tu,we,th,fr', '20240601', '20241231'),
    ];
    const calendarDates = [
      removed('old', '20240617'), // nearest Monday to 20240615
    ];
    const active = getActiveServiceIds(calendar, calendarDates, 'Monday', '20240615');
    expect(active.has('new')).toBe(true);
    expect(active.has('old')).toBe(false);
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
