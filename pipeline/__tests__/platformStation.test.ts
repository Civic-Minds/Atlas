/**
 * CIV-226: Sound Transit 1 Line weekday (fixture cut 2026-11-04 from the 2027-03-28 archive zip, the service's
 * calendar_dates removals dropped so the pinned week has service). Trips alternate between the two Federal Way
 * Downtown platforms (S07-T1, S07-T2, both children of S07), 60 each; before, each platform graded 60 and read
 * every 20 toward Lynnwood (every 16, tier 30, toward Federal Way) while the station and the line run every 10,
 * and the worst-drawn-stop rule put that on the row (headwayByPeriod 16/20/16/20, tier 60).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';
import { fixtureSameNameRoutes } from './fixtureAgencyNames.js';

vi.setConfig({ testTimeout: 60_000 });
const NAME = 'soundtransit-1-line-weekday';

async function run() {
  const dir = join(import.meta.dirname, 'fixtures', NAME);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(join(dir, file)));
  const r = await processAgencyFeeds(await zip.generateAsync({ type: 'nodebuffer' }), [], { slug: 'soundtransit', sameNameRoutes: fixtureSameNameRoutes(NAME) });
  return JSON.parse(r.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.routeShortName === '1 Line' && p.day === 'Weekday');
}

describe('a child platform reads as its station (CIV-226)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-12-16T12:00:00Z') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('Sound Transit 1 Line: both Federal Way platforms carry the station\'s value and grade, and the row reads the line\'s every 10', async () => {
    const rows = await run();
    const toLynnwood = rows.find((p: any) => p.directionId === 1)!;
    const toFederalWay = rows.find((p: any) => p.directionId === 0)!;
    for (const row of [toLynnwood, toFederalWay]) {
      expect(row.stopHeadways['S07-T1']).toBe(row.stopHeadways['S07']);
      expect(row.stopHeadways['S07-T2']).toBe(row.stopHeadways['S07']);
      expect(row.stopTiers['S07-T1']).toBe(row.stopTiers['S07']);
      expect(row.stopPeriodHeadways['S07-T1']).toEqual(row.stopPeriodHeadways['S07']);
    }
    expect(toLynnwood.stopHeadways['S07']).toBe(10);
    // The row toward Federal Way ends at a remapped platform: its own terminal reading is the station's.
    expect(toFederalWay.headway).toBe(toFederalWay.stopHeadways['S07']);
    expect(toLynnwood.headwayByPeriod.midday).toBe(10);
    expect(toLynnwood.headway).toBe(10);
    expect(toLynnwood.tier).not.toBe('60');
    expect(toFederalWay.tier).not.toBe('30');
    // The row's own stretch reading is untouched: the filter still reads the stretches.
    expect(toLynnwood.routeFilterHeadwayByPeriod.midday).toBe(10);
  });
});
