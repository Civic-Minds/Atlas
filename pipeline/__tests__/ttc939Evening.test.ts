import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { normalizeRouteFilterFeatures } from '../../shared/routeHeadwayFilter';
import { routeListCellText, routeListDisplay } from '../../src/utils/effectiveHeadway';

// #1800 (CIV-2905): TTC 939 Finch Express, weekday evening, read every 63 (list: "every 189 min") though every branch
// runs every 13-18 min that evening. The 63 and 189 were branches' waits to the period's edge (a pattern that starts
// at 10:09 PM; a short turn); #1749's rule (8047bdf) leaves such waits out of the route's value. Fixture: the TTC feed
// of 2026-11-21, route 939's trips running Wednesday 2026-11-18, shapes thinned.
async function ttc939(): Promise<GeoJSON.Feature[]> {
  const zip = new JSZip();
  const dir = resolve(__dirname, 'fixtures', 'ttc-939-weekday');
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'ttc' });
  const features = (JSON.parse(result.geojson) as GeoJSON.FeatureCollection).features
    .filter(f => f.geometry.type === 'LineString' && (f.properties as any).day === 'Weekday');
  normalizeRouteFilterFeatures(features as any);
  return features;
}

describe('TTC 939 weekday evening (#1800)', () => {
  it('reads every 18, not a branch edge wait, in the filter and the route list', async () => {
    const rows = (await ttc939()).map(f => f.properties as any);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.routeFilterHeadwayByPeriod?.evening).toBe(18);
    const cell = routeListCellText(routeListDisplay(rows, 'evening'), false);
    expect(cell).toBe('every 9–18 min');
    expect(cell).not.toMatch(/189|63/);
  }, 60_000);
});
