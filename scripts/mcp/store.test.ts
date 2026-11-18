/**
 * CIV-1840: the same agency read through the disk store and the in-memory store must give equal tool results, so a
 * hosted store (R2) can be swapped in without the answers changing.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERIOD_KEYS } from '../../shared/config';
import { memoryStore } from '../../shared/mcpMemoryStore';

const FIXTURE = JSON.parse(readFileSync(join(import.meta.dirname, '../../src/utils/__tests__/fixtures/ttc-29-weekday.json'), 'utf8')) as { features: Array<{ geometry: unknown; properties: Record<string, unknown> }> };
const lineFeatures = FIXTURE.features.map(f => ({ ...f, geometry: { type: 'LineString', coordinates: [[0, 0], [0, 1]] } }));
const stopFeatures = [
  { geometry: { type: 'Point', coordinates: [-79.4, 43.7] }, properties: { stopId: 's1', stopName: 'Dufferin Station', routeIds: ['29'] } },
  { geometry: { type: 'Point', coordinates: [-79.401, 43.701] }, properties: { stopId: 's2', stopName: 'Dufferin St at Bloor St', routeIds: ['29'] } },
];
const features = [...lineFeatures, ...stopFeatures];
const AGENCY = { slug: 'fixture', name: 'Fixture Transit', region: 'Ontario', cities: ['Toronto'], lastFeedExpiry: '20271231', center: [43.7, -79.4] as [number, number] };

async function results(data: typeof import('./atlasData')) {
  const a = (await data.findAgency('FX'))!;
  const rows = await data.routesOn(a, 'Weekday');
  const r = data.findRoute(rows, '29')!;
  return {
    agency: a.name,
    available: (await data.availableAgencies()).map(x => x.slug),
    routes: rows.map(x => x.name),
    periods: PERIOD_KEYS.map(k => data.periodFigure(r, k)),
    service: data.serviceSpan(r),
    branches: await data.branchesOf(a, r),
    meeting: await data.routesMeeting(a, 'Weekday', 'midday', 20),
    byHours: await data.routesByHours(a, 'Weekday', 1320, null),
    near: await data.routesNear(a, 'Dufferin'),
    agenciesNear: await data.agenciesNear('Toronto', 60),
  };
}

describe('Atlas Studio MCP stores (CIV-1840)', () => {
  it('give the same tool results from the disk store and the memory store', async () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-mcp-'));
    mkdirSync(join(root, 'public/data'), { recursive: true });
    mkdirSync(join(root, 'config/agencies'), { recursive: true });
    mkdirSync(join(root, 'tmp/process-preview/fixture'), { recursive: true });
    writeFileSync(join(root, 'public/data/catalog-public.json'), JSON.stringify({ agencies: [AGENCY] }));
    writeFileSync(join(root, 'config/agencies/fixture.json'), JSON.stringify({ shortName: 'FX' }));
    writeFileSync(join(root, 'tmp/process-preview/fixture/fixture.json'), JSON.stringify({ type: 'FeatureCollection', features }));
    process.env.ATLAS_ROOT = root;
    process.env.ATLAS_MCP_DATA_DIR = join(root, 'nowhere');
    const data = await import('./atlasData');
    const fromDisk = await results(data);
    data.useStore(memoryStore({ catalog: [AGENCY], meta: { fixture: { shortName: 'FX', parentAgency: null } }, files: { fixture: JSON.parse(JSON.stringify(features)) } }));
    const fromMemory = await results(data);
    expect(fromMemory).toEqual(fromDisk);
    expect(fromDisk.routes).toEqual(['29']);
    expect(fromDisk.near.routes.length).toBeGreaterThan(0);
  });
});
