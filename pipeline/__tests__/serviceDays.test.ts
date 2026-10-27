import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DAY_NAMES, buildServiceDayTable, pickServiceWeek, serviceAnchor, splitServicePeriods,
  type ServiceDayTableInput,
} from '../serviceDays';
import { servicesRunningOn } from '../serviceDates';
import { pipelineRunDateYmd } from '../pipelineTimeZone';
import type { GtfsCalendar, GtfsCalendarDate } from '../../types/gtfs';

// Stage 1 of the reference-date plan (Atlas-worktrees/_reports/reference-date-plan-2026-10-26.md):
// the date-by-date table and the week picker as pure functions, not wired in. One synthetic feed
// per issue in the plan's section 4, plus expected weeks for inputs taken from the existing tests
// (next-service-dates, holiday-reference-week, transit-calendar, referenceDateFromRunDate,
// historyRefRepick). Builders are copied, not imported, so those suites are not registered twice.

const FIXTURES = resolve(__dirname, 'fixtures');

function cal(service_id: string, days: string, start_date: string, end_date: string): GtfsCalendar {
  const on = (d: string) => (days.includes(d) ? '1' : '0');
  return {
    service_id,
    monday: on('mo'), tuesday: on('tu'), wednesday: on('we'), thursday: on('th'),
    friday: on('fr'), saturday: on('sa'), sunday: on('su'),
    start_date, end_date,
  };
}
const added = (service_id: string, date: string): GtfsCalendarDate => ({ service_id, date, exception_type: '1' });
const removed = (service_id: string, date: string): GtfsCalendarDate => ({ service_id, date, exception_type: '2' });
const tripsOf = (service_id: string, route_id: string, n: number) => Array.from({ length: n }, () => ({ service_id, route_id }));

const num = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
const ymd = (n: number) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
/** Every date from..to inclusive. */
const dates = (from: string, to: string) => { const o: string[] = []; for (let n = num(from); n <= num(to); n++) o.push(ymd(n)); return o; };
/** 0 = Sunday ... 6 = Saturday. */
const dow = (s: string) => new Date(num(s) * 86400000).getUTCDay();
const isWeekday = (s: string) => dow(s) >= 1 && dow(s) <= 5;

const pick = (input: ServiceDayTableInput, options = {}) => pickServiceWeek(buildServiceDayTable(input), options);
const weekDates = (monday: string) => dates(monday, ymd(num(monday) + 6));
const skippedDates = (week: ReturnType<typeof pick>, reason = 'lost-vote') => week.skipped.filter(s => s.reason === reason).map(s => s.date);

/** Real fixture files (some are CRLF). */
function csv(dir: string, file: string): any[] {
  const [header, ...rows] = readFileSync(resolve(FIXTURES, dir, file), 'utf8').replace(/\r/g, '').trim().split('\n').map(l => l.split(','));
  return rows.map(row => Object.fromEntries(header.map((h, i) => [h, row[i]])));
}
function fixtureFeed(dir: string, tripCounts = false) {
  const trips = tripCounts
    ? csv(dir, 'trip_counts.txt').flatMap((r: any) => tripsOf(r.service_id, r.route_id, Number(r.trips)))
    : csv(dir, 'trips.txt').map((t: any) => ({ service_id: t.service_id, route_id: t.route_id }));
  return { calendar: csv(dir, 'calendar.txt') as GtfsCalendar[], calendarDates: csv(dir, 'calendar_dates.txt') as GtfsCalendarDate[], trips };
}
const routesOn = (trips: Array<{ service_id: string; route_id: string }>, services: string[]) =>
  new Set(trips.filter(t => services.includes(t.service_id)).map(t => t.route_id));

describe('serviceAnchor', () => {
  it('is the day after the run date', () => {
    expect(serviceAnchor('20261021')).toBe('20261022');
    expect(serviceAnchor('20261231')).toBe('20270101');
    expect(serviceAnchor('20270228')).toBe('20270301');
  });

  it('defaults to the run date in the pipeline time zone', () => {
    expect(serviceAnchor()).toBe(serviceAnchor(pipelineRunDateYmd()));
  });
});

describe('buildServiceDayTable', () => {
  it('records each date by GTFS rules: range and weekday flag, minus removals, plus additions', () => {
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20261001', '20261231'), cal('SU', 'su', '20261001', '20261231')];
    const calendarDates = [removed('WK', '20261111'), added('SU', '20261111'), added('EXTRA', '20261112')];
    const trips = [...tripsOf('WK', 'R', 10), ...tripsOf('SU', 'R', 4), ...tripsOf('EXTRA', 'X', 2)];
    const table = buildServiceDayTable({ calendar, calendarDates, trips, anchor: '20261110' });
    const row = (d: string) => table.days.find(r => r.date === d)!;
    expect(row('20261110')).toEqual({ date: '20261110', day: 'Tuesday', services: ['WK'], signature: 'R:10' });
    expect(row('20261112')).toMatchObject({ services: ['EXTRA', 'WK'], signature: 'R:10,X:2' });
    expect(row('20261114')).toMatchObject({ day: 'Saturday', services: [], signature: '' });
    // A Sunday service added on a holiday Wednesday is in the table (plain GTFS). servicesRunningOn,
    // used by the LA / Sound Transit opt-in, leaves it out: a deliberate difference (plan 3a).
    expect(row('20261111')).toMatchObject({ services: ['SU'], signature: 'R:4' });
    expect([...servicesRunningOn(calendar, calendarDates, '20261111')]).toEqual([]);
    // ...and that Wednesday then loses the vote.
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBe('20261116');
    expect(week.services.Wednesday).toEqual(['WK']);
    expect(skippedDates(week)).toEqual(['20261111', '20261112']);
  });

  it('gives different service_ids with the same trips per route the same signature', () => {
    // GCRTA-style rotating ids: A one week, B the next, same trips.
    const calendar = [cal('A', 'mo,tu,we,th,fr', '20261019', '20261023'), cal('B', 'mo,tu,we,th,fr', '20261026', '20261030')];
    const table = buildServiceDayTable({ calendar, calendarDates: [], trips: [...tripsOf('A', 'R', 5), ...tripsOf('B', 'R', 5)], anchor: '20261020' });
    const sig = (d: string) => table.days.find(r => r.date === d)!.signature;
    expect(sig('20261020')).toBe(sig('20261027'));
  });

  it('covers the anchor -7 days to +8 weeks, never walking a row to its far end (Clemson to 2050, #1040)', () => {
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20240101', '20501231')];
    const table = buildServiceDayTable({ calendar, calendarDates: [], trips: tripsOf('WK', 'R', 3), anchor: '20261021' });
    expect(table.source).toBe('anchor');
    expect(table.span).toEqual({ start: '20240101', end: '20501231' });
    expect(table.window).toEqual({ start: '20261014', end: '20261215' });
    expect(table.days).toHaveLength(63);
  });

  it('clips the window to the dates services with trips can run', () => {
    // A placeholder row with no weekday flag and a service with no trips do not extend the span.
    const calendar = [
      cal('WK', 'mo,tu,we,th,fr', '20261019', '20261120'),
      cal('PLACEHOLDER', '', '20260101', '20271231'),
      cal('NOTRIPS', 'mo,tu,we,th,fr', '20260101', '20271231'),
    ];
    const table = buildServiceDayTable({ calendar, calendarDates: [], trips: tripsOf('WK', 'R', 3), anchor: '20261021' });
    expect(table.window).toEqual({ start: '20261019', end: '20261120' });
    // NOTRIPS still runs and is listed; it adds nothing to the signature.
    expect(table.days[0]).toMatchObject({ services: ['NOTRIPS', 'WK'], signature: 'R:3' });
  });

  it('reads the feed\'s last 8 weeks when nothing runs from the anchor on (archived zip)', () => {
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20260601', '20261016')];
    const table = buildServiceDayTable({ calendar, calendarDates: [], trips: tripsOf('WK', 'R', 3), anchor: '20270115' });
    expect(table.source).toBe('last-weeks');
    expect(table.window).toEqual({ start: '20260822', end: '20261016' });
  });

  it('ends the window at the last date with service when the rows run on with every date removed (SLO Transit shape)', () => {
    // Found by the stage-3 shadow report: SLO Transit's main services run to 2027 in calendar.txt
    // but are removed on every date from Oct 20. The weeks after the last service read as an
    // empty new period starting within 7 days, so every day type came out empty.
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20260901', '20270101'), cal('SA', 'sa', '20260901', '20261031')];
    const calendarDates = dates('20261102', '20270101').filter(isWeekday).map(d => removed('WK', d));
    const table = buildServiceDayTable({ calendar, calendarDates, trips: [...tripsOf('WK', 'R', 10), ...tripsOf('SA', 'R', 6)], anchor: '20261028' });
    expect(table.source).toBe('anchor-feed-end');
    expect(table.window).toEqual({ start: '20260906', end: '20261031' });
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBe('20261019');
    expect(week.services.Monday).toEqual(['WK']);
    expect(week.services.Saturday).toEqual(['SA']);
  });

  it('reads the first 8 weeks of service when nothing runs in the 8 weeks from the anchor (a later start)', () => {
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20270301', '20270630')];
    const table = buildServiceDayTable({ calendar, calendarDates: [], trips: tripsOf('WK', 'R', 3), anchor: '20261021' });
    expect(table.source).toBe('first-weeks');
    expect(table.window).toEqual({ start: '20270301', end: '20270425' });
    expect(pickServiceWeek(table).weekStart).toBe('20270301');
  });

  it('is empty for a feed with no trips', () => {
    const table = buildServiceDayTable({ calendar: [cal('WK', 'mo', '20260101', '20261231')], calendarDates: [], trips: [], anchor: '20261021' });
    expect(table.source).toBe('empty');
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBeNull();
    for (const day of DAY_NAMES) expect(week.dates[day]).toBeNull();
  });
});

// ---- Feeds for the plan's section 4 ----

/** #764 Mont-Tremblant: Friday and Saturday service, one one-day row per date; Sat Oct 10 (Thanksgiving weekend) runs a holiday timetable. */
function montTremblant(): ServiceDayTableInput {
  const calendar: GtfsCalendar[] = [];
  const trips: Array<{ service_id: string; route_id: string }> = [];
  for (const d of dates('20261009', '20261219')) {
    if (dow(d) === 5) { calendar.push(cal(`F-${d}`, 'fr', d, d)); trips.push(...tripsOf(`F-${d}`, 'T1', 8)); }
    if (dow(d) === 6) { calendar.push(cal(`S-${d}`, 'sa', d, d)); trips.push(...tripsOf(`S-${d}`, 'T1', d === '20261010' ? 4 : 10)); }
  }
  return { calendar, calendarDates: [], trips, anchor: serviceAnchor('20261008') };
}

/** LA Metro rail (#1019), as in next-service-dates.test.ts: A has a one-day weekday id per date, B multi-day ids; B's weekday is swapped for a one-off on Wed Oct 28. */
function laRolling(): { calendar: GtfsCalendar[]; calendarDates: GtfsCalendarDate[] } {
  const calendar: GtfsCalendar[] = [];
  for (const d of dates('20261020', '20261103')) if (isWeekday(d)) calendar.push(cal(`A-wk-${d}`, 'mo,tu,we,th,fr', d, d));
  calendar.push(
    cal('A-sat', 'sa', '20261024', '20261031'),
    cal('A-sun-1025', 'su', '20261025', '20261025'),
    cal('A-sun-1101', 'su', '20261101', '20261101'),
    cal('B-wk', 'mo,tu,we,th,fr', '20261020', '20261103'),
    cal('B-wk-1028', 'mo,tu,we,th,fr', '20261028', '20261028'),
    cal('B-sat', 'sa', '20261024', '20261031'),
    cal('B-sun', 'su', '20261025', '20261101'),
  );
  return { calendar, calendarDates: [removed('B-wk', '20261028')] };
}

/** MBTA (#1050), as in historyRefRepick.test.ts: the main weekday id ends before Thanksgiving week and its successor starts after; that week runs one-day ids, the Thursday one the holiday timetable. */
function mbtaThanksgiving(): Omit<ServiceDayTableInput, 'anchor'> {
  const routes = Array.from({ length: 12 }, (_, i) => `R${i + 1}`);
  const tripsFor = (service: string, perRoute: number) => routes.flatMap(r => tripsOf(service, r, perRoute));
  const week = dates('20181119', '20181123');
  return {
    calendar: [
      cal('MAIN1', 'mo,tu,we,th,fr', '20180903', '20181118'), cal('MAIN2', 'mo,tu,we,th,fr', '20181126', '20190118'),
      cal('SAT', 'sa', '20180903', '20181221'), cal('SUN', 'su', '20180903', '20181221'),
      ...week.map(d => cal(`ONE-${d}`, 'mo,tu,we,th,fr,sa,su', d, d)),
    ],
    calendarDates: [],
    trips: [...tripsFor('MAIN1', 20), ...tripsFor('MAIN2', 20), ...tripsFor('SAT', 12), ...tripsFor('SUN', 8), ...week.flatMap(d => tripsFor(`ONE-${d}`, d === '20181122' ? 6 : 20))],
  };
}

/** VTA (#1082, CIV-791), as in transit-calendar.test.ts: same weekday trips old and new; the weekend blocks change. */
function vta(): Omit<ServiceDayTableInput, 'anchor'> {
  const routeIds = (n: number) => Array.from({ length: n }, (_, i) => `R${i + 1}`);
  const tripsFor = (service_id: string, routes: string[]) => routes.map(route_id => ({ service_id, route_id }));
  const all = routeIds(10);
  const weekend = routeIds(6);
  return {
    calendar: [
      cal('WD-old', 'motuwethfr', '20260819', '20261023'),
      cal('WD-old-b', 'motuwefr', '20260819', '20261023'),
      cal('Sat-old', 'sa', '20260815', '20261024'),
      cal('Sat-old-b', 'sa', '20260815', '20261024'),
      cal('Sun-old', 'su', '20260816', '20261025'),
      cal('Sun-old-b', 'su', '20260816', '20261025'),
      cal('WD-new', 'motuwethfr', '20261026', '20261231'),
      cal('WD-new-b', 'motuwefr', '20261026', '20261231'),
      cal('Sat-new', 'sa', '20261031', '20261231'),
      cal('Sun-new', 'su', '20261101', '20261231'),
    ],
    calendarDates: [],
    trips: [
      ...tripsFor('WD-old', all), ...tripsFor('WD-new', all),
      ...tripsFor('WD-old-b', routeIds(3)), ...tripsFor('WD-new-b', routeIds(3)),
      ...tripsFor('Sat-old', weekend), ...tripsFor('Sun-old', weekend),
      ...tripsFor('Sat-old-b', weekend), ...tripsFor('Sun-old-b', weekend),
      ...tripsFor('Sat-new', weekend), ...tripsFor('Sun-new', weekend),
    ],
  };
}

/** STM-like (CIV-469): calendar_dates only, Oct 5 2026 - Jan 3 2027, weekdays Dec 21 - Jan 1 on a holiday timetable. */
function stmDatesOnly(): Omit<ServiceDayTableInput, 'anchor'> {
  const holiday = new Set(dates('20261221', '20270101'));
  const calendarDates = dates('20261005', '20270103').map(d => added(dow(d) === 0 ? 'SU' : dow(d) === 6 ? 'SA' : holiday.has(d) ? 'HOL' : 'WK', d));
  const tripsFor = (service: string, n: number) => ['R1', 'R2'].flatMap(r => tripsOf(service, r, n));
  return { calendar: [], calendarDates, trips: [...tripsFor('WK', 20), ...tripsFor('HOL', 8), ...tripsFor('SA', 12), ...tripsFor('SU', 8)] };
}

/** Weekly service with a Sounder-style weekday line that also runs on one game-day Sunday (CIV-445). */
function gameDay(): Omit<ServiceDayTableInput, 'anchor'> {
  return {
    calendar: [
      cal('L-wk', 'mo,tu,we,th,fr', '20261001', '20270326'), cal('L-sat', 'sa', '20261001', '20270326'), cal('L-sun', 'su', '20261001', '20270326'),
      cal('S-wk', 'mo,tu,we,th,fr', '20261001', '20270326'), cal('S-hawks-1108', 'su', '20261108', '20261108'),
    ],
    calendarDates: [],
    trips: [...tripsOf('L-wk', 'L', 10), ...tripsOf('L-sat', 'L', 8), ...tripsOf('L-sun', 'L', 6), ...tripsOf('S-wk', 'S', 5), ...tripsOf('S-hawks-1108', 'S', 2)],
  };
}

describe('pickServiceWeek: issues in the plan (section 4)', () => {
  it('#764 Mont-Tremblant: the Thanksgiving Saturday loses the vote; the regular Fri/Sat of Oct 16-17 are read', () => {
    const week = pick(montTremblant());
    expect(week.weekStart).toBe('20261012');
    expect(week.dates.Friday).toBe('20261016');
    expect(week.dates.Saturday).toBe('20261017');
    expect(week.services.Friday).toEqual(['F-20261016']);
    expect(week.services.Saturday).toEqual(['S-20261017']);
    expect(week.services.Monday).toEqual([]);
    expect(skippedDates(week)).toEqual(['20261010']);
  });

  it('#921 Sound Transit (real calendar): the Oct 17-18 bus-bridge weekend loses the vote; the 1 and 2 Line weekend is read', () => {
    // Run Oct 16, as in holiday-reference-week.test.ts. Trips are capped at 5 per (route, service),
    // so a regular Saturday is 100479:5, 2LINE:5, TLINE:5 and the bridge Saturday adds 2-SHUTTLE:5.
    const feed = fixtureFeed('soundtransit-bus-bridge-calendar');
    const week = pick({ ...feed, anchor: serviceAnchor('20261016') });
    expect(week.weekStart).toBe('20261019');
    for (const day of ['Monday', 'Saturday', 'Sunday'] as const) {
      const routes = routesOn(feed.trips, week.services[day]);
      expect(routes.has('100479'), `1 Line ${day}`).toBe(true);
      expect(routes.has('2LINE'), `2 Line ${day}`).toBe(true);
      expect(routes.has('2-SHUTTLE'), `bridge ${day}`).toBe(false);
    }
    expect(week.services.Saturday).toEqual(['LLR_2026-10-03_20260903_Link_Fall26PHActive_Saturday', 'TLINE_2026-08-30_TLink_Saturday_ForGTFS_09162023_12mins']);
    // Skipped: the Oct 11 and Nov 8 Seahawks Sundays, the bridge weekend, and Thanksgiving Thu/Fri (no Sounder, holiday ids).
    expect(skippedDates(week)).toEqual(['20261011', '20261017', '20261018', '20261108', '20261126', '20261127']);
  });

  it('#1019 LA Metro rail: each weekday reads its own real date and its own one-day id', () => {
    const { calendar, calendarDates } = laRolling();
    const trips = calendar.map(c => ({ service_id: c.service_id, route_id: c.service_id[0] }));
    const week = pick({ calendar, calendarDates, trips, anchor: serviceAnchor('20261020') });
    // The span is Tue Oct 20 - Tue Nov 3; Oct 26 - Nov 1 is its only whole week.
    expect(week.weekStart).toBe('20261026');
    expect(DAY_NAMES.map(d => week.dates[d])).toEqual(weekDates('20261026'));
    expect(week.services.Monday).toEqual(['A-wk-20261026', 'B-wk']);
    expect(week.services.Wednesday).toEqual(['A-wk-20261028', 'B-wk-1028']);
    expect(week.services.Friday).toEqual(['A-wk-20261030', 'B-wk']);
    expect(week.services.Saturday).toEqual(['A-sat', 'B-sat']);
    expect(week.services.Sunday).toEqual(['A-sun-1101', 'B-sun']);
  });

  it('#1019 LA: a one-off weekday that loses the vote is read from another date of the short feed (rule 5)', () => {
    // B's Oct 28 one-off has an extra trip. Wednesdays Oct 21 and 28 tie 1:1; Oct 21 is nearer the anchor.
    const { calendar, calendarDates } = laRolling();
    const trips = [...calendar.map(c => ({ service_id: c.service_id, route_id: c.service_id[0] })), { service_id: 'B-wk-1028', route_id: 'B' }];
    const week = pick({ calendar, calendarDates, trips, anchor: serviceAnchor('20261020') });
    expect(week.weekStart).toBe('20261026');
    expect(week.dates.Wednesday).toBe('20261021');
    expect(week.services.Wednesday).toEqual(['A-wk-20261021', 'B-wk']);
    expect(week.substituted).toEqual(['Wednesday']);
    expect(skippedDates(week)).toEqual(['20261028']);
  });

  it('#1019 LA: an archived copy read after its window ended reads its last weeks', () => {
    const { calendar, calendarDates } = laRolling();
    const trips = calendar.map(c => ({ service_id: c.service_id, route_id: c.service_id[0] }));
    const table = buildServiceDayTable({ calendar, calendarDates, trips, anchor: serviceAnchor('20261120') });
    expect(table.source).toBe('last-weeks');
    expect(pickServiceWeek(table).weekStart).toBe('20261026');
  });

  it('#1038 Humboldt (real calendar): reads the fall CPH timetable in October with no start-date grouping', () => {
    const feed = fixtureFeed('humboldt-cph-semester');
    const week = pick({ ...feed, anchor: serviceAnchor('20261021') });
    expect(week.weekStart).toBe('20261019');
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(week.services[day]).toEqual(['WkDy CPH Group']);
    expect(week.services.Saturday).toEqual(['Sat CPH Group']);
    expect(week.services.Sunday).toEqual([]);
    expect(routesOn(feed.trips, week.services.Monday).has('HHM')).toBe(true);
    // Veterans Day (Sat timetable on a Wednesday), Thanksgiving week and the Nov 28 swap lose the vote.
    expect(skippedDates(week)).toEqual(['20261111', '20261123', '20261124', '20261125', '20261126', '20261127', '20261128']);
  });

  it('#1038 Humboldt (real calendar): reads the regular timetable in January', () => {
    const feed = fixtureFeed('humboldt-cph-semester');
    const week = pick({ ...feed, anchor: serviceAnchor('20270113') });
    expect(week.weekStart).toBe('20270111');
    expect(week.services.Monday).toEqual(['WkDy Reg']);
    expect(week.services.Saturday).toEqual(['Sat Reg']);
    expect(routesOn(feed.trips, week.services.Monday).has('HHM')).toBe(false);
    // MLK Day runs the Saturday timetable on a Monday.
    expect(skippedDates(week)).toEqual(['20270118']);
  });

  it('#1038 GPTC (real calendar): the lone-start weekday service 91161 is read', () => {
    const feed = fixtureFeed('gptc-91161-weekday');
    const week = pick({ ...feed, anchor: serviceAnchor('20261021') });
    expect(week.weekStart).toBe('20261019');
    expect(week.services.Monday).toEqual(['91161', 'L2-Wkdy']);
    expect(week.services.Saturday).toEqual(['91162', 'L2-Sat']);
    expect(week.skipped).toEqual([]);
  });

  it('#1050 MBTA Thanksgiving week loses the vote: the next week is read (its Thursday is Nov 29, as History v2 re-picks)', () => {
    const week = pick({ ...mbtaThanksgiving(), anchor: serviceAnchor('20181119') });
    expect(week.weekStart).toBe('20181126');
    expect(week.dates.Thursday).toBe('20181129');
    expect(week.services.Thursday).toEqual(['MAIN2']);
    expect(skippedDates(week)).toEqual(['20181122']);
  });

  it('#1082 VTA: a new period starting within 7 days is read, with its own weekend', () => {
    for (const run of ['20261021', '20261022', '20261023', '20261024']) {
      const week = pick({ ...vta(), anchor: serviceAnchor(run) });
      expect(week.weekStart, `run ${run}`).toBe('20261026');
      expect(week.services.Monday).toEqual(['WD-new', 'WD-new-b']);
      expect(week.services.Thursday).toEqual(['WD-new']);
      expect(week.services.Saturday).toEqual(['Sat-new']);
      expect(week.services.Sunday).toEqual(['Sun-new']);
      expect(week.period?.start).toBe('20261026');
    }
  });

  it('#1082 VTA: earlier, the old period is read whole (never an old Saturday with new weekdays)', () => {
    const week = pick({ ...vta(), anchor: serviceAnchor('20261016') });
    expect(week.weekStart).toBe('20261012');
    expect(week.services.Monday).toEqual(['WD-old', 'WD-old-b']);
    expect(week.services.Saturday).toEqual(['Sat-old', 'Sat-old-b']);
    expect(week.services.Sunday).toEqual(['Sun-old', 'Sun-old-b']);
  });

  it('#1082 VTA: the switch happens when the new period starts no more than 7 days after the anchor', () => {
    // New period from Mon Oct 26: anchor Oct 18 is 8 days before, Oct 19 is 7.
    expect(pick({ ...vta(), anchor: '20261018' }).services.Saturday).toEqual(['Sat-old', 'Sat-old-b']);
    expect(pick({ ...vta(), anchor: '20261019' }).services.Saturday).toEqual(['Sat-new']);
    // The lead is a parameter (plan question 5): with 0, riders' current timetable is read.
    expect(pick({ ...vta(), anchor: '20261022' }, { newPeriodLeadDays: 0 }).services.Saturday).toEqual(['Sat-old', 'Sat-old-b']);
  });

  it('CIV-469 STM: an archived calendar_dates-only zip ending in a holiday fortnight reads its last regular week', () => {
    const table = buildServiceDayTable({ ...stmDatesOnly(), anchor: '20270201' });
    expect(table.source).toBe('last-weeks');
    expect(table.window).toEqual({ start: '20261109', end: '20270103' });
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBe('20261214');
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(week.services[day]).toEqual(['WK']);
    expect(skippedDates(week)).toEqual([...dates('20261221', '20261225'), ...dates('20261228', '20270101')]);
  });

  it('CIV-469 STM: anchored at the zip\'s first week, that week is read', () => {
    const week = pick({ ...stmDatesOnly(), anchor: '20261005' });
    expect(week.weekStart).toBe('20261005');
    expect(week.services.Monday).toEqual(['WK']);
  });

  it('CIV-469 STM: an anchor a week before the feed ends in the holidays still reads the regular week', () => {
    // The feed ends Jan 3, inside the anchor's 8 weeks, so the window starts earlier (Nov 9) and
    // still holds 8 weeks: six regular Mondays outvote the two holiday ones.
    const table = buildServiceDayTable({ ...stmDatesOnly(), anchor: '20261215' });
    expect(table.source).toBe('anchor-feed-end');
    expect(table.window).toEqual({ start: '20261109', end: '20270103' });
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBe('20261214');
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(week.services[day]).toEqual(['WK']);
    expect(week.substituted).toEqual([]);
  });

  it('part-week route (Tue+Wed) stays part-week; every weekday reads its own date', () => {
    const calendar = [cal('R-wk', 'mo,tu,we,th,fr', '20261001', '20261231'), cal('P-tuwe', 'tu,we', '20261001', '20261231')];
    const trips = [...tripsOf('R-wk', 'R', 10), ...tripsOf('P-tuwe', 'P', 4)];
    const week = pick({ calendar, calendarDates: [], trips, anchor: serviceAnchor('20261020') });
    expect(week.weekStart).toBe('20261019');
    expect(new Set(DAY_NAMES.map(d => week.dates[d])).size).toBe(7);
    expect(week.services.Tuesday).toEqual(['P-tuwe', 'R-wk']);
    expect(week.services.Wednesday).toEqual(['P-tuwe', 'R-wk']);
    for (const day of ['Monday', 'Thursday', 'Friday'] as const) expect(week.services[day]).toEqual(['R-wk']);
  });

  it('two equally near clean weeks: the later one is read', () => {
    // Monday anchor (Oct 19): the week before is whole too. Wed Oct 21 is a holiday, so Oct 12 and
    // Oct 26 are both one week away; the later is read, like transit-calendar's later-date tie.
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20261001', '20261231')];
    const calendarDates = [removed('WK', '20261021'), added('HOL', '20261021')];
    const week = pick({ calendar, calendarDates, trips: [...tripsOf('WK', 'R', 10), ...tripsOf('HOL', 'R', 4)], anchor: '20261019' });
    expect(week.weekStart).toBe('20261026');
  });

  it('a game-day Sunday loses the vote (Sound Transit Sounder, CIV-445)', () => {
    // Run Mon Nov 2: the anchor week's Sunday (Nov 8) is a game day, so the next week is read.
    const week = pick({ ...gameDay(), anchor: serviceAnchor('20261102') });
    expect(week.weekStart).toBe('20261109');
    expect(week.services.Sunday).toEqual(['L-sun']);
    expect(week.services.Monday).toEqual(['L-wk', 'S-wk']);
    expect(skippedDates(week)).toEqual(['20261108']);
    // A week without a game day is read as is.
    expect(pick({ ...gameDay(), anchor: serviceAnchor('20261116') }).weekStart).toBe('20261116');
  });
});

describe('splitServicePeriods', () => {
  it('a single holiday week is not a period', () => {
    const calendar = [cal('WK', 'mo,tu,we,th,fr', '20261001', '20261231'), cal('SA', 'sa', '20261001', '20261231')];
    const hol = dates('20261116', '20261120');
    const calendarDates = hol.flatMap(d => [removed('WK', d), added('HOL', d)]);
    const trips = [...tripsOf('WK', 'R', 10), ...tripsOf('SA', 'R', 6), ...tripsOf('HOL', 'R', 3)];
    const split = splitServicePeriods(buildServiceDayTable({ calendar, calendarDates, trips, anchor: '20261021' }));
    expect(split.periods).toHaveLength(1);
    expect(split.straddling).toEqual([]);
  });

  it('a bus-bridge weekend is not a period (Sound Transit, real calendar)', () => {
    const split = splitServicePeriods(buildServiceDayTable({ ...fixtureFeed('soundtransit-bus-bridge-calendar'), anchor: '20261017' }));
    expect(split.periods).toHaveLength(1);
  });

  it('service that alternates week by week is not a period change', () => {
    // transit-calendar.test.ts: 'alt' runs in odd weeks only.
    const calendar = [cal('reg', 'mo,tu,we,th,fr', '20260928', '20261127'), cal('alt', 'mo,tu,we,th,fr', '20260928', '20261127')];
    const even = new Set([...dates('20261005', '20261009'), ...dates('20261019', '20261023'), ...dates('20261102', '20261106'), ...dates('20261116', '20261120')]);
    const calendarDates = dates('20260928', '20261127').filter(d => isWeekday(d) && even.has(d)).map(d => removed('alt', d));
    const trips = [...tripsOf('reg', 'R', 10), ...tripsOf('alt', 'R', 4)];
    const split = splitServicePeriods(buildServiceDayTable({ calendar, calendarDates, trips, anchor: '20261014' }));
    expect(split.periods).toHaveLength(1);
  });

  it('a two-week holiday at the end of the feed is not a period (CIV-469)', () => {
    expect(splitServicePeriods(buildServiceDayTable({ ...stmDatesOnly(), anchor: '20261215' })).periods).toHaveLength(1);
    expect(splitServicePeriods(buildServiceDayTable({ ...stmDatesOnly(), anchor: '20270201' })).periods).toHaveLength(1);
  });

  it('a weekend-only change of timetable is a period change (VTA, #1082)', () => {
    const split = splitServicePeriods(buildServiceDayTable({ ...vta(), anchor: '20261022' }));
    expect(split.periods.map(p => p[0])).toEqual(['20261012', '20261026']);
    expect(split.straddling).toEqual([]);
  });

  it('a timetable starting mid-week leaves that week straddling, and it is never read', () => {
    // New weekday timetable from Wed Oct 21; Monday and Tuesday change a week later than Wednesday-Friday.
    const calendar = [
      cal('WK1', 'mo,tu,we,th,fr', '20261001', '20261020'), cal('WK2', 'mo,tu,we,th,fr', '20261021', '20261231'),
      cal('SA', 'sa', '20261001', '20261231'),
    ];
    const trips = [...tripsOf('WK1', 'R', 10), ...tripsOf('WK2', 'R', 14), ...tripsOf('SA', 'R', 6)];
    const table = buildServiceDayTable({ calendar, calendarDates: [], trips, anchor: '20261015' });
    const split = splitServicePeriods(table);
    expect(split.straddling).toEqual(['20261019']);
    expect(split.periods.map(p => p[0])).toEqual(['20261005', '20261026']);
    // The change week starts 4 days after the anchor, so the new period is read.
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBe('20261026');
    expect(week.services.Monday).toEqual(['WK2']);
    expect(skippedDates(week, 'period-change')).toEqual(weekDates('20261019'));
  });
});

describe('pickServiceWeek: inputs from the existing tests', () => {
  it('TTC 506 shape (transit-calendar #658): the holiday Monday\'s week is passed over', () => {
    const calendar = [cal('1', 'mo,tu,we,th,fr', '20260930', '20261031'), cal('4', '', '20260930', '20261031')];
    const calendarDates = [added('4', '20261012'), removed('1', '20261012')];
    const trips = [...tripsOf('1', '506', 10), ...tripsOf('4', '506', 6)];
    const week = pick({ calendar, calendarDates, trips, anchor: '20261013' });
    expect(week.weekStart).toBe('20261019');
    expect(week.services.Monday).toEqual(['1']);
    expect(skippedDates(week)).toEqual(['20261012']);
  });

  it('SCT open-ended calendar (holiday-reference-week #658): bounded window, every route runs, 272-1 on Monday', () => {
    const feed = fixtureFeed('sct-open-ended-calendar', true);
    const table = buildServiceDayTable({ ...feed, anchor: serviceAnchor('20261010') });
    expect(table.window).toEqual({ start: '20261004', end: '20261205' });
    const week = pickServiceWeek(table);
    expect(week.weekStart).toBe('20261005');
    expect(week.services.Monday).toContain('272-1');
    const running = new Set(DAY_NAMES.flatMap(d => [...routesOn(feed.trips, week.services[d])]));
    expect(running.size).toBe(new Set(feed.trips.map(t => t.route_id)).size);
    expect(skippedDates(week)).toEqual(['20261126']);
  });

  it('NCSU Wolfline (referenceDateFromRunDate #774, real calendar): semester in October, break timetable in mid-December', () => {
    const feed = fixtureFeed('ncsu-wolfline-41-semester');
    const fall = pick({ ...feed, anchor: serviceAnchor('20261014') });
    expect(fall.weekStart).toBe('20261012');
    expect(fall.services.Wednesday).toEqual(['74000.218963']);
    expect(fall.services.Saturday).toEqual(['72451.219044']);
    // Dec 10 - Jan 8 runs the break timetable and the semester resumes Jan 11: two periods, and
    // Dec 17 is in the first.
    const winter = pick({ ...feed, anchor: serviceAnchor('20261216') });
    expect(winter.weekStart).toBe('20261214');
    expect(winter.services.Wednesday).toEqual(['74000.219021']);
    expect(winter.period?.end).toBe('20270110');
  });

  it('MBTA Thanksgiving-only feed (historyRefRepick): with one date of a kind, it is used (rule 5)', () => {
    // The old History re-pick drops this period; the plan's rule 5 reads the only dates there are.
    const feed = mbtaThanksgiving();
    feed.calendar = feed.calendar.filter(c => c.start_date === c.end_date);
    const week = pick({ ...feed, anchor: '20181124' });
    expect(week.weekStart).toBeNull();
    expect(DAY_NAMES.map(d => week.dates[d])).toEqual(['20181119', '20181120', '20181121', '20181122', '20181123', null, null]);
    expect(week.services.Thursday).toEqual(['ONE-20181122']);
  });

  it('alternating weeks with a holiday Monday (transit-calendar #658): known limit, Monday comes from another kind of week', () => {
    // The exact input of "moves the whole week so every day describes the same week": 'alt' runs
    // in odd weeks, and the regular service is removed on Mon Oct 12. The feed ends Nov 27, so the
    // window starts Oct 3: even Mondays win 4:3 (Oct 12 is the holiday), while Tuesday-Friday tie
    // 4:4 and the nearest is the anchor's odd week. The per-day vote (rule 2) then pairs an even Monday with odd
    // Tuesday-Friday, which the old whole-week move prevented. Recorded as a limit, not a target.
    const calendar = [cal('reg', 'mo,tu,we,th,fr', '20260928', '20261127'), cal('alt', 'mo,tu,we,th,fr', '20260928', '20261127')];
    const even = new Set([...dates('20261005', '20261009'), ...dates('20261019', '20261023'), ...dates('20261102', '20261106'), ...dates('20261116', '20261120')]);
    const calendarDates = [...dates('20260928', '20261127').filter(d => isWeekday(d) && even.has(d)).map(d => removed('alt', d)), removed('reg', '20261012')];
    const week = pick({ calendar, calendarDates, trips: [...tripsOf('reg', 'R', 10), ...tripsOf('alt', 'R', 4)], anchor: '20261014' });
    expect(week.weekStart).toBe('20261012');
    expect(week.dates.Monday).toBe('20261019');
    expect(week.services.Monday).toEqual(['reg']);
    for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(week.services[day]).toEqual(['alt', 'reg']);
  });

  it('carta (holiday-reference-week #734, real calendar): with the main period ended, only TriCounty Link is read', () => {
    // Old reference: Jul 3, inside the main period that ended Aug 15 (route-share guard). The new
    // model has no such guard: it reads what runs, 14 of the fixture's 38 routes on weekdays
    // (the ended main period's weekday service had 23). A stage-4 decision, recorded here.
    const feed = fixtureFeed('carta-stale-main-period');
    const week = pick({ ...feed, anchor: '20261013' });
    expect(week.weekStart).toBe('20261012');
    expect(week.services.Monday).toEqual(['c_70976_b_84051_d_31']);
    expect(routesOn(feed.trips, week.services.Monday).size).toBe(14);
  });

  it('miami-dade (holiday-reference-week #734, real calendar): with the bus periods ended, the long-range services are read', () => {
    // Old reference: Jun 7 (route-share guard). Bus periods ended Jul 19; the weekday read now
    // carries services 11 and 21, 45 of the fixture's 122 routes.
    const feed = fixtureFeed('miami-dade-stale-bus-periods');
    const week = pick({ ...feed, anchor: '20261013' });
    expect(week.weekStart).toBe('20261012');
    expect(week.services.Monday).toEqual(['11', '21']);
    expect(routesOn(feed.trips, week.services.Monday).size).toBe(45);
  });

  it('winter holidays (historyRefRepick winterFeed): the nearest week with no holiday is read', () => {
    // Anchor Dec 26 2018, feed ends Fri Jan 18: the window starts earlier (Nov 24) so it holds 8
    // weeks, and the holiday Tuesdays (Dec 25, Jan 1) lose 2:6. The weeks of Dec 24 and Dec 31
    // hold holidays; Dec 17 is the nearest clean week. The old re-pick read Dec 13 through its
    // fixed Dec 20 - Jan 6 window (plan question 3).
    const hol = ['20181224', '20181225', '20181226', '20190101'];
    const routes = Array.from({ length: 12 }, (_, i) => `R${i + 1}`);
    const tripsFor = (service: string, perRoute: number) => routes.flatMap(r => tripsOf(service, r, perRoute));
    const week = pick({
      calendar: [cal('MAIN', 'mo,tu,we,th,fr', '20180903', '20190118'), cal('SAT', 'sa', '20180903', '20190118'), cal('SUN', 'su', '20180903', '20190118')],
      calendarDates: hol.flatMap(d => [removed('MAIN', d), added('HOL', d)]),
      trips: [...tripsFor('MAIN', 20), ...tripsFor('SAT', 12), ...tripsFor('SUN', 8), ...tripsFor('HOL', 6)],
      anchor: '20181226',
    });
    expect(week.weekStart).toBe('20181217');
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(week.services[day]).toEqual(['MAIN']);
    expect(skippedDates(week)).toEqual(['20181224', '20181225', '20181226', '20190101']);
  });
});
