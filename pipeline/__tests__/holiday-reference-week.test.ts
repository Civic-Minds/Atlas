import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { parseGtfsZip } from '../parseGtfs';
import { detectReferenceDate, getActiveServiceIds } from '../transit-calendar';
import { computeRawDepartures } from '../transit-phase1';

// #658: a holiday in the feed's reference week (Thanksgiving / Indigenous Peoples' Day,
// Mon Oct 12 2026) was read as that week's Monday service. The holiday service then
// merged with the regular Tue-Fri service in the Weekday pool, roughly halving weekday
// headways (TTC 506 showed every 4-6 minutes against a real 10).
//
// Fixtures are trimmed copies of the real feeds: the route's own trips on the services
// involved, with each trip's first and last stop. calendar.txt and calendar_dates.txt
// are unchanged rows from the real feeds.
const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('holiday in the reference week (#658)', () => {
  beforeAll(() => {
    // detectReferenceDate prefers schedule periods that have already started.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-10T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('TTC 506 weekday headways come from regular service, not Thanksgiving', async () => {
    // Real feed 20260930-20261031: reference date Oct 15, so Monday is Oct 12, where
    // service 1 is removed and holiday service 4 is added.
    const result = await processGtfsBuffer(await fixtureZip('ttc-506-thanksgiving'), undefined, { slug: 'ttc' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.routeShortName === '506' && p.day === 'Weekday' && p.stopId == null);

    expect(weekday.length).toBeGreaterThan(0);
    for (const direction of [0, 1]) {
      expect(weekday.some((p: any) => p.directionId === direction)).toBe(true);
    }
    // Before the fix: worst direction 6 (AM peak) and 9 (midday), with branches at 4-5.
    const worst = weekday[0].worstDirectionHeadwayByPeriod;
    expect(worst.amPeak).toBe(10);
    expect(worst.midday).toBe(10);
    for (const p of weekday) {
      for (const period of ['amPeak', 'midday'] as const) {
        const headway = p.headwayByPeriod?.[period];
        if (headway != null) expect(headway).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("MBTA 1 Monday resolves to weekday service, not the Indigenous Peoples' Day Saturday schedule", async () => {
    // Real MBTA rows: weekday service hbc46wk1 is removed on Oct 12 and the Saturday-style
    // holiday service hbc46tp6 is added. The live MBTA feed's reference week is in
    // November, so the reference date is pinned to the Oct 12 week here.
    const gtfs = await parseGtfsZip(new Uint8Array(await fixtureZip('mbta-1-indigenous-peoples-day')).buffer as ArrayBuffer);
    const ref = '20261014';
    const weekdayIds = new Set<string>();
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
      for (const id of getActiveServiceIds(gtfs.calendar!, gtfs.calendarDates!, day, ref)) weekdayIds.add(id);
    }
    expect([...getActiveServiceIds(gtfs.calendar!, gtfs.calendarDates!, 'Monday', ref)]).toEqual(['BUS20264-hbc46wk1-Weekday-02']);
    expect(weekdayIds.has('BUS20264-hbc46tp6-Saturday-02')).toBe(false);
    expect(weekdayIds.has('BUS20264-hbc46wk1-Weekday-02')).toBe(true);
    expect(weekdayIds.has('BUS20264-hbc46f41-Weekday-02')).toBe(true);

    // Route level: Monday departures match a regular Tuesday in both directions.
    const raw = computeRawDepartures(gtfs, ref);
    for (const dir of ['0', '1']) {
      const monday = raw.find(r => r.day === 'Monday' && r.dir === dir);
      const tuesday = raw.find(r => r.day === 'Tuesday' && r.dir === dir);
      expect(monday?.departureTimes).toEqual(tuesday?.departureTimes);
    }
  });
});

describe('reference date inside the service period (SCT, #658)', () => {
  // Real SCT calendar.txt / calendar_dates.txt. Every service runs to the open-ended
  // 20991231, so the calendar midpoint is decades out and the holiday exceptions
  // (May-Dec 2026) override it. Their midpoint (Sep 9) is before the newest period
  // starts (Oct 1), which dropped every route that only runs in that period (SCT
  // Central, 15 routes). trip_counts.txt is the real trips.txt reduced to counts.
  const dir = resolve(FIXTURES, 'sct-open-ended-calendar');
  const csv = (file: string) => {
    const [header, ...rows] = readFileSync(resolve(dir, file), 'utf8').trim().split('\n');
    const cols = header.split(',');
    return rows.map(row => Object.fromEntries(row.split(',').map((v, i) => [cols[i], v])));
  };
  const calendar = csv('calendar.txt') as any[];
  const calendarDates = csv('calendar_dates.txt') as any[];
  const trips = csv('trip_counts.txt').flatMap((r: any) =>
    Array.from({ length: Number(r.trips) }, () => ({ route_id: r.route_id, service_id: r.service_id })));

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-10T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('keeps the reference date at or after the start of the newest period', () => {
    const ref = detectReferenceDate(calendar, calendarDates, trips);
    expect(ref >= '20261001').toBe(true);
    const routes = (day: 'Monday' | 'Saturday' | 'Sunday') => {
      const ids = getActiveServiceIds(calendar, calendarDates, day, ref);
      return new Set(trips.filter(t => ids.has(t.service_id)).map(t => t.route_id));
    };
    const allRoutes = new Set(trips.map(t => t.route_id));
    // Every route in the feed runs on at least one day type (24 routes, as the
    // official feed lists for the next two weeks).
    const running = new Set([...routes('Monday'), ...routes('Saturday'), ...routes('Sunday')]);
    expect(running.size).toBe(allRoutes.size);
    expect(getActiveServiceIds(calendar, calendarDates, 'Monday', ref).has('272-1')).toBe(true);
  });
});

describe('reference date clamp skips an expired newest period (RCT)', () => {
  // Real RCT (Redwood Coast Transit) feed, routes 3 and 4 (route_id 117/118), unchanged
  // calendar.txt and calendar_dates.txt. Regular service runs Dec 2025-Dec 2026 and a
  // summer period ran Jun 12-Aug 23 2026. The SCT clamp above moved the reference date to
  // the summer start (Jun 12), where Regular and Summer Tue-Fri both run: two hourly loops
  // 1-3 minutes apart were pooled into a 4-minute (118) and 30-minute (117) headway.
  // Hand count, Wed Oct 14 2026 (Regular Tue-Fri only): 117 runs 08:01-17:01, every gap
  // 60; 118 runs 07:27-17:27, gaps 59-61, so its median is 60 but its 61-minute gaps keep
  // it out of the 60 tier (as before the clamp).
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('keeps the reference date in the running regular period', async () => {
    const gtfs = await parseGtfsZip(new Uint8Array(await fixtureZip('rct-expired-summer-period')).buffer as ArrayBuffer);
    expect(detectReferenceDate(gtfs.calendar!, gtfs.calendarDates, gtfs.trips)).toBe('20260202');
  });

  it('shows the hourly loops every 60 minutes on weekdays', async () => {
    const result = await processGtfsBuffer(await fixtureZip('rct-expired-summer-period'), undefined, { slug: 'rct' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.day === 'Weekday' && p.stopId == null);
    // Since CIV-152 the worst stop grade is the line's tier. 117 runs on the hour at every
    // stop with one 61-62 minute gap mid-afternoon: one near miss over nine gaps, within the
    // grader's floor (GRACE_FLOOR_MIN_GAPS), tier 60. 118's stops alternate real holes.
    for (const [route, tier] of [['117', '60'], ['118', 'infrequent']]) {
      const features = weekday.filter((p: any) => p.routeId === route);
      expect(features.length).toBeGreaterThan(0);
      for (const p of features) {
        expect(p.headway).toBe(60);
        expect(p.tier).toBe(tier);
        expect(p.headwayByPeriod.midday).toBe(60);
      }
    }
  });

  const cal = (id: string, start: string, end: string, days = '1111100') => ({
    service_id: id, start_date: start, end_date: end,
    monday: days[0], tuesday: days[1], wednesday: days[2], thursday: days[3], friday: days[4], saturday: days[5], sunday: days[6],
  }) as any;

  it('moves a reference inside an ended nested period to after it (main path)', () => {
    // RCT's shape without calendar_dates: the regular period's midpoint (Jun 16) lies in
    // the ended summer period, where both timetables run. The day after summer is used.
    const calendar = [
      cal('R-wk', '20251201', '20261231'), cal('R-sa', '20251201', '20261231', '0000010'),
      cal('S-wk', '20260612', '20260823'), cal('S-sa', '20260612', '20260823', '0000010'),
    ];
    expect(detectReferenceDate(calendar, [], undefined)).toBe('20260824');
  });

  it('leaves future-only feeds on the newest period midpoint', () => {
    // Nothing has started yet (today Oct 11): unchanged fallback to the latest period.
    const calendar = [
      cal('A-wk', '20261101', '20261231'), cal('A-sa', '20261101', '20261231', '0000010'),
      cal('B-wk', '20270101', '20270301'), cal('B-sa', '20270101', '20270301', '0000010'),
    ];
    expect(detectReferenceDate(calendar, [], undefined)).toBe('20270130');
  });

  it('keeps a short holiday period that is the newest started and still running', () => {
    // A 2-week block running today is still the newest started period, as before #734;
    // only an ended newest period, or a replacement block (#921, below), is replaced.
    // Recorded so a change here is deliberate.
    const calendar = [
      cal('R-wk', '20250901', '20270630'), cal('R-sa', '20250901', '20270630', '0000010'),
      cal('H-wk', '20261005', '20261018'), cal('H-sa', '20261005', '20261018', '0000010'),
    ];
    expect(detectReferenceDate(calendar, [], undefined)).toBe('20261011');
  });

  it('keeps a short newest period that runs the regular routes (Embark\'s Wednesday service)', () => {
    const calendar = [
      cal('R-wk', '20250901', '20270630'), cal('R-sa', '20250901', '20270630', '0000010'),
      cal('H-wk', '20261005', '20261018'), cal('H-sa', '20261005', '20261018', '0000010'),
    ];
    const trips = ['R-wk', 'R-sa', 'H-wk', 'H-sa'].flatMap(service_id => ['1', '2', '3'].map(route_id => ({ service_id, route_id })));
    expect(detectReferenceDate(calendar, [], trips)).toBe('20261011');
  });

  it('passes over a short replacement block whose routes the long period does not run (#921)', () => {
    const calendar = [
      cal('R-wk', '20250901', '20270630'), cal('R-sa', '20250901', '20270630', '0000010'),
      cal('H-wk', '20261005', '20261018'), cal('H-sa', '20261005', '20261018', '0000010'),
    ];
    const trips = [
      ...['R-wk', 'R-sa'].flatMap(service_id => ['rail-1', 'rail-2'].map(route_id => ({ service_id, route_id }))),
      ...['H-wk', 'H-sa'].map(service_id => ({ service_id, route_id: 'shuttle' })),
    ];
    expect(detectReferenceDate(calendar, [], trips)).toBe('20260731');
  });

  it('keeps a short newest period when no long period is running', () => {
    const calendar = [
      cal('R-wk', '20250901', '20261001'), cal('R-sa', '20250901', '20261001', '0000010'),
      cal('H-wk', '20261005', '20261018'), cal('H-sa', '20261005', '20261018', '0000010'),
    ];
    expect(detectReferenceDate(calendar, [], undefined)).toBe('20261011');
  });

  it('prefers a long running period over a short one when the newest started has ended', () => {
    const calendar = [
      cal('R-wk', '20250901', '20270630'), cal('R-sa', '20250901', '20270630', '0000010'),
      cal('H-wk', '20261001', '20261020'), cal('H-sa', '20261001', '20261020', '0000010'),
      cal('E-wk', '20261002', '20261009'), cal('E-sa', '20261002', '20261009', '0000010'),
    ];
    // Newest started (Oct 2-9) ended; the short Oct 1-20 block runs today but the long
    // regular period wins, and its midpoint (Jul 31 2026) is outside the ended block.
    expect(detectReferenceDate(calendar, [], undefined)).toBe('20260731');
  });
});

describe('running-period reference guards (#734 follow-up)', () => {
  // Real feeds, today Oct 12 2026. calendar.txt and calendar_dates.txt are unchanged.
  // clallamtransit/raba keep two whole routes; carta/miami keep up to 5 trips per
  // (route, service) with only route_id/service_id/trip_id, so every service's route set
  // is kept.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-12T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  const reference = async (name: string) => {
    const gtfs = await parseGtfsZip(new Uint8Array(await fixtureZip(name)).buffer as ArrayBuffer);
    return detectReferenceDate(gtfs.calendar!, gtfs.calendarDates, gtfs.trips);
  };
  // Calendar-only fixtures (no stops or routes): read the three files directly.
  const csv = (name: string, file: string): any[] => {
    const [header, ...rows] = readFileSync(resolve(FIXTURES, name, file), 'utf8').trim().split('\n').map(l => l.split(','));
    return rows.map(row => Object.fromEntries(header.map((h, i) => [h, row[i]])));
  };
  const calendarReference = (name: string) =>
    detectReferenceDate(csv(name, 'calendar.txt'), csv(name, 'calendar_dates.txt'), csv(name, 'trips.txt'));
  const featuresByDay = async (name: string, slug: string) => {
    const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
    const counts: Record<string, number> = {};
    for (const feature of JSON.parse(result.geojson).features) {
      if (feature.properties.stopId != null) continue;
      counts[feature.properties.day] = (counts[feature.properties.day] ?? 0) + 1;
    }
    return counts;
  };

  // The summer period (Seasonal / Summer-*) ended Sep 6-7 and the regular period runs on.
  // The regular weekend services are removed every summer weekend through Sep 5/6, and
  // weekdays through Labor Day (Sep 7). Moving the reference to the day after summer
  // (Sep 7/8) read the last summer weekend: the regular weekend service was removed and
  // the summer one out of range, so Saturday and Sunday lost every route. The reference
  // now moves to the first week with no fully removed day.
  it('clallamtransit keeps its weekend routes after the summer period ends', async () => {
    expect(await reference('clallamtransit-summer-weekend-removals')).toBe('20260911');
    const counts = await featuresByDay('clallamtransit-summer-weekend-removals', 'clallamtransit');
    expect(counts.Saturday).toBeGreaterThan(0);
    expect(counts.Sunday).toBeGreaterThan(0);
    expect(counts.Weekday).toBeGreaterThan(0);
  });

  it('raba keeps its weekend routes after the summer period ends', async () => {
    // The Sep 11 week still holds summer removals, so since #686 the running period is read
    // from the first typical week after the run date instead; weekends are kept either way.
    expect(await reference('raba-summer-weekend-removals') >= '20260911').toBe(true);
    const counts = await featuresByDay('raba-summer-weekend-removals', 'raba');
    expect(counts.Saturday).toBeGreaterThan(0);
    expect(counts.Sunday).toBeGreaterThan(0);
    expect(counts.Weekday).toBeGreaterThan(0);
  });

  // Stale feeds: the main period has ended and only a small side period still runs. The
  // reference stays where it was before #734.
  it('carta does not switch to the small TriCounty Link period', () => {
    // Main period May 22-Aug 15 2026 (32 routes) ended; TriCounty Link (Jan 2026-May
    // 2027, 8 routes) runs on. Switching put the reference at Sep 15.
    expect(calendarReference('carta-stale-main-period')).toBe('20260703');
  });

  it('carta corridors use the same reference as the routes', async () => {
    // Routes 10 and 11 (1235/1236, main period, weekday trips) and TriCounty Link CS8
    // (6289), shapes dropped. Corridors re-detected the reference without trips, so the
    // route-share guard was skipped and they used Sep 15, when neither 10 nor 11 runs:
    // their shared trunk (764916 -> 764333) lost its corridor.
    const result = await processGtfsBuffer(await fixtureZip('carta-stale-main-corridor'), undefined, { slug: 'carta' });
    const trunk = JSON.parse(result.corridorsGeojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.day === 'Weekday' && p.corridorId === '764916->764333');
    expect(trunk).toHaveLength(1);
    expect([...trunk[0].routeIds].sort()).toEqual(['1235', '1236']);
  });

  it('miami-dade does not switch to the long period whose midpoint is in 2025', () => {
    // Bus periods (Mar 30 / Apr 27-Jul 19 2026) ended. The newest running period, Nov 13
    // 2023-Dec 31 2026, has its midpoint on Jun 7 2025, before the bus periods start:
    // 47 of 122 routes and no commuter rail.
    expect(calendarReference('miami-dade-stale-bus-periods')).toBe('20260607');
  });
});

describe('a short replacement block is not the reference (#921)', () => {
  // Real feed (R2 gtfs/archive/soundtransit/20270326-11d7d0460ddcf215.zip), run on Oct 16 2026: calendar.txt and
  // calendar_dates.txt unchanged, up to 5 trips per (route, service) with route_id/service_id/trip_id only. The newest
  // period running is the Oct 17-18 Link bus bridge (2 services) replacing weekend rail; the 1 Line and 2 Line ran on
  // no service in that block, so they dropped.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-16T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  const csv = (file: string): any[] => {
    const [header, ...rows] = readFileSync(resolve(FIXTURES, 'soundtransit-bus-bridge-calendar', file), 'utf8').trim().split('\n').map(l => l.replace(/\r$/, '').split(','));
    return rows.map(row => Object.fromEntries(header.map((h, i) => [h, row[i]])));
  };

  it('Sound Transit reads its regular timetable: the 1 Line and 2 Line run on the reference weekday and Saturday', () => {
    const calendar = csv('calendar.txt'), calendarDates = csv('calendar_dates.txt'), trips = csv('trips.txt');
    const ref = detectReferenceDate(calendar, calendarDates, trips);
    expect(['20261017', '20261018']).not.toContain(ref);
    for (const day of ['Monday', 'Saturday'] as const) {
      const active = getActiveServiceIds(calendar, calendarDates, day, ref);
      const routes = new Set(trips.filter(t => active.has(t.service_id)).map(t => t.route_id));
      expect(routes.has('100479'), `1 Line ${day}`).toBe(true);
      expect(routes.has('2LINE'), `2 Line ${day}`).toBe(true);
    }
  });
});
