import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { normalizeRouteFilterFeatures, routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';

async function weekdayRoute(fixture: string, slug: string): Promise<any[]> {
  const zip = new JSZip();
  const dir = resolve(__dirname, 'fixtures', fixture);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const fc = JSON.parse((await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug })).geojson);
  normalizeRouteFilterFeatures(fc.features);
  return fc.features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.day === 'Weekday');
}

describe('#899: the direction-level midday wait reads every trip at its first stop', () => {
  it('TTC 191 to York Mills changes shape at noon and still runs all day (every ~28)', async () => {
    // Real TTC feed (2026-09-30 to 10-31): shape 1122207 runs to 11:25, 1122206 from 11:53. Each
    // drawn pattern alone leaves a 173-215 minute midday wait.
    const route = await weekdayRoute('ttc-191-weekday', 'ttc');
    for (const p of route) expect(p.directionMiddayWait).toBeLessThanOrEqual(30);
    expect(route.every(p => p.worstDirectionMiddayCap === undefined)).toBe(true);
    expect(routePassesHeadwayFilter(route, 'all', 'Weekday', 30)).toBe(true);
  });

  it('SEPTA 98 to Norristown runs all day although its drawn line is a 4-trip pattern', async () => {
    // Real SEPTA feed: shape 315667 runs every ~30 from 06:41 to 21:00; the drawn line reads a
    // 4-trip pattern with no midday values. The route is never failed outright, only held to its
    // real 35-minute midday wait.
    const route = await weekdayRoute('septa-98', 'septa');
    const norristown = route.find(p => p.directionId === 1)!;
    expect(norristown.directionMiddayWait).toBe(35);
    expect(route.every(p => (p.worstDirectionMiddayCap ?? 0) < 999999)).toBe(true);
  });
});
