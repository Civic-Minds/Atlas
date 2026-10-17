import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-226: Sound Transit's 1 Line and 2 Line alternate two platforms at each terminal (S07-T1 /
// S07-T2 at Federal Way Downtown, E31-T1 / E31-T2 at Downtown Redmond, same parent station). Each
// platform held half the trips, every 20 against a train every 10, and set the line's tier (60
// toward Lynnwood, 30 toward the terminal) and the 2 Line's periods (16 toward Redmond). A platform
// whose station the row's trips also reach is now graded and read as that station.
async function rows(fixture: string, slug: string) {
  const dir = resolve(__dirname, 'fixtures', fixture);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.day === 'Weekday');
}

describe('a platform is graded as its station (CIV-226)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('Sound Transit 1 Line and 2 Line: terminal platforms read the station, not half the trains', async () => {
    const all = await rows('soundtransit-1-2-line-weekday', 'soundtransit');
    const row = (line: string, headsign: string) => all.find((p: any) => p.routeShortName === line && p.headsign === headsign);
    const toLynnwood1 = row('1 Line', 'Lynnwood City Center');
    expect(toLynnwood1.stopPeriodHeadways['S07-T1'].midday).toBe(10);
    expect(toLynnwood1.stopTiers['S07-T1']).toBe(toLynnwood1.stopTiers['S07']);
    expect(toLynnwood1.headwayByPeriod.midday).toBe(10);
    expect(toLynnwood1.tier).not.toBe('60');
    const toLynnwood2 = row('2 Line', 'Lynnwood City Center');
    expect(toLynnwood2.stopTiers['E31-T2']).toBe(toLynnwood2.stopTiers['E31']);
    expect(toLynnwood2.tier).not.toBe('60');
    const toRedmond = row('2 Line', 'Downtown Redmond');
    expect(toRedmond.headwayByPeriod.midday).toBe(9);
    expect(toRedmond.tier).not.toBe('30');
  });

  it('REM A3-A1, whose bays pool by shape, is unchanged', async () => {
    const all = await rows('rem-a3-weekday-platforms', 'rem');
    for (const p of all) {
      expect(p.tier).toBe('15');
      expect(p.headwayByPeriod.midday).toBe(15);
    }
  });
});
