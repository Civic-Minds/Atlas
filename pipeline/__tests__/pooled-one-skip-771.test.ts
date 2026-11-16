import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #771 (Pace 530): the destination pool also counts a trip that skips one stop of the drawn
// line's last third, when the skipped-stop floor reads that stop. Pace 530 to Galena/
// Constitution, weekday: the drawn shape 5300482 (3 trips) and 5300489 (4) serve every
// last-third stop; 5300485 (5) and 5300478 (3) skip only Constitution House (526w0225), which
// has 8 departures of its own (09:56-16:58). Without them the pool held 7 trips, under the
// 8-trip minimum, so the period values read every trip reaching the terminal (30), better
// than Constitution House (76) and the Plum St stretch (43) the drawn line runs through.

const DIR = resolve(__dirname, 'fixtures', 'pace-530-weekday');
const CONSTITUTION_HOUSE = '526w0225';
const GALENA_2287 = '526w0240';
const ONE_SKIP_SHAPES = new Set(['5300485', '5300478']);

type Edit = (tripShape: string, stopId: string) => boolean;

async function row(keepStopTime: Edit = () => true): Promise<any> {
  const shapeOf = new Map<string, string>();
  const tripLines = readFileSync(resolve(DIR, 'trips.txt'), 'utf8').trim().split('\n');
  const th = tripLines[0].split(',');
  for (const line of tripLines.slice(1)) { const c = line.split(','); shapeOf.set(c[th.indexOf('trip_id')], c[th.indexOf('shape_id')]); }
  const zip = new JSZip();
  for (const file of readdirSync(DIR)) {
    let text = readFileSync(resolve(DIR, file), 'utf8');
    if (file === 'stop_times.txt') {
      const [head, ...rest] = text.trim().split('\n');
      const h = head.split(',');
      text = [head, ...rest.filter(l => { const c = l.split(','); return keepStopTime(shapeOf.get(c[h.indexOf('trip_id')])!, c[h.indexOf('stop_id')]); })].join('\n') + '\n';
    }
    zip.file(file, text);
  }
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'pace-bus' });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties)
    .find((p: any) => p.stopId == null && !p.isCorridor && p.day === 'Weekday' && p.headsign === 'Galena Blvd & Constitution Dr (Nelson St)');
}

describe('destination pool with one skipped last-third stop (#771)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('Pace 530: the period values read the pool and never beat Constitution House', async () => {
    const r = await row();
    expect(r.stopHeadways[CONSTITUTION_HOUSE]).toBe(76);
    // The headline is Constitution House's own wait, the worst drawn stop.
    expect(r.headway).toBe(76);
    expect(r.headwayByPeriod).toMatchObject({ amPeak: null, midday: 76, pmPeak: 70 });
  }, 120_000);

  it('a trip skipping two last-third stops stays out of the pool', async () => {
    // 5300485 and 5300478 also skip 2287 Galena Blvd: 7 pool trips, under the minimum, so the
    // periods keep the terminal list, as before #771's one-skip rule.
    const r = await row((shape, stopId) => !(ONE_SKIP_SHAPES.has(shape) && stopId === GALENA_2287));
    expect(r.headwayByPeriod).toMatchObject({ amPeak: 30, midday: 30, pmPeak: 30 });
  }, 120_000);

  it('a skipped stop the floor cannot read (no all-day reading) is never skipped', async () => {
    // Constitution House kept on the drawn shape's 3 trips only: under 4 daytime departures, no
    // reading, so no floor would bound the line there and no trip may skip it.
    const r = await row((shape, stopId) => stopId !== CONSTITUTION_HOUSE || shape === '5300482');
    expect(r.headwayByPeriod).toMatchObject({ amPeak: 30, midday: 30, pmPeak: 30 });
  }, 120_000);
});
