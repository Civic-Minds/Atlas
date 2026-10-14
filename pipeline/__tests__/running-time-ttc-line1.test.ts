import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

// #852: TTC gives the same full Line 1 run (Finch to Vaughan, 38 stops) a different shape_id per
// time band (1125062 for 6-9h, 1125063 for 9-16h, 1125065 for 16-19h, 1125064 for 19-21h,
// 1125043 for 21-25h on weekdays). Running time picked one shape, so only 9-16h had a value.
describe('running time for TTC Line 1 (#852)', () => {
  it('covers the whole weekday service in both directions, about 75 minutes end to end', async () => {
    // Real TTC feed (2026-10-31), route 1 Wednesday, shapes thinned 10x.
    const result = await processGtfsBuffer(await fixtureZip('ttc-line1-weekday'), undefined, { slug: 'ttc' });
    const rt = JSON.parse(result.geojson).runningTimes as Record<string, { h: Record<string, number>; p: Record<string, number[]> }>;
    for (const dir of ['0', '1']) {
      const entry = rt[`1::${dir}::Weekday`];
      expect(entry).toBeDefined();
      const hours = Object.keys(entry.h).map(Number).sort((a, b) => a - b);
      expect(hours[0]).toBe(5);
      expect(hours[hours.length - 1]).toBeGreaterThanOrEqual(24);
      expect(entry.h['7']).toBeGreaterThanOrEqual(73);
      expect(entry.h['7']).toBeLessThanOrEqual(77);
      expect(Object.keys(entry.p).sort()).toEqual(['amPeak', 'evening', 'late', 'midday', 'pmPeak']);
    }
  });
});
