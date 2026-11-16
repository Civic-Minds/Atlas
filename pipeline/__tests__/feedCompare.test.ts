import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareFeedSides, comparisonMarkdown, dateInWeek, dateReadProblem, dayCoverage, DateNotReadError, headwayText, readFeedSide, routeLines, servicesListedOn,
} from '../feedCompare';

// CIV-1684: a before/after schedule comparison. Before: A every 30, B, D taking 20 min.
// After: A every 15, B gone, C new, D taking 30 min. All weekday-only, 06:00-22:00.

const RUN = new Date('2026-10-21T08:00:00');
const HEADER = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

type RouteSpec = { id: string; every: number; minutes: number };

async function feed(routes: RouteSpec[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Test,https://example.test,America/Toronto\n');
  zip.file('routes.txt', ['route_id,route_short_name,route_long_name,route_type', ...routes.map(r => `${r.id},${r.id},Route ${r.id},3`)].join('\n') + '\n');
  const stops = ['stop_id,stop_name,stop_lat,stop_lon'];
  const shapes = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  routes.forEach((r, i) => {
    const lat = 44.20 + i * 0.02;
    for (let s = 1; s <= 4; s++) {
      stops.push(`${r.id}${s},${r.id} stop ${s},${lat},${-76.50 + s * 0.01}`);
      shapes.push(`sh${r.id},${lat},${-76.50 + s * 0.01},${s}`);
    }
    for (let m = 360, n = 0; m <= 1320; m += r.every, n++) {
      const trip = `${r.id}-${n}`;
      trips.push(`${r.id},wk,${trip},${r.id} end,0,sh${r.id}`);
      for (let s = 1; s <= 4; s++) {
        const t = clock(m + Math.round(((s - 1) * r.minutes) / 3));
        times.push(`${trip},${t},${t},${r.id}${s},${s}`);
      }
    }
  });
  zip.file('stops.txt', stops.join('\n') + '\n');
  zip.file('shapes.txt', shapes.join('\n') + '\n');
  zip.file('calendar.txt', [HEADER, 'wk,1,1,1,1,1,0,0,20260801,20261231'].join('\n') + '\n');
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

const BEFORE: RouteSpec[] = [{ id: 'A', every: 30, minutes: 20 }, { id: 'B', every: 30, minutes: 20 }, { id: 'D', every: 30, minutes: 20 }];
const AFTER: RouteSpec[] = [{ id: 'A', every: 15, minutes: 20 }, { id: 'C', every: 30, minutes: 20 }, { id: 'D', every: 30, minutes: 30 }];

describe('compare two schedule versions (CIV-1684)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: RUN }); });
  afterEach(() => { vi.useRealTimers(); });

  it('lists added, removed and changed routes with headway, trips and run time', async () => {
    const before = await readFeedSide(await feed(BEFORE), '2026-09-03', { slug: 'test' });
    const after = await readFeedSide(await feed(AFTER), '20260917', { slug: 'test' });
    expect(before.dayName).toBe('Thursday');
    const cmp = compareFeedSides('test', { ...before, file: 'b.zip' }, { ...after, file: 'a.zip' });
    expect(cmp.added.map(r => r.route)).toEqual(['C']);
    expect(cmp.removed.map(r => r.route)).toEqual(['B']);
    expect(cmp.changed.map(c => c.route)).toEqual(['A', 'D']);

    const a = cmp.changed[0].days.Weekday!;
    expect(a.what).toEqual(expect.arrayContaining(['headway', 'trips']));
    expect(a.what).not.toContain('run time');
    expect(a.before!.headway.midday).toBe(30);
    expect(a.after!.headway.midday).toBe(15);
    expect(a.before!.trips).toBe(33);
    expect(a.after!.trips).toBe(65);

    const d = cmp.changed[1].days.Weekday!;
    expect(d.what).toEqual(['span', 'run time']);
    expect(Object.values(d.before!.runMinutes)).toEqual([20]);
    expect(Object.values(d.after!.runMinutes)).toEqual([30]);

    // CIV-1731: each side keeps its routes' drawn lines for the Studio map; they are not compared.
    expect(before.routes.A.days.Weekday!.lines!.length).toBeGreaterThan(0);
    expect(after.routes.C.days.Weekday!.lines!.length).toBeGreaterThan(0);
    expect(after.routes.B).toBeUndefined();

    const md = comparisonMarkdown(cmp);
    expect(md).toContain('| 30/30/30/30 → 15/15/15/15 | 33 → 65 |');
    expect(md).toContain('| 20 → 30 |');
    // Weekday-only feeds have no weekend rows to compare.
    expect(cmp.changed.every(c => Object.keys(c.days).every(k => k === 'Weekday'))).toBe(true);
  });

  it('refuses a date with no listed service instead of reporting zeros', async () => {
    await expect(readFeedSide(await feed(BEFORE), '2027-03-04', { slug: 'test' })).rejects.toThrow(DateNotReadError);
    await expect(readFeedSide(await feed(BEFORE), '2027-03-04', { slug: 'test' })).rejects.toThrow(/lists no trips on 2027-03-04/);
  });
});

describe('date checks', () => {
  it('refuses a date whose listed trips the pipeline drops (Kingston 2026-09-03 in the 20270901 file)', () => {
    expect(dateReadProblem(1501, 0, '20260903')).toMatch(/lists 1501 trips on 2026-09-03, but the pipeline reads none/);
    expect(dateReadProblem(0, 0, '20260903')).toMatch(/lists no trips/);
    expect(dateReadProblem(1501, 1501, '20260903')).toBeNull();
  });

  it('lists services by calendar_dates when the calendar was synthesized, and applies removals', () => {
    const calendar = [{ service_id: 'wk', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260801', end_date: '20261231' }];
    const calendarDates = [
      { service_id: 'x', date: '20260903', exception_type: '1' },
      { service_id: 'wk', date: '20260904', exception_type: '2' },
    ];
    expect([...servicesListedOn({ calendar, calendarDates }, '20260903')].sort()).toEqual(['wk', 'x']);
    expect([...servicesListedOn({ calendar, calendarDates }, '20260904')]).toEqual([]);
    expect([...servicesListedOn({ calendar, calendarDates, calendarSynthesized: true }, '20260903')]).toEqual(['x']);
  });

  it('counts listed, read and unlisted trips for a day', () => {
    const trips = new Map([['a', 10], ['b', 5], ['c', 7]]);
    expect(dayCoverage(new Set(['a', 'b']), new Set(['b', 'c']), trips)).toEqual({ listedTrips: 15, readListedTrips: 5, unlistedTrips: 7 });
  });

  it('finds a weekday in the Monday-to-Sunday week of a date', () => {
    expect(dateInWeek('20260917', 'Saturday')).toBe('20260919');
    expect(dateInWeek('20260917', 'Sunday')).toBe('20260920');
    expect(dateInWeek('20260920', 'Monday')).toBe('20260914');
  });

  it('writes headways as AM peak/midday/PM peak/evening with late and overnight only when present', () => {
    expect(headwayText({ amPeak: 30, midday: 60, pmPeak: 60, evening: 60, late: null })).toBe('30/60/60/60');
    expect(headwayText({ amPeak: null, midday: 30, late: 75 })).toBe('–/30/–/– (late 75)');
  });
});

describe('route lines for the Studio map (CIV-1731)', () => {
  it('rounds to five decimals, drops points rounding merges, and keeps each part of a multi-line', () => {
    expect(routeLines({ type: 'LineString', coordinates: [[-76.4812345, 44.2312345], [-76.4812349, 44.2312341], [-76.49, 44.24]] }))
      .toEqual([[[-76.48123, 44.23123], [-76.49, 44.24]]]);
    expect(routeLines({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] })).toHaveLength(2);
    expect(routeLines({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
    expect(routeLines(null)).toEqual([]);
  });
});
