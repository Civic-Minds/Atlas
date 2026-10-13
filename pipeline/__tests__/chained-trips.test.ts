import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// TTC 47 Lansdowne (real feed 20261031, route 47, weekday service 1, shapes thinned). TTC splits
// each run at Lansdowne Station: southbound a bus runs 16600 -> 5224 on shape 1122805 (arriving,
// say, 10:52) and leaves 5224 at 10:54 on the next trip of the same block (shape 1122804). Both
// times landed at stop 5224, so the direction's period headways read every 2-3 min against
// its every 7 (#341). Hand count, Wed Oct 14 2026: southbound buses about every 7 at midday.
async function fixtureZip(): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', 'ttc-47-chained-trips');
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('chained trips of one block', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts a bus once where it ends one trip and starts the next (TTC 47 Lansdowne)', async () => {
    const result = await processGtfsBuffer(await fixtureZip(), undefined, { slug: 'ttc' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.routeId === '47' && p.day === 'Weekday' && p.stopId == null);
    for (const direction of weekday) {
      expect(direction.headway).toBe(7);
      expect(direction.headwayByPeriod.midday).toBeGreaterThanOrEqual(6);
    }
    expect(weekday).toHaveLength(2);
  });
});
