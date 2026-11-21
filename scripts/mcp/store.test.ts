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
import { splitPaths, splitStore } from '../../shared/mcpSplitStore';

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
  const rows = await data.routeList(a, 'Weekday');
  const r = await data.routeWithRows(a, 'Weekday', data.findRoute(rows, '29')!);
  return {
    agency: a.name,
    available: (await data.availableAgencies()).map(x => x.slug),
    routes: rows.map(x => x.name),
    periods: PERIOD_KEYS.map(k => data.periodFigure(r, k)),
    service: data.serviceSpan(r),
    branches: await data.branchesOf(a, 'Weekday', r),
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
    const { diskStore } = await import('./diskStore');
    data.useStore(diskStore());
    const fromDisk = await results(data);
    data.useStore(memoryStore({ catalog: [AGENCY], meta: { fixture: { shortName: 'FX', parentAgency: null } }, files: { fixture: JSON.parse(JSON.stringify(features)) } }));
    const fromMemory = await results(data);
    expect(fromMemory).toEqual(fromDisk);
    // The split release: files made from the same data, read back through the split store.
    const { agencyFiles } = await import('./splitBuild');
    const files = new Map<string, unknown>(await agencyFiles(AGENCY));
    files.set(splitPaths.manifest, { releaseId: 'test', builtAt: '', agencies: ['fixture'] });
    files.set(splitPaths.catalog, [AGENCY]);
    files.set(splitPaths.meta, { fixture: { shortName: 'FX', parentAgency: null } });
    data.useStore(splitStore(async path => (files.has(path) ? JSON.parse(JSON.stringify(files.get(path))) : null)));
    expect(await results(data)).toEqual(fromDisk);
    expect(fromDisk.routes).toEqual(['29']);
    expect(fromDisk.near.routes.length).toBeGreaterThan(0);
  });
});

describe('the pure tool code (CIV-1840)', () => {
  it('imports no file, process or pipeline module, so a Worker can import it', () => {
    const src = readFileSync(join(import.meta.dirname, 'atlasData.ts'), 'utf8');
    const imports = [...src.matchAll(/^(?:import|export)[^'\n]*from '([^']+)'/gm)].map(m => m[1]);
    expect(imports.filter(i => i.startsWith('node:') || /pipeline\/|diskStore|localData/.test(i))).toEqual([]);
  });
});

describe('a parent agency is one entry in the tools (CIV-1963)', () => {
  it('finds MTA New York by name and counts a route in two of its feeds once', async () => {
    const data = await import('./atlasData');
    const feed = (slug: string) => ({ ...AGENCY, slug, name: slug.toUpperCase(), parentAgency: 'mta-new-york' });
    const copy = () => JSON.parse(JSON.stringify(features));
    data.useStore(memoryStore({
      catalog: [feed('nyct-bus-manhattan'), feed('mta-bus-company'), AGENCY],
      meta: { 'nyct-bus-manhattan': { shortName: '', parentAgency: 'MTA New York' }, 'mta-bus-company': { shortName: '', parentAgency: 'MTA New York' }, fixture: { shortName: 'FX', parentAgency: null } },
      files: { 'nyct-bus-manhattan': copy(), 'mta-bus-company': copy(), fixture: copy() },
    }));
    const entry = (await data.findAgencyEntry('MTA New York'))!;
    expect([entry.name, entry.members.map(m => m.slug)]).toEqual(['MTA New York', ['nyct-bus-manhattan', 'mta-bus-company']]);
    const one = await data.routesMeeting((await data.findAgency('FX'))!, 'Weekday', 'midday', 20);
    expect(await data.entryRoutesMeeting(entry, 'Weekday', 'midday', 20)).toEqual(one);
    expect((await data.agenciesNear('Toronto', 60))!.agencies.map(a => a.name)).toEqual(['MTA New York', 'Fixture Transit']);
    // list_agencies: one row for the parent; include_parts also lists its feeds (#1625).
    const { handlers } = await import('./tools');
    const plain = await handlers.list_agencies({ query: 'MTA' }) as { agencies: string[]; parts?: unknown };
    expect([plain.agencies.length, plain.agencies[0].startsWith('MTA New York |'), plain.parts]).toEqual([1, true, undefined]);
    const withParts = await handlers.list_agencies({ query: 'MTA', include_parts: true }) as { parts: Record<string, string[]> };
    expect(withParts.parts['MTA New York'].map(p => p.split(' | ')[0])).toEqual(['NYCT-BUS-MANHATTAN', 'MTA-BUS-COMPANY']);
  });
});
