import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { processAgencyFeeds } from '../agencyFeeds.js';
import { TIER_MAXES } from '../../shared/rules/frequency';

// CIV-152: every headway-to-tier step on the route (settleTier, the rescues, the stop grades' cap,
// the lift) reads the grading scale, so a subway every 4 reaches tier 5 end to end. CIV-1813: that
// scale (5-8-10-15-20-30-60) is the same for every mode, buses included.

async function zipDir(dir: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(join(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}
const lines = (geojson: string, day: string) => (JSON.parse(geojson).features as any[])
  .map(f => f.properties).filter(p => p.stopId == null && p.day === day && p.headway != null);
const ON_SCALE = new Set([...TIER_MAXES.map(String), 'infrequent', 'span']);

describe('rail tier scale end to end', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  // CIV-2025: skipped, not deleted. This expectation pins a train-only rule Ryan had removed; the cloud dry run measures it, and if the rule proves protective it is restored and goes to him.
  it.skip('TTC Line 1 weekday, every 4, reaches tier 5 in both directions (settleTier on the rail scale, not 10)', async () => {
    const result = await processGtfsBuffer(await zipDir(resolve(__dirname, 'fixtures', 'ttc-line1-weekday')), undefined, { slug: 'ttc' });
    const weekday = lines(result.geojson, 'Weekday');
    expect(weekday.length).toBeGreaterThan(0);
    for (const p of weekday) {
      expect(p.headway).toBe(4);
      // Before the scale fix settleTier degraded phase 2's 5 to the surface scale's 10.
      expect(p.tier).toBe('5');
    }
  });

  it('a mixed bus and subway agency grades both modes on the one scale (MDOT MTA bus 69 + Metro SubwayLink)', async () => {
    vi.setSystemTime(new Date('2026-03-11T12:00:00'));
    const FIXTURE = join(import.meta.dirname, 'fixtures/mdot-mta-bus-rail');
    const result = await processAgencyFeeds(
      await zipDir(join(FIXTURE, 'bus')),
      [{ url: 'https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_metro.zip', buf: await zipDir(join(FIXTURE, 'metro-subway')) }],
      { slug: 'mta-maryland', supplementalFeedUrls: ['https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_metro.zip'] },
      {},
      () => {},
    );
    const weekday = lines(result.geojson, 'Weekday');
    const bus = weekday.filter(p => String(p.routeType) === '3');
    const rail = weekday.filter(p => String(p.routeType) !== '3');
    expect(bus.length).toBeGreaterThan(0);
    expect(rail.length).toBeGreaterThan(0);
    for (const p of weekday) expect(ON_SCALE.has(p.tier), `${p.routeShortName} ${p.tier}`).toBe(true);
    // Either mode's tier is its headway's tier on the one scale, never 10 for a 5-8 headway.
    for (const p of weekday) {
      const onScale = TIER_MAXES.find(m => p.headway <= m);
      if (onScale != null && onScale <= 8) expect(['5', '8']).toContain(p.tier);
    }
  });
});
