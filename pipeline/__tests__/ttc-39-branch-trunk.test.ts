import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #841: TTC 39 westbound to Finch Station on a Sunday runs two branches under one headsign,
// from Littles Rd (68 trips) and from Neilson Rd (67), every 16 each, interleaved every 8 on
// the shared trunk. One row read the drawn branch's 16 while the trunk ran every 8. With the
// converging-origins rows (CIV-221) each branch is a row of its own, every 16, the trunk stops
// read the pooled 8, and the two rows share a stretch.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('TTC 39 Sunday westbound: branch rows every 16, trunk every 8 (#841)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('draws one row per origin and pools the trunk', async () => {
    const result = await processGtfsBuffer(await fixtureZip('ttc-39-sunday-west'), undefined, { slug: 'ttc' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .filter((p: any) => p.stopId == null && p.day === 'Sunday' && p.routeId === '39' && p.directionId === 1 && p.headsign === 'Finch');
    expect(rows.map((p: any) => [p.routeVariant, p.headway]).sort()).toEqual([
      ['from Littles Rd at Sewells Rd North Side', 16],
      ['from Neilson Rd at Crow Trail', 16],
    ]);
    for (const p of rows) {
      expect(p.headwayByPeriod.midday).toBe(16);
      // The last 20 drawn stops are the shared trunk: every 8, pooled across both origins.
      expect(p.stopOrder.slice(-20).map((s: string) => p.stopHeadways[s])).toEqual(Array(20).fill(8));
      expect(p.sharedStretches.some((s: any) => s.with.some((w: string) => w.startsWith('from ')))).toBe(true);
    }
  });
});
