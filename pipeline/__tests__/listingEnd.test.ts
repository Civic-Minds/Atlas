import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../parseGtfs.js';
import { feedVersionDate, findListingEnd, pickRiderWeek } from '../serviceDays.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../../types/gtfs.js';

// CIV-1011 stage 4 (Ryan and the manager, 2026-10-27): the map reads the week from the run date; when
// most of the scheduled trips stopped being listed and nothing replaced them, it keeps the last full
// listed week and the agency shows Ryan's notice with that date. Shapes from the local zips.

function cal(service_id: string, days: string, start_date: string, end_date: string): GtfsCalendar {
  const on = (d: string) => (days.includes(d) ? '1' : '0');
  return { service_id, monday: on('mo'), tuesday: on('tu'), wednesday: on('we'), thursday: on('th'), friday: on('fr'), saturday: on('sa'), sunday: on('su'), start_date, end_date };
}
const added = (service_id: string, date: string): GtfsCalendarDate => ({ service_id, date, exception_type: '1' });
const removed = (service_id: string, date: string): GtfsCalendarDate => ({ service_id, date, exception_type: '2' });
const tripsOf = (service_id: string, route_id: string, n: number) => Array.from({ length: n }, () => ({ service_id, route_id }));
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
/** Every date from `from` to `to` (YYYYMMDD) on the given weekdays (0 = Sunday). */
function dates(from: string, to: string, dows = [1, 2, 3, 4, 5]): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}T12:00:00Z`);
  for (; ymd(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) if (dows.includes(d.getUTCDay())) out.push(ymd(d));
  return out;
}
const ANCHOR = '20261028';
/** A file obtained in early summer, older than every listing end below. */
const FILE = '20260601';

describe('findListingEnd (CIV-1011 safeguard)', () => {
  it('Dutchess: the main rows end Oct 28 while a few trips run on to a placeholder year', () => {
    const calendar = [cal('MAIN', 'mo,tu,we,th,fr', '20260801', '20261028'), cal('SAT', 'sa', '20260801', '20261024'), cal('REST', 'mo,tu,we,th,fr', '20260801', '20351231')];
    const trips = [...tripsOf('MAIN', 'A', 40), ...tripsOf('MAIN', 'C', 30), ...tripsOf('SAT', 'A', 20), ...tripsOf('REST', 'C', 8)];
    const end = findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: FILE });
    expect(end?.date).toBe('20261028');
    expect(end!.tripShare).toBeGreaterThan(0.8);
    // The map keeps the last full listed week, with the main rows.
    const week = pickRiderWeek({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: FILE });
    expect(week.listingEnd?.date).toBe('20261028');
    expect(week.week.services.Monday).toEqual(['MAIN', 'REST']);
    expect(week.week.services.Saturday).toEqual(['SAT']);
  });

  it('Blacksburg: a calendar_dates-only feed whose semester services are listed only to Oct 30', () => {
    const calendarDates = [...dates('20260801', '20261030').map(d => added('SEM', d)), ...dates('20260801', '20261230').map(d => added('BLU', d))];
    const trips = [...tripsOf('SEM', 'HWA', 60), ...tripsOf('SEM', 'CRC', 40), ...tripsOf('BLU', 'BLU', 3)];
    expect(findListingEnd({ calendar: [], calendarDates, trips, anchor: ANCHOR, fileDate: FILE })?.date).toBe('20261030');
  });

  it('SLO Transit: weekday services stop Aug 14 and come back only for the file\'s last 19 days', () => {
    const calendarDates = [
      ...dates('20260601', '20260814').map(d => added('WK', d)), ...dates('20261214', '20270101').map(d => added('WK', d)),
      ...dates('20260101', '20270101', [4]).map(d => added('TROLLEY', d)),
    ];
    const trips = [...tripsOf('WK', '1A', 60), ...tripsOf('WK', '2A', 52), ...tripsOf('TROLLEY', 'Old SLO Trolley', 8)];
    const end = findListingEnd({ calendar: [], calendarDates, trips, anchor: ANCHOR, fileDate: FILE });
    expect(end?.date).toBe('20260814');
    expect(end?.endedRoutes).toEqual(['1A', '2A']);
  });

  it('is not tripped by a new timetable under new service ids (VTA, Oct 26)', () => {
    const calendar = [cal('OLD', 'mo,tu,we,th,fr', '20260801', '20261023'), cal('NEW', 'mo,tu,we,th,fr', '20261026', '20261231')];
    const trips = [...tripsOf('OLD', '22', 50), ...tripsOf('NEW', '22', 48)];
    expect(findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: FILE })).toBeNull();
  });

  it('is not tripped when a service already running takes over (Pierce Transit, Sep 28)', () => {
    const calendar = [cal('A', 'mo,we,th,fr', '20260801', '20260927'), cal('B', 'tu', '20260801', '20261212'), cal('B2', 'mo,we,th,fr', '20260928', '20261212')];
    const calendarDates: GtfsCalendarDate[] = [];
    const trips = [...tripsOf('A', '1', 100), ...tripsOf('B', '1', 100), ...tripsOf('B2', '1', 100)];
    // B2 is a new id here; the same holds when B's own row simply widens, which the total check reads.
    expect(findListingEnd({ calendar, calendarDates, trips, anchor: ANCHOR, fileDate: FILE })).toBeNull();
  });

  it('is not tripped by a break the service returns from for a term', () => {
    const calendarDates = [...dates('20260801', '20261016').map(d => added('SEM', d)), ...dates('20261130', '20270430').map(d => added('SEM', d)), ...dates('20260801', '20270430').map(d => added('BASE', d))];
    const trips = [...tripsOf('SEM', 'HWA', 60), ...tripsOf('BASE', 'BLU', 5)];
    expect(findListingEnd({ calendar: [], calendarDates, trips, anchor: ANCHOR, fileDate: FILE })).toBeNull();
  });

  it('is not tripped when the whole file runs out (the "timetable ended" notice covers it)', () => {
    const calendar = [cal('MAIN', 'mo,tu,we,th,fr', '20260801', '20261030'), cal('WE', 'sa,su', '20260801', '20261101')];
    const trips = [...tripsOf('MAIN', 'A', 50), ...tripsOf('WE', 'A', 20)];
    expect(findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: FILE })).toBeNull();
    // An expired file: nothing runs from the anchor on.
    expect(findListingEnd({ calendar: [cal('MAIN', 'mo,tu,we,th,fr', '20260101', '20260930')], calendarDates: [], trips: tripsOf('MAIN', 'A', 50), anchor: ANCHOR, fileDate: FILE })).toBeNull();
  });

  it('is not tripped when the file is newer than the end (the agency dropped the routes) or its date is unknown', () => {
    const calendar = [cal('MAIN', 'mo,tu,we,th,fr', '20260801', '20261028'), cal('REST', 'mo,tu,we,th,fr', '20260801', '20351231')];
    const trips = [...tripsOf('MAIN', 'A', 40), ...tripsOf('REST', 'C', 8)];
    expect(findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: '20261028' })?.date).toBe('20261028');
    expect(findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: '20261029' })).toBeNull();
    expect(findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR })).toBeNull();
  });

  it('is not tripped when the routes come back later in the file (a seasonal pause)', () => {
    const calendarDates = [...dates('20260601', '20261019', [0, 1, 2, 3, 4, 5, 6]).map(d => added('SUMMER', d)), ...dates('20261126', '20270405', [0, 1, 2, 3, 4, 5, 6]).map(d => added('SUMMER', d)), ...dates('20260601', '20270405').map(d => added('DAR', d))];
    const trips = [...tripsOf('SUMMER', 'Galloping Goose', 40), ...tripsOf('DAR', 'Dial-A-Ride', 1)];
    expect(findListingEnd({ calendar: [], calendarDates, trips, anchor: ANCHOR, fileDate: FILE })).toBeNull();
  });

  it('is not tripped when the same file lists the next season later (Telluride\'s Oct 16 file: winter from Nov 20)', () => {
    const name = 'telluride-oct16-winter';
    const read = (file: string) => parseCsv(readFileSync(resolve(__dirname, 'fixtures', name, file), 'utf8')) as never[];
    expect(findListingEnd({ calendar: read('calendar.txt'), calendarDates: read('calendar_dates.txt'), trips: read('trips.txt'), routes: read('routes.txt'), anchor: ANCHOR, fileDate: '20261016' })).toBeNull();
  });

  it('reads a feed_version that is a date', () => {
    expect(feedVersionDate('2026-03-27T18:13:21Z')).toBe('20260327');
    expect(feedVersionDate('UTC: 02-Jun-2026 18:30')).toBe('20260602');
    expect(feedVersionDate('20250617')).toBe('20250617');
    for (const v of ['124', 'FY27 Blacksburg 1.8A', '1', '', null]) expect(feedVersionDate(v)).toBeNull();
  });

  it('is not tripped by a few discontinued school expresses (Marathon County X1-X9, 2025)', () => {
    const calendar = [cal('REG', 'mo,tu,we,th,fr', '20250101', '20261231'), cal('X', 'mo,tu,we,th,fr', '20250101', '20250604')];
    const trips = [...tripsOf('REG', 'B', 60), ...tripsOf('X', 'X1', 4), ...tripsOf('X', 'X2', 4)];
    expect(findListingEnd({ calendar, calendarDates: [], trips, anchor: ANCHOR, fileDate: FILE })).toBeNull();
  });
});

describe('a late-December run reads the regular week, not the holidays (CIV-1011, the manager 2026-10-27)', () => {
  const read = (name: string, file: string) => {
    try { return parseCsv(readFileSync(resolve(__dirname, 'fixtures', name, file), 'utf8')) as never[]; } catch { return [] as never[]; }
  };

  it('SEPTA (Dec 28): weekdays read the regular service, not the holiday fortnight', () => {
    const name = 'septa-66-weekday';
    const week = pickRiderWeek({ calendar: read(name, 'calendar.txt'), calendarDates: read(name, 'calendar_dates.txt'), trips: read(name, 'trips.txt'), routes: read(name, 'routes.txt'), anchor: '20261229' });
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(week.week.services[day], day).toEqual(['10']);
    expect(week.listingEnd).toBeNull();
  });

  it('TriMet and King County (Dec 28): New Year\'s Day is not read as a Friday', () => {
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20260830', '20270320'), cal('SA', 'sa', '20260830', '20270320'), cal('SU', 'su', '20260830', '20270320')];
    const calendarDates = [removed('WK', '20261225'), added('SU', '20261225'), removed('WK', '20270101'), added('SU', '20270101')];
    const trips = [...tripsOf('WK', '72', 60), ...tripsOf('SA', '72', 40), ...tripsOf('SU', '72', 30)];
    const week = pickRiderWeek({ calendar, calendarDates, trips, anchor: '20261229' });
    expect(week.week.services.Friday).toEqual(['WK']);
    expect(week.week.services.Sunday).toEqual(['SU']);
  });
});
