import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { agencyProcessOptions } from '../agencyFeeds.js';
import { processGtfsBuffer } from '../process-core.js';
import { refDateQuality } from '../historyRefQuality.js';
import {
  assessWithWeekCheck, candidateWeeks, chooseReferenceDate, readWeek, readsThanksgivingWeek, repickContext, repickEligible, usThanksgiving,
  type RepickRows,
} from '../historyRefRepick.js';

const ymd = (n: number) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const num = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
const dates = (from: string, to: string) => { const o: string[] = []; for (let n = num(from); n <= num(to); n++) o.push(ymd(n)); return o; };
const dow = (s: string) => new Date(num(s) * 86400000).getUTCDay();

const ROUTES = Array.from({ length: 12 }, (_, i) => `R${i + 1}`);
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

function datesOnlyFeed(from: string, to: string): RepickRows {
  const calendarDates = dates(from, to).map(d => ({ service_id: dow(d) === 0 ? 'SU' : dow(d) === 6 ? 'SA' : 'WK', date: d, exception_type: '1' }));
  return { calendar: [], calendarDates: calendarDates as any, trips: [...tripsFor('WK', 20), ...tripsFor('SA', 12), ...tripsFor('SU', 8)] };
}

describe('Thanksgiving helpers', () => {
  it('finds the fourth Thursday of November and the weeks the processor reads', () => {
    expect(usThanksgiving(2018)).toBe('20181122');
    expect(usThanksgiving(2022)).toBe('20221124');
    expect(readsThanksgivingWeek('20181123')).toBe(true); // Friday after: reads Tue-Fri of that week
    expect(readsThanksgivingWeek('20181129')).toBe(false);
    expect(readsThanksgivingWeek('20181010')).toBe(false);
  });
});

describe('re-picking a normal reference date', () => {
  it('moves MBTA-style Thanksgiving-week data (Fri after Thanksgiving) to the nearest normal week of the same feed', () => {
    const rows = thanksgivingFeed();
    // The picked date itself passes the old own-day check (a normal Friday trip count)...
    expect(refDateQuality(rows, '20181123').holiday).toBe(false);
    // ...but the weekdays the processor reads for it include the holiday Thursday.
    const res = chooseReferenceDate(rows, '20181123');
    expect(res.repicked).toMatchObject({ from: '20181123', to: '20181129', fromYear: 2018, toYear: 2018 });
    expect(res.refDate).toBe('20181129');
    expect(res.quality.holiday).toBe(false);
    expect(res.quality.repicked?.reason).toMatch(/Thanksgiving/);
    // a Thursday: its Mon-Sun week is exactly what the processor reads
    expect(new Date(num(res.refDate) * 86400000).getUTCDay()).toBe(4);
  });

  it('moves a Dec 25-28 reference date to a December week before the holiday window', () => {
    const rows = winterFeed();
    expect(refDateQuality(rows, '20181226').holiday).toBe(true);
    const res = chooseReferenceDate(rows, '20181226');
    expect(res.repicked?.from).toBe('20181226');
    expect(res.refDate).toBe('20181213'); // Dec 10-14: nearest week outside Dec 20 - Jan 6 and any holiday week
    expect(res.quality.holiday).toBe(false);
    expect(res.repicked?.tripsOnTo).toBeGreaterThan(res.repicked!.tripsOnFrom);
  });

  it('still drops the period when the feed has no normal week (calendar_dates-only, window inside the holidays)', () => {
    const rows = datesOnlyFeed('20241214', '20250105');
    const before = refDateQuality(rows, '20250105');
    const res = chooseReferenceDate(rows, '20250105');
    expect(res.repicked).toBeUndefined();
    expect(res.refDate).toBe('20250105');
    expect(before.holiday).toBe(false); // the old check has no evidence here...
    expect(res.quality.holiday).toBe(true); // ...but the weekdays read for Jan 5 fall past the feed's end: dropped, not re-picked
  });

  it('keeps a no-normal-week Thanksgiving feed dropped, not invented', () => {
    // Only the Thanksgiving week exists in the feed.
    const rows = thanksgivingFeed();
    rows.calendar = rows.calendar.filter(c => c.start_date === c.end_date);
    const res = chooseReferenceDate(rows, '20181123');
    expect(res.repicked).toBeUndefined();
    expect(res.refDate).toBe('20181123');
  });

  it('leaves a normal feed alone: same date, same quality as the existing check', () => {
    const rows = winterFeed();
    const res = chooseReferenceDate(rows, '20181010');
    expect(res.refDate).toBe('20181010');
    expect(res.repicked).toBeUndefined();
    expect(res.quality).toEqual(refDateQuality(rows, '20181010'));
  });

  it('does not touch a Canadian-Thanksgiving Monday reference with a one-day dip (median week intact)', () => {
    const rows = winterFeed();
    rows.calendarDates = [...rows.calendarDates, { service_id: 'MAIN', date: '20181008', exception_type: '2' }, { service_id: 'HOL70', date: '20181008', exception_type: '1' }] as any;
    rows.trips = [...rows.trips, ...tripsFor('HOL70', 14)]; // 70% of a normal weekday, like a real holiday Monday
    const res = chooseReferenceDate(rows, '20181008');
    expect(res.repicked).toBeUndefined();
  });

  it('flags a split week without a holiday (most of a route\'s read weekdays on another service) when no normal week exists too', () => {
    const rows = winterFeed();
    const ctx = repickContext(rows);
    const normal = readWeek(ctx, '20181011');
    expect(normal.splitShare).toBe(0);
    expect(candidateWeeks(ctx).every(w => w.splitShare === 0)).toBe(true);
    expect(assessWithWeekCheck(rows, '20181011').holiday).toBe(false);
    expect(assessWithWeekCheck(thanksgivingFeed(), '20181123').holiday).toBe(true); // refresh path: flagged, build drops it
  });
});

describe('gating', () => {
  it('only feeds that read the shared picker are re-picked', () => {
    expect(repickEligible({})).toBe(true);
    expect(repickEligible({ referenceDateFromRunDate: true })).toBe(false);
    expect(repickEligible({ feedUrl: 'https://x/a.zip', nextServiceDatesFeedUrls: ['https://x/a.zip'] })).toBe(false);
  });

  it('the process options carry a reference date only when one is given (flag off: unchanged)', () => {
    const agency = { slug: 'x' } as any;
    expect('referenceDate' in agencyProcessOptions(agency)).toBe(false);
    expect(agencyProcessOptions(agency, {})).toEqual(agencyProcessOptions(agency));
    expect(agencyProcessOptions(agency, { referenceDate: '20181129' }).referenceDate).toBe('20181129');
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

  it('is identical to origin/main behaviour when unset', async () => {
    expect(JSON.stringify(await weekday({ referenceDate: undefined }))).toBe(JSON.stringify(await weekday({})));
  });
});
