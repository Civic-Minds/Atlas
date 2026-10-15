import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { sectionRuns } from '../../src/utils/sectionColours';

// #756: rail lines had no per-stop grades, so a short-turn pattern that runs entirely on a
// shared trunk coloured that trunk at its own tier. WMATA Yellow northbound on weekends draws
// "Mount Vernon Square" (every 16) and "Greenbelt" (every 16) and the trunk they share runs
// every 8; each drawn stop now carries its pooled headway's tier on the rail scale, so the
// trunk colours as every 8 while the Greenbelt branch keeps its own 15 to 16.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('rail stop grades (#756)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  it('WMATA Yellow northbound on Saturday and Sunday: the shared trunk grades 8 and 10 on both rows, the Greenbelt branch keeps its own', async () => {
    const result = await processGtfsBuffer(await fixtureZip('wmata-yellow-weekend'), undefined, { slug: 'wmata' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.directionId === 0);
    // The stop grade is the rail rule's every-gap grade of the midday window, never better than
    // the typical wait: the trunk runs every 8 on Saturday and every 8 with 9 to 11-minute gaps
    // on Sunday (10), and each branch every 16 (30 on the rail scale).
    for (const [day, trunk] of [['Saturday', '8'], ['Sunday', '10']] as const) {
      const mvs = rows.find((p: any) => p.day === day && p.headsign === 'Mount Vernon Square');
      const gb = rows.find((p: any) => p.day === day && p.headsign === 'Greenbelt');
      expect(mvs.headway).toBe(16);
      expect(gb.headway).toBe(16);
      // Every stop of the short-turn row is on the trunk and reads the pooled service.
      expect(new Set(Object.values(mvs.stopTiers))).toEqual(new Set([trunk]));
      const gbTiers = gb.stopOrder.map((s: string) => gb.stopTiers[s] ?? null);
      expect(gbTiers.slice(0, 26).every((t: string) => t === trunk)).toBe(true);
      expect(gbTiers.slice(26).every((t: string) => t === '30')).toBe(true);
      // The client colours the trunk at the trunk's grade on both rows against their route tier of 30.
      expect(sectionRuns(mvs.stopOrder.map((s: string) => mvs.stopTiers[s] ?? null), mvs.tier)[0]).toMatchObject({ from: 0, to: 25, tier: trunk });
      expect(sectionRuns(gbTiers, gb.tier)[0]).toMatchObject({ from: 0, to: 25, tier: trunk });
    }
  });

  it('WMATA Yellow southbound to Huntington on weekends: the tier reads the pooled sample its headline reads (#898)', async () => {
    // Trains to Huntington start at Greenbelt and at Mt Vernon Square under one headsign, every
    // 16 each and every 8 together at every stop of the drawn pattern. The headline reads the
    // pooled terminal sample (8); the tier used to be phase 2's grade of one pattern (16: tier
    // 30). It now grades the same sample in the rail midday window: 8 on Saturday, 10 on Sunday
    // (a 9 to 11-minute gap), never past the worst drawn stop's 8.
    const result = await processGtfsBuffer(await fixtureZip('wmata-yellow-weekend'), undefined, { slug: 'wmata' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.directionId === 1 && p.headsign === 'Huntington');
    const sat = rows.find((p: any) => p.day === 'Saturday'); const sun = rows.find((p: any) => p.day === 'Sunday');
    expect([sat.headway, sat.tier]).toEqual([8, '8']);
    expect([sun.headway, sun.tier]).toEqual([8, '10']);
  });
});
