import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// YRT Viva Blue (real feed 2026.09.06, route 601, weekday service 155.0.1 only, shapes
// thinned to every 25th point). Northbound "Newmarket Terminal - NB" runs on two shapes:
// 83258, 85 trips from Finch GO all day, and 83259, 11 trips from Richmond Hill Centre
// between 03:00 and 06:00. Both clean to the same headsign, so they share a dedupe slot, and
// the pre-dawn shape (no midday service, median 11) won it on headway: the Newmarket feature
// had headwayByPeriod null in every daytime period and read "limited" midday (#746).
// Hand count, Wed Oct 14 2026: Finch GO departures for Newmarket every 16 from 10:00 to 15:00.
async function fixtureZip(): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', 'yrt-viva-blue-night-shape');
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('feature dedupe between a daytime and a night-only pattern', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('keeps the all-day Newmarket pattern over the pre-dawn short trips (YRT Viva Blue)', async () => {
    const result = await processGtfsBuffer(await fixtureZip(), undefined, { slug: 'yrt' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.routeId === '601' && p.day === 'Weekday' && p.stopId == null);
    const newmarket = weekday.find((p: any) => p.directionId === 0);
    expect(newmarket.headsign).toBe('Newmarket Terminal');
    expect(newmarket.headwayByPeriod.midday).toBe(16);
    expect(newmarket.headway).toBe(16);
    // The southbound direction has one pattern and is unchanged.
    const finch = weekday.find((p: any) => p.directionId === 1);
    expect(finch.headwayByPeriod.midday).not.toBeNull();
  });
});
