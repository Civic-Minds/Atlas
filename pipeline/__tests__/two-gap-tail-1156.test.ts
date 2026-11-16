import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { computePeriodSustained } from '../headway-utils';
import { processGtfsBuffer } from '../process-core';
import { stretchPeriods, type Stretch } from '../tripSets';

// CIV-1156 (#1533): a tail with three departures in a period (two gaps) counts for its direction only
// when its gaps are even (isSteadyPeriodGaps, #1432). The settled steadiness test compares the longer
// gap with the median, which with two gaps is their mean and takes in the long gap itself.
const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const stretch = (kind: 'main' | 'tail', times: string[]): Stretch =>
  ({ kind, stops: ['x'], refStop: 'x', lengthKm: 0, times: times.map(m), nightTimes: [], tripCount: times.length });

vi.setConfig({ testTimeout: 30_000 });

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) if (file.endsWith('.txt')) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function rows(name: string) {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug: 'septa' });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
}

describe('two-gap tails (CIV-1156)', () => {
  it('SEPTA 67 Philadelphia Mills tail, weekday evening 19:17, 20:09, 22:58 (gaps 52 and 169): left out, its own value kept', () => {
    const times = ['19:17', '20:09', '22:58'];
    // The settled flag is unchanged (169 against the mean 110.5 is under 1.7x).
    expect(computePeriodSustained(times.map(m)).evening).toBe(true);
    const tail = stretchPeriods(stretch('tail', times)).evening;
    expect(tail.counts).toBe(false);
    expect(tail.value).toBe(169);
    // A main stretch with the same departures still counts.
    expect(stretchPeriods(stretch('main', times)).evening.counts).toBe(true);
  });

  it('a tail with two even gaps still counts (60 and 60; 30 and 20)', () => {
    expect(stretchPeriods(stretch('tail', ['19:10', '20:10', '21:10'])).evening.counts).toBe(true);
    expect(stretchPeriods(stretch('tail', ['20:30', '21:00', '21:20'])).evening.counts).toBe(true);
  });

  it('a tail with three or more gaps keeps the settled test (45, 25, 65 counts)', () => {
    expect(stretchPeriods(stretch('tail', ['19:00', '19:45', '20:10', '21:15'])).evening.counts).toBe(true);
  });

  it('SEPTA 67 toward Frankford, weekday evening: the direction and the route read the main stretch (25), not the tail (169)', async () => {
    const r = await rows('septa-67-weekday');
    const main = r.find((p: any) => p.day === 'Weekday' && p.directionId === 1 && p.stretchRole === 'main');
    expect(main.directionFilterHeadwayByPeriod.evening).toBe(25);
    expect(main.stretchPeriodHeadway.evening).toBe(25);
    expect(main.routeFilterHeadwayByPeriod.evening).toBe(27);
    // The tail's own longest wait is still published for its row.
    expect(main.stretchMeta.tails[0].maxGap.evening).toBe(169);
  });

  it('SEPTA 55 toward Olney, weekday PM peak: the 3-trip uneven branch (97) no longer decides; the steady branch does (30)', async () => {
    const r = await rows('septa-55-weekday');
    const main = r.find((p: any) => p.day === 'Weekday' && p.directionId === 1 && p.stretchRole === 'main');
    expect(main.directionFilterHeadwayByPeriod.pmPeak).toBe(30);
    expect(main.stretchMeta.tails[1].maxGap.pmPeak).toBe(97);
  });
});
