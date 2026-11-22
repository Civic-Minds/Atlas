/**
 * CIV-1840: the same agency read through the disk store and the in-memory store must give equal tool results, so a
 * hosted store (R2) can be swapped in without the answers changing.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PERIOD_KEYS } from '../../shared/config';
import { memoryStore, type MemoryData } from '../../shared/mcpMemoryStore';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';
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
    stopChoices: await data.stopFrequency(a, 'Dufferin', 'Weekday'),
    stop: await data.stopFrequency(a, 'Dufferin Station', 'Weekday'),
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
    // CIV-2060: a place matching two stop names asks which; one name gives the stop card's routes.
    expect(fromDisk.stopChoices.matched).toBeNull();
    expect(fromDisk.stopChoices.choices).toEqual(expect.arrayContaining(['Dufferin Station', 'Dufferin St at Bloor St']));
    expect(fromDisk.stop.matched).toBe('Dufferin Station');

    // CIV-2014: the local server's cloud-first store. An agency in the release reads the release; one only on this Mac
    // (dry-run output) reads its route file, the tools making its summaries from the rows. Same answers either way.
    const { cloudFirstStore } = await import('./cloudStore');
    const mac = (files: MemoryData['files'], extra: Partial<MemoryData> = {}) => memoryStore({ catalog: [AGENCY], meta: {}, files, ...extra });
    const release = (agencies: string[], extra: Record<string, unknown> = {}) => {
      const f = new Map(files);
      f.set(splitPaths.manifest, { releaseId: 'test', builtAt: '', agencies });
      for (const [k, v] of Object.entries(extra)) f.set(k, v);
      return splitStore(async path => (f.has(path) ? JSON.parse(JSON.stringify(f.get(path))) : null));
    };
    data.useStore(cloudFirstStore(release(['fixture']), mac({})));
    expect(await results(data)).toEqual(fromDisk);
    data.useStore(cloudFirstStore(release([]), mac({ fixture: JSON.parse(JSON.stringify(features)) })));
    expect(await results(data)).toEqual(fromDisk);
    // Studio's own files on this Mac come first (what Studio shows), then the release's.
    const onMac = { agency: 'mac' } as unknown as StudioBeforeAfterFile, published = { agency: 'release' } as unknown as StudioBeforeAfterFile;
    const both = cloudFirstStore(release(['fixture'], { [splitPaths.comparison('fixture')]: published }), mac({}, { comparisons: { fixture: onMac } }));
    expect(await both.comparison('fixture')).toEqual(onMac);
    const cloudOnly = cloudFirstStore(release(['fixture'], { [splitPaths.comparison('fixture')]: published }), mac({}));
    expect(await cloudOnly.comparison('fixture')).toEqual(published);
  });
});

describe('the older-copy note (CIV-2014)', () => {
  it('names both releases in Ryan\'s words when the copy on this Mac is older, and is absent when it is the latest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-mcp-note-'));
    mkdirSync(join(root, 'shared/data'), { recursive: true });
    mkdirSync(join(root, 'tmp/agency-pages-cache/release-old'), { recursive: true });
    process.env.ATLAS_ROOT = root;
    delete process.env.ATLAS_MCP_DATA_DIR;
    vi.resetModules();
    const { staleCacheNote } = await import('./diskStore');
    writeFileSync(join(root, 'shared/data/agency-pages.json'), JSON.stringify({ releaseId: 'release-new', generatedAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(staleCacheNote()).toBe("These figures come from an older copy of Atlas's data (release-old) than the latest release (release-new) and may not match the map.");
    writeFileSync(join(root, 'shared/data/agency-pages.json'), JSON.stringify({ releaseId: 'release-old', generatedAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(staleCacheNote()).toBeNull();
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

describe('routes_at_frequency counts as the map filter does (CIV-2014, #1643)', () => {
  // Route 29 as recorded, and a copy (929) whose last midday wait breaks the 20 and 30 grades (CIV-238 bits 4 + 8).
  const broken = lineFeatures.map(f => ({ ...f, properties: { ...f.properties, routeId: '929', routeShortName: '929', routeEdgeWaitFailByPeriod: { midday: 12 } } }));
  const files = { fixture: JSON.parse(JSON.stringify([...lineFeatures, ...broken, ...stopFeatures])) };

  it('lists exactly the routes routePassesHeadwayFilter passes, for every period and threshold', async () => {
    const data = await import('./atlasData');
    const { routePassesHeadwayFilter } = await import('../../shared/routeHeadwayFilter');
    data.useStore(memoryStore({ catalog: [AGENCY], meta: { fixture: { shortName: 'FX', parentAgency: null } }, files }));
    const a = (await data.findAgency('FX'))!;
    const routes = await data.routesOn(a, 'Weekday');
    expect(routes.map(r => r.name).sort()).toEqual(['29', '929']);
    for (const period of PERIOD_KEYS) {
      for (const every of [5, 10, 12, 15, 17, 20, 25, 30, 45, 60]) {
        const map = routes.filter(r => routePassesHeadwayFilter(r.rows, period, undefined, every)).map(r => r.name).sort();
        const mcp = (await data.routesMeeting(a, 'Weekday', period, every)).meeting.map(m => m.route).sort();
        expect(mcp, `${period} every ${every}`).toEqual(map);
      }
    }
    // The broken copy keeps its number but is left out where its last wait breaks the grade, as the map hides it.
    expect((await data.routesMeeting(a, 'Weekday', 'midday', 20)).meeting.map(m => m.route)).toEqual(['29']);
    expect((await data.routesMeeting(a, 'Weekday', 'midday', 60)).meeting.map(m => m.route).sort()).toEqual(['29', '929']);
  });

  it('ranking reads the same decision from its wait files', async () => {
    const data = await import('./atlasData');
    data.useStore(memoryStore({ catalog: [AGENCY], meta: { fixture: { shortName: 'FX', parentAgency: null } }, files }));
    const a = (await data.findAgency('FX'))!;
    const summaries = await data.routeList(a, 'Weekday');
    const index = summaries.map(r => {
      const breaks = Object.fromEntries(PERIOD_KEYS.flatMap(k => r.figures[k].filter!.breaks ? [[k, r.figures[k].filter!.breaks]] : []));
      return { route: r.name, name: r.longName, wait: Object.fromEntries(PERIOD_KEYS.map(k => [k, r.figures[k].filter!.wait])), ...(Object.keys(breaks).length ? { breaks } : {}) };
    });
    const waits = data.waitsOf(index);
    const midday = PERIOD_KEYS.indexOf('midday');
    for (const every of [10, 15, 17, 20, 30, 60]) {
      const ranked = summaries.filter((_, i) => data.rankWaitPasses(waits[i][midday], every)).map(r => r.name);
      expect(ranked, `every ${every}`).toEqual(summaries.filter(r => data.figurePasses(r.figures.midday, every)).map(r => r.name));
    }
    // A wait file written before the readings (plain numbers) still counts by its number.
    expect(data.rankWaitPasses(16, 20)).toBe(true);
    expect(data.rankWaitPasses([16, 12], 20)).toBe(false);
  });
});
