import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { pooledHeadwayInWindow, pooledReadingInWindow } from '../stopPools';

// CIV-1072 (Ryan, 2026-11-10): a pooled stop window the evenness guard refuses shows its worst
// wait, the longest gap between its departures, instead of nothing. Never the pooled mean, and
// never where the window passes the guard or the own pattern already has a value.

const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };
const at = (...hhmm: string[]) => hhmm.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });

describe('pooledReadingInWindow: the worst wait of a refused window', () => {
  it('two 30-minute branches 3 minutes apart read 27, never 15', () => {
    const bunched = [...every(540, 900, 30), ...every(543, 873, 30)].sort((a, b) => a - b);
    expect(pooledReadingInWindow(bunched, 540, 900)).toEqual({ value: null, worstWait: 27 });
    expect(pooledHeadwayInWindow(bunched, 540, 900)).toBeNull();
  });

  it('#813: a 165-minute hole against a value of 98 reads 165, never 98', () => {
    // Every 98 on the own pattern, then a 165-minute hole: the merged value would be 98.
    const own = [400, 498, 596, 694];
    const reading = pooledReadingInWindow([...own, 859], 360, 1320, 3, false, own);
    expect(reading).toEqual({ value: null, worstWait: 165 });
  });

  it('#851: one held bus on a dense service still passes with its typical value, and no worst wait', () => {
    const times = every(540, 900, 5).filter(t => t !== 875);
    expect(pooledReadingInWindow(times, 540, 900)).toEqual({ value: 5, worstWait: null });
  });

  it('an even window keeps its value; a list too short to read has neither', () => {
    // An hourly variant over a half-hourly base (15, 15, 30) is one service.
    const alternation = [...every(540, 900, 30), ...every(555, 900, 60)].sort((a, b) => a - b);
    const reading = pooledReadingInWindow(alternation, 540, 900);
    expect(reading.value).not.toBeNull();
    expect(reading.worstWait).toBeNull();
    expect(pooledReadingInWindow([600, 700], 540, 900)).toEqual({ value: null, worstWait: null });
  });

  it('DRT 901 Simcoe @ Taunton AM is not made more frequent', () => {
    // GTFS 2026-06-29 to 2026-09-06, Wednesday 2026-07-15, stop 691 northbound: 6:04, 6:40, then
    // every 5-14 from 7:00. The pooled reading is unchanged by CIV-1072, and a refused window
    // could only read its 36-minute wait, never the 12 the stretch-median prototype gave.
    const times = at('6:04', '6:40', '7:00', '7:10', '7:24', '7:34', '7:40', '7:54', '8:04', '8:09', '8:22', '8:32', '8:39', '8:52');
    const reading = pooledReadingInWindow(times, 360, 540);
    expect(reading.value).toBe(pooledHeadwayInWindow(times, 360, 540));
    expect(reading).toEqual({ value: null, worstWait: 36 });
  });
});

describe('stop period values: a refused pooled window publishes its worst wait', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  async function fixtureRows(name: string): Promise<any[]> {
    const dir = resolve(__dirname, 'fixtures', name);
    const zip = new JSZip();
    for (const file of readdirSync(dir)) if (file.endsWith('.txt')) zip.file(file, readFileSync(resolve(dir, file)));
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: name.split('-')[0] });
    return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
  }

  it('TTC 102 Weekday to Warden: the shared stretch reads its longest PM wait, not nothing (#1088)', async () => {
    const rows = await fixtureRows('ttc-102-weekday');
    const warden = rows.find(p => p.routeShortName === '102' && p.day === 'Weekday' && p.headsign === 'Warden');
    // The merged PM list at 4220 is refused as uneven, and the Warden pattern has no PM trips of
    // its own there. With the 102C trips via Dynamic Dr counted (CIV-1389, #1088) its worst wait
    // is 15; without them it was 22. 4469 and 13668 read every 10 with them, 30 before.
    expect(warden.stopPeriodHeadways['4220'].pmPeak).toBe(15);
    expect(warden.stopPeriodHeadways['4469'].pmPeak).toBe(10);
    expect(warden.stopPeriodHeadways['13668'].pmPeak).toBe(10);
    // The own pattern's overnight value stands where it had one.
    expect(warden.stopPeriodHeadways['4220'].overnight).toBe(12);
    // Overnight stragglers (two trips after 26:00, then nothing for 150 minutes) do not run
    // through the period (rule 5), so no stop of the row reads "every 150".
    const overnight = Object.values(warden.stopPeriodHeadways as Record<string, Record<string, number>>).map(v => v.overnight).filter(v => v != null);
    expect(Math.max(...overnight)).toBeLessThanOrEqual(60);
    // Route-level values never read it (#690): the route keeps no overnight value.
    expect(warden.routeRunsByPeriod.overnight).toBe(false);
  });

  it('an overnight window refused as uneven still publishes nothing (CIV-1349)', async () => {
    // TTC 41 Saturday to Keele via Keelesdale at 3964: two night trips half an hour apart, then
    // nothing for 168 minutes until the first morning bus. Refused as uneven, no own value, and it
    // passes rule 5 at the stop, but the night check decides the overnight period, so no value.
    const rows = await fixtureRows('ttc-41-saturday-pooled');
    const row = rows.find(p => p.routeShortName === '41' && p.day === 'Saturday' && p.directionId === 0 && p.headsign === 'Keele Station via Keelesdale');
    expect(row.stopPeriodHeadways['3964']).toBeDefined();
    expect(row.stopPeriodHeadways['3964'].overnight).toBeUndefined();
    expect(row.routeRunsByPeriod.overnight).toBe(false);
  });
});
