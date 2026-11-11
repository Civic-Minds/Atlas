import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-1389 (#1088, Ryan's decision): a rush-hour-only bus pattern's trips count at the stops it
// shares stop for stop with a sibling pattern of the same route, in the rush periods it runs
// there, in the sibling's published stop values only. The rush pattern never joins the shared
// pool: no headline, tier, row or route value moves, and the rush row keeps its own values (#720).

async function fixtureRows(name: string, slug = name.split('-')[0]): Promise<any[]> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) if (file.endsWith('.txt')) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
}

/** A row's published stop value in one period, stop by stop along its stopOrder (null: none). */
const periodRow = (p: any, pk: string): Array<number | null> =>
  (p.stopOrder as string[]).map(stopId => p.stopPeriodHeadways?.[stopId]?.[pk] ?? null);

/** Compact expected rows: "10x10,20x5" is 10 at 10 stops then 20 at 5; "-" is no value. */
const runs = (spec: string): Array<number | null> => spec.split(',').flatMap(part => {
  const [value, count] = part.split('x');
  return Array.from({ length: Number(count ?? 1) }, () => (value === '-' ? null : Number(value)));
});

describe('a sibling counts the rush-hour-only trips at the stops they share (CIV-1389)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('TTC 102 to Warden reads 15 on the shared stretch at 4220 in the PM peak, not 22 (#1088)', async () => {
    const rows = (await fixtureRows('ttc-102-weekday')).filter(p => p.routeShortName === '102' && p.day === 'Weekday' && p.directionId === 0);
    const warden = rows.find(p => p.headsign === 'Warden');
    // GTFS (fixture, Wednesday 2026-10-21) at 4220, 15:00-19:00: 36 boarding departures of 102 and
    // 102C via Dynamic Dr, longest gap 15 (15:08-15:23, 15:28-15:43, 16:30-16:45). Still refused as
    // uneven, so the stop shows that longest wait.
    expect(warden.stopPeriodHeadways['4220'].pmPeak).toBe(15);
    // 13668: 24 departures, gaps 7-12 (102C every 20 between the 102's every 30). 12605: no 102C.
    expect(warden.stopPeriodHeadways['13668'].pmPeak).toBe(10);
    expect(warden.stopPeriodHeadways['12605'].pmPeak).toBe(30);
    expect(periodRow(warden, 'pmPeak')).toEqual(runs('19x2,10x3,30x2,10x8,15x38'));
    // Nothing else of the row moves: midday, headline, tier, row periods, route fields, labels.
    expect(warden.stopPeriodHeadways['4220']).toMatchObject({ amPeak: 12, midday: 14, evening: 8, late: 10, overnight: 12 });
    expect(warden).toMatchObject({ headway: 15, tier: 'infrequent', serviceClass: 'regular' });
    expect(warden.headwayByPeriod).toEqual({ amPeak: 12, midday: 15, pmPeak: 30, evening: 8, late: 10, overnight: 13 });
    expect(warden.routeFilterHeadwayByPeriod).toEqual({ amPeak: 24, midday: 30, pmPeak: 30, evening: 30, late: 20, overnight: null });
    // The shared-stretch label still names only pool members: 102C is not one.
    expect(warden.sharedStretches).toEqual([{ from: 0, to: 13, with: ['Sheppard'] }]);
    // The rush row keeps its own values (CIV-850's read of the pool, unchanged).
    const rush = rows.find(p => p.headsign === 'Warden via Dynamic Dr');
    expect(rush).toMatchObject({ serviceClass: 'time-limited', headway: null });
    expect(rush.stopPeriodHeadways['4220']).toEqual({ pmPeak: 16, evening: 15 });
    expect(rush.sharedStretches).toBeUndefined();
  });

  it('a local counts a PM branch on their common stops only, from timetable or frequencies.txt', async () => {
    // Synthetic: a local every 20 all day over 15 stops; a PM branch every 20, 10 minutes after it,
    // over the local's first 10 stops, then its own 5. X2 writes the branch as frequencies.txt.
    const rows = await fixtureRows('synthetic-rush-branch-1389', 'synthetic');
    for (const route of ['X1', 'X2']) {
      const local = rows.find(p => p.routeShortName === route && p.headsign === 'Downtown');
      const branch = rows.find(p => p.routeShortName === route && p.headsign === 'Branch Rd');
      expect(periodRow(local, 'pmPeak')).toEqual(runs('10x10,20x5'));
      // Not in the hours the branch does not run, and not on the row's own values.
      expect(periodRow(local, 'amPeak')).toEqual(runs('20x15'));
      expect(periodRow(local, 'midday')).toEqual(runs('20x15'));
      expect(local).toMatchObject({ headway: 20, tier: '20', serviceClass: 'regular' });
      expect(local.headwayByPeriod.pmPeak).toBe(20);
      expect(local.sharedStretches).toBeUndefined();
      // The branch row: as before, its own read of the pool (CIV-850).
      expect(branch).toMatchObject({ serviceClass: 'time-limited', headway: null });
      expect(periodRow(branch, 'pmPeak')).toEqual(runs('10x10,20x5'));
    }
    // X3: the branch under the local's own headsign already pools; it is counted once (every 10, not less).
    const x3 = rows.find(p => p.routeShortName === 'X3' && p.headsign === 'Downtown');
    expect(periodRow(x3, 'pmPeak')).toEqual(runs('10x10,20x5'));
  });

  it('a skip-stop rush express counts only where it serves every stop (ETS 202, synthetic X1)', async () => {
    // ETS 202 eastbound weekday: the AM Kingsway TC Express serves the local's first 10 stops stop for
    // stop (contiguousSharedRuns), every 20 06:06-08:26 at A0111. The local has no AM trips of its own
    // in this cut, so those 10 stops gain every 20; its other stops and the express row stay as they were.
    const ets = (await fixtureRows('edmonton-202', 'edmonton')).filter(p => p.directionId === 0 && p.day === 'Weekday');
    const local = ets.find(p => p.headsign === 'Kingsway RAH Transit Centre');
    expect(periodRow(local, 'amPeak').filter(v => v != null)).toEqual(runs('20x10'));
    expect(periodRow(ets.find(p => p.headsign === 'Kingsway Tc Express'), 'amPeak')).toEqual(runs('20x12,-'));
    // An express at every other stop shares no run: the local keeps its every 10.
    const skip = (await fixtureRows('synthetic-skip-stop-express', 'synthetic')).filter(p => p.routeShortName === 'X1' && p.day === 'Weekday');
    expect(periodRow(skip.find(p => p.headsign === 'Downtown'), 'pmPeak')).toEqual(runs('10x20'));
  });
});

describe('what the rush-hour-only trips still never change (#720)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('LA Metro 105: Marlton / King keeps its headline and row values; only its PM stop values count Fairfax', async () => {
    const rows = (await fixtureRows('lacmta-105')).filter(p => p.directionId === 0);
    const marlton = rows.find(p => p.day === 'Weekday' && p.headsign === 'Marlton / King Layover');
    expect(marlton).toMatchObject({ headway: 27, tier: '60', serviceClass: 'regular' });
    expect(Object.values(marlton.headwayByPeriod).every(v => v == null)).toBe(true);
    // 8128 weekday PM: every 9-13 from 15:03 to 18:55 (GTFS 2026-10-21, all 105 trips). The pool this
    // pattern reads there plus the Washington Fairfax trips still has a 24-minute gap, so it reads 24
    // (was 40): never better than the buses a rider sees.
    expect(marlton.stopPeriodHeadways['8128'].pmPeak).toBe(24);
    expect(marlton.stopPeriodHeadways['8128']).toMatchObject({ amPeak: 11, midday: 10 });
    // The rush row itself is unchanged, and gains no midday or AM value.
    const fairfax = rows.find(p => p.day === 'Weekday' && p.headsign === 'Washington Fairfax Hub');
    expect(fairfax.headwayByPeriod).toMatchObject({ amPeak: null, midday: null, pmPeak: 20 });
    expect(fairfax.stopPeriodHeadways['8128']).toEqual({ pmPeak: 20 });
    for (const pk of ['amPeak', 'midday']) expect(periodRow(fairfax, pk).every(v => v == null)).toBe(true);
    // Division 7, the trunk, does not share a stop-for-stop run with Fairfax here and is unchanged.
    expect(rows.find(p => p.day === 'Weekday' && p.headsign === 'Division 7 Layover').stopPeriodHeadways['8128'].pmPeak).toBe(20);
  });

  it('CDTA 233 to Pearl & Hudson stays 385 and gains no stop values', async () => {
    const rows = (await fixtureRows('cdta-233')).filter(p => p.day === 'Weekday');
    const pearl = rows.find(p => p.directionId === 1 && p.headsign === 'Pearl & Hudson');
    expect(pearl).toMatchObject({ headway: 385, serviceClass: 'regular' });
    expect(pearl.stopPeriodHeadways).toBeUndefined();
    // The whole fixture is unchanged by CIV-1389 (its headline-window-pin hash did not move).
  });
});
