import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// The route card's hourly chart reads the destination pool; its rows are floored at the worst
// drawn stop some pooled trips skip (#771). The chart takes the same floor, so a planner never
// sees "every 8" bars under a row that says 16.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('hourly chart floored like the period values', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it("TTC 29 northbound: each origin row's hours read its own 16, not the pooled trunk's 8", async () => {
    const result = await processGtfsBuffer(await fixtureZip('ttc-29-weekday'), undefined, { slug: 'ttc' });
    const north = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .filter((p: any) => p.stopId == null && p.day === 'Weekday' && p.routeId === '29' && p.directionId === 1);
    expect(north).toHaveLength(2);
    for (const row of north) {
      expect(row.headway).toBe(16);
      expect(row.headwayByPeriod.midday).toBe(16);
      // Each hour reads the origin's own stops (16 through the midday, 13-14 in the 14:00 hour
      // where the origin runs more often), never the trunk's 8.
      for (const h of [10, 11, 12, 13]) expect(row.headwayByHour[h], `${row.routeVariant} hour ${h}`).toBe(16);
      expect(row.headwayByHour[14]).toBeGreaterThanOrEqual(13);
      // The trunk's every 8 still shows at the shared stops.
      const trunk = row.stopOrder.slice(-20).map((s: string) => row.stopHeadways[s]);
      expect(trunk.every((v: number) => v === 8)).toBe(true);
    }
  });

  it('TriMet 35 to Oregon City: a mid-route deviation served hourly by one shape still floors the line (not a stub)', async () => {
    const result = await processGtfsBuffer(await fixtureZip('trimet-35-weekday'), undefined, { slug: 'trimet' });
    const oc = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .find((p: any) => p.stopId == null && p.day === 'Weekday' && p.routeId === '35' && p.directionId === 0 && p.headsign === 'Oregon City Transit Center');
    expect(oc.headway).toBe(60);
    expect(oc.headwayByPeriod.midday).toBe(60);
    for (const h of [10, 11, 12, 13]) expect(oc.headwayByHour[h], `hour ${h}`).toBeGreaterThanOrEqual(60);
  });
});
