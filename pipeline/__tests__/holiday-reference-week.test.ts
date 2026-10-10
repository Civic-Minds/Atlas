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
