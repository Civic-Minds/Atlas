import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { headwayToTierOn } from '../headway-utils';
import { riderWait } from '../stretchMedian';

// CIV-845: a stop shows its shared stretch's value (the median of the stretch's average waits),
// never more than 1 min better than its own wait, and its colour grades from that shown value.
// Real DRT feed (2026-10-19 to 11-29): route 901 northbound weekday (checked against the 901
// timetable effective Sept 8, 2026) and route 421 weekend toward Oshawa Centre; shapes thinned 10x.

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const TIERS = ['5', '8', '10', '15', '20', '30', '60', 'infrequent'];

describe('stretch median stop values (CIV-845)', () => {
  let all: any[] = [];
  let lines: any[] = [];
  let zip: Buffer;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-28T12:00:00') });
    zip = await fixtureZip('drt-901-421');
    all = JSON.parse((await processGtfsBuffer(zip, undefined, { slug: 'drt' })).geojson).features
      .map((f: any) => f.properties).filter((p: any) => p.stopId == null);
    lines = all.filter(p => p.routeShortName === '901' && p.day === 'Weekday');
  });
  afterAll(() => { vi.useRealTimers(); });

  const at = (stopId: string) => lines.find(p => p.stopPeriodHeadways?.[stopId]);

  it('Oshawa Centre Terminal reads the uneven 10/20 gaps as the wait, not the 15 median gap', () => {
    // Two of every three trips start here, so buses alternate 10 and 20 minutes.
    const p = at('2595');
    expect(p.stopPeriodHeadways['2595']).toMatchObject({ amPeak: 18, midday: 18, pmPeak: 16 });
    expect(p.stopTiers['2595']).toBe('30');
  });

  it('Simcoe stops read the stretch value: every 5-14 in the AM peak is 12, not 15 or 18', () => {
    expect(at('605').stopPeriodHeadways['605']).toMatchObject({ amPeak: 12, midday: 11 });
    expect(at('691').stopPeriodHeadways['691']).toMatchObject({ amPeak: 12, midday: 11 });
    expect(at('605').stopTiers['605']).toBe('20');
    expect(at('691').stopTiers['691']).toBe('20');
  });

  it('421 weekend: a stop showing 31 is coloured hourly, not the every-30 of its own grade', () => {
    const p = all.find(q => q.routeShortName === '421' && q.day === 'Saturday' && q.stopHeadways?.['941'] != null);
    expect(p.stopHeadways['941']).toBe(31);
    expect(p.stopTiers['941']).toBe('60');
  });

  it('no stop colour is better than the tier of the value it shows, on every day', () => {
    for (const p of all) {
      for (const [stopId, tier] of Object.entries(p.stopTiers ?? {}) as [string, string][]) {
        const shown = p.stopHeadways?.[stopId];
        if (shown == null) continue;
        expect(TIERS.indexOf(tier)).toBeGreaterThanOrEqual(TIERS.indexOf(headwayToTierOn(shown, [10, 15, 20, 30, 60])));
      }
    }
  });
});

describe('riderWait', () => {
  it('reads alternating 10 and 20 minute gaps as 16.7, not the 15 median', () => {
    expect(riderWait([600, 610, 630, 640, 660, 670, 690], 540, 900)).toBeCloseTo(16.67, 2);
  });
});
