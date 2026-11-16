import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { pooledDaytimeWindow, pooledMiddayWorstWait } from '../routeGrading';

// #1534 (CIV-1658): the destination pool's headline guard. A pool qualifies with an even midday
// or PM-peak reading of its own, the window order a single shape gets, instead of needing an
// all-day reading; and an uneven pool midday reads its longest wait where that beats the drawn
// shape's own midday. The 8-departure minimum, the evenness guard and the skipped-stop floor stay.

const at = (...hhmm: string[]) => hhmm.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });

describe('pooledDaytimeWindow and pooledMiddayWorstWait', () => {
  it('fairfax 334: a pool with 150- and 210-minute midday holes reads its PM peak every 30', () => {
    const pool = at('05:52', '06:34', '07:19', '07:51', '08:19', '08:49', '09:49', '12:19', '15:49', '16:19', '16:49', '17:21', '17:51', '18:21', '18:49', '19:19', '19:49');
    expect(pooledDaytimeWindow(pool, at('05:52', '06:34', '07:19', '07:51', '08:19', '18:49', '19:19', '19:49'))).toBe('pmPeak');
  });

  it('a night route with neither a midday nor a PM-peak reading has no daytime reading', () => {
    expect(pooledDaytimeWindow(at('01:10', '01:40', '02:10', '02:40', '03:10', '03:40', '04:10', '04:40', '05:10'))).toBeUndefined();
  });

  it('two branches 3 minutes apart (#813) still have no daytime reading', () => {
    const every = (from: number, to: number) => { const out: number[] = []; for (let t = from; t <= to; t += 30) out.push(t); return out; };
    expect(pooledDaytimeWindow([...every(540, 1140), ...every(543, 1140)].sort((a, b) => a - b))).toBeUndefined();
  });

  it('lacmta 108: midday alternating 10, 10, 20 reads its longest wait 21 against the own 40', () => {
    const pool = at('09:07', '09:15', '09:32', '09:41', '09:51', '10:11', '10:21', '10:31', '10:52', '11:01', '11:11', '11:30', '11:40', '11:50', '12:10', '12:20', '12:30', '12:51', '13:01', '13:11', '13:31', '13:41', '13:51', '14:11', '14:21', '14:32', '14:52', '15:03');
    const own = at('09:07', '09:41', '10:21', '11:01', '11:40', '12:20', '13:01', '13:41', '14:21', '15:03');
    expect(pooledMiddayWorstWait(pool, own)).toBe(21);
  });

  it('a longest wait over the own midday changes nothing (ttc 129, camtran 1 Saturday, septa 1)', () => {
    // camtran 1 Saturday: own every 35, the pool's midday has a 117-minute hole.
    const pool = at('09:59', '10:02', '10:19', '10:34', '11:58', '13:55', '14:02', '14:19', '14:23');
    expect(pooledMiddayWorstWait(pool, at('09:59', '10:34', '13:55', '14:19'))).toBeUndefined();
    // No own midday reading: nothing to beat.
    expect(pooledMiddayWorstWait(pool, at('07:00', '16:00'))).toBeUndefined();
  });
});

describe('route headlines on real feeds (#1534)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  async function rows(name: string, slug: string): Promise<any[]> {
    const dir = resolve(__dirname, 'fixtures', name);
    const zip = new JSZip();
    for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
    return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && !p.isCorridor && p.day === 'Weekday');
  }

  it('fairfax 334 to Franconia-Springfield reads its destination every 30, not the drawn shape\'s 180', async () => {
    // Shape shp-334-07: 8 trips, none 09:00-15:00 (180 was a two-gap mean). The headsign's 17
    // trips reach the drawn stops every 30 at PM peak, with 150- and 210-minute midday holes.
    const r = (await rows('fairfax-334-weekday', 'fairfax')).find(p => p.headsign === 'FRANCONIA-SPRINGFIELD METRO BAY J');
    expect(r).toMatchObject({ headway: 30, tier: 'infrequent' });
    expect(r.headwayByPeriod).toMatchObject({ midday: null, pmPeak: 30 });
  }, 60_000);

  it('lacmta 108 to Mesmer / Major reads the pool\'s longest midday wait 21, not the drawn shape\'s 40', async () => {
    // Drawn shape 1080429_JUNE26 alone runs every 40 midday; the headsign's trips through the
    // drawn stops alternate 10, 10, 20 (longest 21), which the evenness guard (#813) refuses.
    const r = (await rows('lacmta-108-weekday', 'lacmta')).filter(p => p.headsign === 'Mesmer / Major' && p.directionId === 1);
    expect(r.map(p => p.headway).sort((a, b) => a - b)).toEqual([20, 21]);
    // The other drawn rows of the route keep their values.
    const others = (await rows('lacmta-108-weekday', 'lacmta')).filter(p => p.headsign !== 'Mesmer / Major').map(p => `${p.directionId} ${p.headsign} ${p.headway}`).sort();
    expect(others).toEqual(['0 Eastern / Harbor 20', '0 Passons / Slauson 20', '0 Passons / Slauson 38', '1 Culver City Transit Center null', '1 Washington / Palawan 40']);
  }, 120_000);
});
