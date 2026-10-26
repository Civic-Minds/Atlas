import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { processAgencyFeeds } from '../agencyFeeds';
import { addDaysYmd, calendarFromNextServiceDates, servicesRunningOn } from '../serviceDates';
import type { GtfsCalendar, GtfsCalendarDate } from '../../types/gtfs';

// LA Metro Rail (release-mvf8jscd): a rolling two-week window where each day or few days has
// its own short service_id. The default calendar logic reads one reference date, so A, B and D
// showed Saturday only. The opt-in (nextServiceDatesFeedUrls) reads each day type from one
// typical real date after the run date. Run date in these tests: Tue Oct 20, 2026.

const RUN = new Date('2026-10-20T08:00:00');
const HEADER = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';

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
const calRow = (c: GtfsCalendar) => [c.service_id, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday, c.start_date, c.end_date].join(',');

/** Rolling feed like LA rail: line A has a one-day weekday id per date, line B multi-day ids. */
function rollingCalendar(): { calendar: GtfsCalendar[]; calendarDates: GtfsCalendarDate[] } {
  const calendar: GtfsCalendar[] = [];
  for (let d = '20261020'; d <= '20261103'; d = addDaysYmd(d, 1)) {
    const dow = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)).getDay();
    if (dow >= 1 && dow <= 5) calendar.push(cal(`A-wk-${d}`, 'mo,tu,we,th,fr', d, d));
  }
  calendar.push(
    cal('A-sat', 'sa', '20261024', '20261031'),
    cal('A-sun-1025', 'su', '20261025', '20261025'),
    cal('A-sun-1101', 'su', '20261101', '20261101'),
    cal('B-wk', 'mo,tu,we,th,fr', '20261020', '20261103'),
    cal('B-wk-1028', 'mo,tu,we,th,fr', '20261028', '20261028'),
    cal('B-sat', 'sa', '20261024', '20261031'),
    cal('B-sun', 'su', '20261025', '20261101'),
  );
  // B's regular weekday service is cancelled on Wed Oct 28 and a one-off timetable runs instead.
  return { calendar, calendarDates: [removed('B-wk', '20261028')] };
}

function minutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
}

/** Zip with rail lines A and B, every service a timetable every `everyMin` minutes 06:00-22:00. */
async function rollingZip(headways: Record<string, number> = {}): Promise<Buffer> {
  const { calendar, calendarDates } = rollingCalendar();
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nm,Metro Rail,https://example.test,America/Los_Angeles\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nA,,A Line,1\nB,,B Line,1\n');
  zip.file('stops.txt', [
    'stop_id,stop_name,stop_lat,stop_lon',
    'a1,A North,34.10,-118.30', 'a2,A South,34.00,-118.30',
    'b1,B West,34.05,-118.40', 'b2,B East,34.05,-118.20',
  ].join('\n') + '\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'shA,34.10,-118.30,1', 'shA,34.05,-118.30,2', 'shA,34.00,-118.30,3',
    'shB,34.05,-118.40,1', 'shB,34.05,-118.30,2', 'shB,34.05,-118.20,3',
  ].join('\n') + '\n');
  zip.file('calendar.txt', [HEADER, ...calendar.map(calRow)].join('\n') + '\n');
  zip.file('calendar_dates.txt', ['service_id,date,exception_type', ...calendarDates.map(cd => `${cd.service_id},${cd.date},${cd.exception_type}`)].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const c of calendar) {
    const line = c.service_id[0];
    const every = headways[c.service_id] ?? 10;
    const [s1, s2] = line === 'A' ? ['a1', 'a2'] : ['b1', 'b2'];
    for (let m = 6 * 60, i = 0; m <= 22 * 60; m += every, i++) {
      const id = `${c.service_id}-${i}`;
      trips.push(`${line},${c.service_id},${id},${line} terminal,0,sh${line}`);
      stopTimes.push(`${id},${minutes(m)},${minutes(m)},${s1},1`, `${id},${minutes(m + 20)},${minutes(m + 20)},${s2},2`);
    }
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

type Props = { routeId: string; day: string; headway: number | null };
function lineFeatures(geojson: string): Props[] {
  return JSON.parse(geojson).features
    .filter((f: { geometry?: { type?: string } }) => f.geometry?.type !== 'Point')
    .map((f: { properties: Props }) => f.properties);
}
function daysByRoute(props: Props[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const p of props) (out[p.routeId] ??= new Set()).add(p.day);
  return Object.fromEntries(Object.entries(out).map(([r, s]) => [r, [...s].sort()]));
}

describe('servicesRunningOn', () => {
  const { calendar, calendarDates } = rollingCalendar();

  it('counts one-day ids on their own date and multi-day ids in range', () => {
    expect([...servicesRunningOn(calendar, calendarDates, '20261021')].sort()).toEqual(['A-wk-20261021', 'B-wk']);
  });

  it('drops a service cancelled in calendar_dates and keeps its one-day replacement', () => {
    expect([...servicesRunningOn(calendar, calendarDates, '20261028')].sort()).toEqual(['A-wk-20261028', 'B-wk-1028']);
  });

  it('counts an addition of a same-kind service but not a Sunday service added on a weekday', () => {
    const extra = [cal('wk2', 'mo,tu,we,th,fr', '20261201', '20261231'), cal('sun', 'su', '20261201', '20261231')];
    const dates = [added('wk2', '20261021'), added('sun', '20261021'), added('datesOnly', '20261021')];
    expect([...servicesRunningOn([...calendar, ...extra], dates, '20261021')].sort())
      .toEqual(['A-wk-20261021', 'B-wk', 'datesOnly', 'wk2']);
  });
});

describe('calendarFromNextServiceDates', () => {
  const { calendar, calendarDates } = rollingCalendar();
  const trips = calendar.map(c => ({ service_id: c.service_id, route_id: c.service_id[0] }));

  it('reads every day type from a real date after the run date, skipping a one-off weekday', () => {
    // Every weekday has the same trips per line except Oct 28 (B's one-off): the earliest
    // typical weekday after the run date is Wed Oct 21.
    const result = calendarFromNextServiceDates(calendar, calendarDates, trips, '20261020');
    expect(result.dates).toEqual({ Weekday: '20261021', Saturday: '20261024', Sunday: '20261025' });
    expect([...result.services.Weekday].sort()).toEqual(['A-wk-20261021', 'B-wk']);
    expect([...result.services.Sunday].sort()).toEqual(['A-sun-1025', 'B-sun']);
  });

  it('never reads the one-off day even when it is the first date after the run', () => {
    // B's Oct 28 timetable has more trips than its regular one, so Oct 28's pattern differs.
    const tripsWithOneOff = [...trips, { service_id: 'B-wk-1028', route_id: 'B' }];
    const result = calendarFromNextServiceDates(calendar, calendarDates, tripsWithOneOff, '20261027');
    expect(result.dates.Weekday).toBe('20261029');
    expect(result.services.Weekday.has('B-wk')).toBe(true);
    expect(result.services.Weekday.has('B-wk-1028')).toBe(false);
  });

  it('reads the last two weeks of a window that is already over', () => {
    // An archived copy reprocessed after Nov 3: no service ahead, so every day type is kept.
    const result = calendarFromNextServiceDates(calendar, calendarDates, trips, '20261120');
    expect(result.dates).toEqual({ Weekday: '20261021', Saturday: '20261024', Sunday: '20261025' });
    expect(result.services.Weekday.size).toBeGreaterThan(0);
    expect(result.services.Saturday.size).toBeGreaterThan(0);
    expect(result.services.Sunday.size).toBeGreaterThan(0);
  });

  it('flags each running service only for the day types it runs on', () => {
    const result = calendarFromNextServiceDates(calendar, calendarDates, trips, '20261020');
    const row = (id: string) => result.calendar.find(c => c.service_id === id)!;
    expect(row('A-wk-20261021')).toMatchObject({ monday: '1', friday: '1', saturday: '0', sunday: '0' });
    expect(row('A-sat')).toMatchObject({ monday: '0', saturday: '1', sunday: '0' });
    expect(result.calendar.some(c => c.service_id === 'A-wk-20261022')).toBe(false);
    for (const c of result.calendar) expect(c.start_date <= result.referenceDate && result.referenceDate <= c.end_date).toBe(true);
  });

  it('moves forward when the window has no service of a kind', () => {
    const sundayLater = [cal('wk', 'mo,tu,we,th,fr', '20261020', '20261231'), cal('sun', 'su', '20261115', '20261231')];
    const result = calendarFromNextServiceDates(sundayLater, [], [{ service_id: 'wk', route_id: 'A' }, { service_id: 'sun', route_id: 'A' }], '20261020');
    expect(result.dates.Sunday).toBe('20261115');
    expect(result.services.Saturday.size).toBe(0);
  });
});

describe('processGtfsBuffer with dayTypesFromNextServiceDates', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: RUN }); });
  afterEach(() => { vi.useRealTimers(); });

  it('gives a line with one-day weekday ids and a line with multi-day ids all three day types', async () => {
    const result = await processGtfsBuffer(await rollingZip(), undefined, { slug: 'rail', dayTypesFromNextServiceDates: true });
    const props = lineFeatures(result.geojson);
    expect(daysByRoute(props)).toEqual({ A: ['Saturday', 'Sunday', 'Weekday'], B: ['Saturday', 'Sunday', 'Weekday'] });
  });

  it('reads one weekday timetable for Monday-Friday, not five pooled copies', async () => {
    // Pooling a different date per weekday would stack five 10-minute timetables (about 2 min).
    const result = await processGtfsBuffer(await rollingZip(), undefined, { slug: 'rail', dayTypesFromNextServiceDates: true });
    for (const p of lineFeatures(result.geojson)) expect(p.headway).toBe(10);
  });

  it('does not read a one-off weekday that comes first after the run', async () => {
    // Run Tue Oct 27: Wed Oct 28 is the first weekday, and B runs a 20-minute one-off that day.
    vi.setSystemTime(new Date('2026-10-27T08:00:00'));
    const result = await processGtfsBuffer(await rollingZip({ 'B-wk-1028': 20 }), undefined, { slug: 'rail', dayTypesFromNextServiceDates: true });
    const b = lineFeatures(result.geojson).filter(p => p.routeId === 'B' && p.day === 'Weekday');
    expect(b.length).toBeGreaterThan(0);
    for (const p of b) expect(p.headway).toBe(10);
  });

  it('gives the same output for run dates a few days apart', async () => {
    const buf = await rollingZip();
    const run = async (now: string) => {
      vi.setSystemTime(new Date(now));
      return lineFeatures((await processGtfsBuffer(buf, undefined, { slug: 'rail', dayTypesFromNextServiceDates: true })).geojson);
    };
    expect(await run('2026-10-21T08:00:00')).toEqual(await run('2026-10-20T08:00:00'));
  });

  it('keeps the feed expiry from the real calendar', async () => {
    const result = await processGtfsBuffer(await rollingZip(), undefined, { slug: 'rail', dayTypesFromNextServiceDates: true });
    const base = await processGtfsBuffer(await rollingZip(), undefined, { slug: 'rail' });
    expect(result.calendarExpiry).toBe(base.calendarExpiry);
  });
});

describe('default behaviour is unchanged', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: RUN }); });
  afterEach(() => { vi.useRealTimers(); });

  it('processAgencyFeeds output is byte-identical without the option or with it naming another feed', async () => {
    const main = await rollingZip();
    const supp = await rollingZip({ 'B-wk': 15 });
    const url = 'https://example.test/rail.zip';
    const plain = await processAgencyFeeds(main, [{ url, buf: supp }], { slug: 'rail', supplementalFeedUrls: [url] });
    const other = await processAgencyFeeds(main, [{ url, buf: supp }], { slug: 'rail', supplementalFeedUrls: [url], nextServiceDatesFeedUrls: ['https://example.test/other.zip'] });
    expect(other.geojson).toBe(plain.geojson);
    expect(other.stopsJson).toBe(plain.stopsJson);
    expect(other.tripsJson).toBe(plain.tripsJson);
    expect(other.corridorsGeojson).toBe(plain.corridorsGeojson);
  });

  it('opting a supplemental feed in leaves the main feed on the default calendar logic', async () => {
    const main = await rollingZip();
    const supp = await rollingZip();
    const url = 'https://example.test/rail.zip';
    const optedIn = await processAgencyFeeds(main, [{ url, buf: supp }], { slug: 'rail', supplementalFeedUrls: [url], nextServiceDatesFeedUrls: [url] });
    const mainOnly = await processAgencyFeeds(main, [], { slug: 'rail' });
    const mainCount = lineFeatures(mainOnly.geojson).length;
    expect(lineFeatures(optedIn.geojson).slice(0, mainCount)).toEqual(lineFeatures(mainOnly.geojson));
    // The opted-in supplemental part has all three day types on both lines.
    expect(daysByRoute(lineFeatures(optedIn.geojson).slice(mainCount))).toEqual({ A: ['Saturday', 'Sunday', 'Weekday'], B: ['Saturday', 'Sunday', 'Weekday'] });
  });
});
