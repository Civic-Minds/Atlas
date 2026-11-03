import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { agencyProcessOptions, processAgencyFeeds } from '../agencyFeeds.js';
import { processGtfsBuffer } from '../process-core.js';
import { pickedWeekQuality } from '../historyRefQuality.js';
import { readFeedEvidence } from '../historyWeekend.js';
import { DAY_NAMES, firstFullWeekAnchor, pickRiderWeek } from '../serviceDays.js';

/**
 * CIV-1101 Part B: History's old re-pick (historyRefRepick.ts, retired) moved a holiday-week
 * reference date to a normal week through a fixed holiday list. New snapshots read the one
 * service-day model's week instead. These are the re-pick's fixtures, rewritten as the week the
 * new picker reads: a holiday is a day that loses the vote, with no list.
 */
type RepickRows = { calendar: any[]; calendarDates: any[]; trips: Array<{ service_id: string; route_id: string }> };

const ymd = (n: number) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const num = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
const dates = (from: string, to: string) => { const o: string[] = []; for (let n = num(from); n <= num(to); n++) o.push(ymd(n)); return o; };
const dow = (s: string) => new Date(num(s) * 86400000).getUTCDay();

const ROUTES = Array.from({ length: 12 }, (_, i) => `R${i + 1}`);
const week = (rows: RepickRows, anchor: string) => pickRiderWeek({ ...rows, anchor });
const readDates = (w: ReturnType<typeof week>) => DAY_NAMES.map(d => w.week.dates[d]);
const tripsFor = (service: string, perRoute: number) => ROUTES.flatMap(route_id => Array.from({ length: perRoute }, () => ({ service_id: service, route_id })));
const cal = (service_id: string, days: [number, number, number, number, number, number, number], start_date: string, end_date: string) => ({
  service_id, sunday: String(days[0]), monday: String(days[1]), tuesday: String(days[2]), wednesday: String(days[3]), thursday: String(days[4]), friday: String(days[5]), saturday: String(days[6]), start_date, end_date,
}) as any;
const MF: [number, number, number, number, number, number, number] = [0, 1, 1, 1, 1, 1, 0];

/**
 * MBTA shape: the main weekday service ends before Thanksgiving week and its successor starts after
 * it (same timetable), so the reference date inside the week finds only the one-day ids (the
 * Thursday one is the holiday timetable).
 */
function thanksgivingFeed(): RepickRows {
  const week = dates('20181119', '20181123');
  const repl = week.map(d => cal(`ONE-${d}`, [1, 1, 1, 1, 1, 1, 1], d, d));
  return {
    calendar: [
      cal('MAIN1', MF, '20180903', '20181118'), cal('MAIN2', MF, '20181126', '20190118'),
      cal('SAT', [0, 0, 0, 0, 0, 0, 1], '20180903', '20181221'), cal('SUN', [1, 0, 0, 0, 0, 0, 0], '20180903', '20181221'), ...repl,
    ],
    calendarDates: [],
    trips: [...tripsFor('MAIN1', 20), ...tripsFor('MAIN2', 20), ...tripsFor('SAT', 12), ...tripsFor('SUN', 8), ...week.flatMap(d => tripsFor(`ONE-${d}`, d === '20181122' ? 6 : 20))],
  };
}

function winterFeed(): RepickRows {
  // Weekday service Sep-Jan; Dec 24-26 and Jan 1 run a holiday timetable.
  const hol = ['20181224', '20181225', '20181226', '20190101'];
  return {
    calendar: [cal('MAIN', MF, '20180903', '20190118'), cal('SAT', [0, 0, 0, 0, 0, 0, 1], '20180903', '20190118'), cal('SUN', [1, 0, 0, 0, 0, 0, 0], '20180903', '20190118')],
    calendarDates: hol.flatMap(d => [{ service_id: 'MAIN', date: d, exception_type: '2' }, { service_id: 'HOL', date: d, exception_type: '1' }]) as any,
    trips: [...tripsFor('MAIN', 20), ...tripsFor('SAT', 12), ...tripsFor('SUN', 8), ...tripsFor('HOL', 6)],
  };
}

function datesOnlyFeed(from: string, to: string, override: Record<string, 'WK' | 'SA' | 'SU'> = {}): RepickRows {
  const calendarDates = dates(from, to).map(d => ({ service_id: override[d] ?? (dow(d) === 0 ? 'SU' : dow(d) === 6 ? 'SA' : 'WK'), date: d, exception_type: '1' }));
  return { calendar: [], calendarDates: calendarDates as any, trips: [...tripsFor('WK', 20), ...tripsFor('SA', 12), ...tripsFor('SU', 8)] };
}

describe('the week read for each re-pick fixture (no holiday list)', () => {
  it('MBTA Thanksgiving week (#1050, routes 39/28): the old pick (Fri Nov 23) moves off the holiday week by vote', () => {
    const w = week(thanksgivingFeed(), '20181123');
    expect(w.week.weekStart).not.toBe('20181119');
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
      expect(w.week.services[d]).toEqual([w.week.weekStart! < '20181119' ? 'MAIN1' : 'MAIN2']);
    }
    expect(w.referenceDate).toBe(w.week.dates.Wednesday);
  });

  it('MBTA Thanksgiving week from the archived zip\'s own anchor (first full week in force): a normal week', () => {
    const rows = thanksgivingFeed();
    const anchor = firstFullWeekAnchor(rows);
    expect(anchor).toBe('20180903');
    const w = week(rows, anchor!);
    expect(w.week.weekStart).toBe('20180903');
    expect(w.week.services.Wednesday).toEqual(['MAIN1']);
  });

  it('winter holidays (Dec 25-26, Jan 1): the nearest week without a holiday day is read, with no Dec 20 - Jan 6 window', () => {
    const w = week(winterFeed(), '20181226');
    expect(w.week.weekStart).toBe('20181217');
    expect(w.week.services.Wednesday).toEqual(['MAIN']);
  });

  it('STM end-of-feed holiday week (CIV-469): a calendar_dates-only feed ending Jan 5 reads a regular week, not Dec 30 - Jan 5', () => {
    // Dec 25 and Jan 1 run the Sunday timetable, Dec 26 and Jan 2 the Saturday one (STM's 2024 dataset shape).
    const rows = datesOnlyFeed('20241028', '20250105', { '20241225': 'SU', '20250101': 'SU', '20241226': 'SA', '20250102': 'SA' });
    for (const anchor of ['20250104', firstFullWeekAnchor(rows)!]) {
      const w = week(rows, anchor);
      const read = readDates(w).filter((d): d is string => !!d);
      expect(read.some(d => d >= '20241223' && d <= '20250105')).toBe(false);
      for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) expect(w.week.services[d]).toEqual(['WK']);
    }
  });

  it('a feed whose window is only the holidays reads what it lists (rule 5), never invented weeks', () => {
    const rows = datesOnlyFeed('20241214', '20250105');
    const w = week(rows, firstFullWeekAnchor(rows)!);
    expect(w.week.weekStart).toBe('20241216');
    expect(w.week.services.Wednesday).toEqual(['WK']);
  });

  it('Canadian Thanksgiving Monday with a one-day dip: only Monday comes from another week, the week is kept', () => {
    const rows = winterFeed();
    rows.calendarDates = [...rows.calendarDates, { service_id: 'MAIN', date: '20181008', exception_type: '2' }, { service_id: 'HOL70', date: '20181008', exception_type: '1' }];
    rows.trips = [...rows.trips, ...tripsFor('HOL70', 14)];
    const w = week(rows, '20181008');
    expect(w.week.services.Monday).toEqual(['MAIN']);
    expect(w.week.dates.Monday).not.toBe('20181008');
  });

  it('legitimate low day: a school-day-only route that never runs Wednesdays is the normal week, not moved', () => {
    const rows = winterFeed();
    rows.calendar = [...rows.calendar, cal('SCHOOL', [0, 1, 1, 0, 1, 1, 0], '20180903', '20190118')];
    rows.trips = [...rows.trips, { service_id: 'SCHOOL', route_id: 'S1' }, { service_id: 'SCHOOL', route_id: 'S1' }];
    const w = week(rows, '20181010');
    expect(w.week.weekStart).toBe('20181008');
    expect(w.week.dates.Wednesday).toBe('20181010');
    expect(w.week.services.Wednesday).toEqual(['MAIN']);
    expect(w.week.services.Thursday).toEqual(['MAIN', 'SCHOOL']);
  });

  it('new sidecars are stamped picked by vote, never holiday', () => {
    const rows = winterFeed();
    const w = week(rows, '20181226');
    const q = pickedWeekQuality(rows, w.referenceDate, w.week.weekStart);
    expect(q).toMatchObject({ holiday: false, pickedBy: 'vote', weekStart: '20181217', tripsOnRef: 240, medianTrips: 240 });
    expect(pickedWeekQuality(rows, '20181010', null)).toMatchObject({ holiday: false, pickedBy: 'legacy' });
  });
});

describe('process options', () => {
  it('carry a reference date or an anchor only when one is given', () => {
    const agency = { slug: 'x' } as any;
    expect('referenceDate' in agencyProcessOptions(agency)).toBe(false);
    expect('serviceAnchor' in agencyProcessOptions(agency)).toBe(false);
    expect(agencyProcessOptions(agency, {})).toEqual(agencyProcessOptions(agency));
    expect(agencyProcessOptions(agency, { referenceDate: '20181129' }).referenceDate).toBe('20181129');
    expect(agencyProcessOptions(agency, { serviceAnchor: '20180903' }).serviceAnchor).toBe('20180903');
  });
});

describe('processor explicit reference date', () => {
  const FIXTURES = resolve(__dirname, 'fixtures');
  async function fixtureZip(): Promise<Buffer> {
    const zip = new JSZip();
    const dir = resolve(FIXTURES, 'ncsu-wolfline-41-semester');
    for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  const weekday = async (options: Record<string, unknown>) => JSON.parse((await processGtfsBuffer(await fixtureZip(), undefined, { slug: 'ncsu-wolfline', ...options })).geojson).features
    .map((f: any) => f.properties).filter((p: any) => p.day === 'Weekday' && p.stopId == null);

  it('reads the feed at the given date, like the run-date opt-in does at that day', async () => {
    const fall = await weekday({ referenceDate: '20261014' });
    expect(fall.find((p: any) => p.routeShortName === '41')?.headway).toBe(11);
    expect(fall.some((p: any) => p.routeShortName === '40')).toBe(true);
    const summer = await weekday({ referenceDate: '20260701' });
    expect(summer.find((p: any) => p.routeShortName === '41')?.headway).toBe(15);
    expect(summer.some((p: any) => p.routeShortName === '40')).toBe(false);
  });

  it('reports the date it read; the History sidecar reads the same week (refresh path, incl. run-date and next-service-date agencies)', async () => {
    const buf = await fixtureZip();
    const anchor = '20261015';
    const base = await processAgencyFeeds(buf, [], { slug: 'ncsu-wolfline' } as any, { serviceAnchor: anchor });
    expect(base.serviceWeekStart).toBe('20261012');
    expect(base.referenceDate).toBe('20261014');
    // LA Metro / Sound Transit (next-service dates) and run-date feeds used to get a different History date.
    for (const agency of [{ slug: 'ncsu-wolfline', feedUrl: 'u', nextServiceDatesFeedUrls: ['u'] }, { slug: 'ncsu-wolfline', referenceDateFromRunDate: true }]) {
      const r = await processAgencyFeeds(buf, [], agency as any, { serviceAnchor: anchor });
      expect(r.referenceDate).toBe(base.referenceDate);
    }
    expect((await readFeedEvidence(buf, { referenceDate: base.referenceDate })).refDate).toBe(base.referenceDate);
    expect((await readFeedEvidence(buf, { anchor })).refDate).toBe(base.referenceDate);
  });

  it('is identical to origin/main behaviour when unset', async () => {
    expect(JSON.stringify(await weekday({ referenceDate: undefined }))).toBe(JSON.stringify(await weekday({})));
  });
});
