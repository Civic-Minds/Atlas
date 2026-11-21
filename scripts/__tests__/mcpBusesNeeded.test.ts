import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(mkdtempSync(join(tmpdir(), 'mcp-buses-')), 'Atlas');
mkdirSync(join(root, 'tmp', 'studio'), { recursive: true });
const before = process.env.ATLAS_ROOT;
process.env.ATLAS_ROOT = root;
const file = (feed: string) => JSON.stringify({ feed, referenceDate: '2026-11-17', periods: { pmPeak: [{ routes: ['01'], scheduled: 9 }] } });
afterAll(() => { if (before == null) delete process.env.ATLAS_ROOT; else process.env.ATLAS_ROOT = before; });

describe('buses_needed files (CIV-1910)', () => {
  it('says only that there are no figures, with no build command or path (#1613)', async () => {
    const { busesNeeded, useStore } = await import('../mcp/atlasData');
    const { diskStore } = await import('../mcp/diskStore');
    useStore(diskStore());
    expect(await busesNeeded('nowhere', '1', 'pmPeak')).toEqual({ cached: false });
  });
  it("reads a file Studio built in the bundle worktree, as schedule_changes does (#1616)", async () => {
    const bundle = join(root, '..', 'Atlas-worktrees', 'bundle', 'tmp', 'studio');
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, 'hamilton-vehicles.json'), file('bundle.zip'));
    writeFileSync(join(bundle, 'hamilton-before-after.json'), '{}');
    const { busesNeeded, useStore } = await import('../mcp/atlasData');
    const { diskStore } = await import('../mcp/diskStore');
    useStore(diskStore());
    const { studioFile } = await import('../mcp/diskStore');
    expect(await busesNeeded('hamilton', '1', 'pmPeak')).toMatchObject({ cached: true, feed: 'bundle.zip', groups: [{ routes: ['01'] }] });
    // "1" finds the file's "01" (#1617); "10" stays its own route.
    expect(await busesNeeded('hamilton', '01', 'pmPeak')).toMatchObject({ groups: [{ routes: ['01'] }] });
    expect(await busesNeeded('hamilton', '10', 'pmPeak')).toMatchObject({ groups: [] });
    expect(studioFile('hamilton-before-after.json')).toBe(join(bundle, 'hamilton-before-after.json'));
    // This checkout's own file wins over the bundle's.
    writeFileSync(join(root, 'tmp', 'studio', 'hamilton-vehicles.json'), file('own.zip'));
    expect(await busesNeeded('hamilton', '1', 'pmPeak')).toMatchObject({ cached: true, feed: 'own.zip' });
  });
});

describe('buses_needed answer fields (#1618)', () => {
  it('names the summed running and layover times for what they are, not a round trip', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(join(import.meta.dirname, '../mcp/tools.ts'), 'utf8');
    expect(src).not.toMatch(/roundTrip(Running|Layover)Minutes/);
    expect(src).toMatch(/runningMinutesAllPatterns/);
  });
});

describe('buses_needed finds a route by its name (#1632)', () => {
  it('resolves "Dufferin" to route 29 in the file, as the other tools do', async () => {
    const { readFileSync } = await import('node:fs');
    const fx = JSON.parse(readFileSync(join(import.meta.dirname, '../../src/utils/__tests__/fixtures/ttc-29-weekday.json'), 'utf8')) as { features: Array<{ properties: Record<string, unknown> }> };
    const features = fx.features.map(f => ({ ...f, geometry: { type: 'LineString', coordinates: [[0, 0], [0, 1]] } }));
    const data = await import('../mcp/atlasData');
    const { memoryStore } = await import('../../shared/mcpMemoryStore');
    const vehicles = ({ feed: 'f.zip', referenceDate: '2026-11-17', periods: { pmPeak: [{ routes: ['29'], scheduled: 9, implied: 9, runningMin: 60, layoverMin: 10, atTarget: { 10: 7 } }] } });
    data.useStore(memoryStore({ catalog: [{ slug: 'fixture', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, meta: { fixture: { shortName: 'FX', parentAgency: null } }, files: { fixture: features as never }, vehicles: { fixture: vehicles as never } }));
    const { handlers } = await import('../mcp/tools');
    const res = await handlers.buses_needed({ agency: 'Fixture Transit', route: 'Dufferin', period: 'PM peak' }) as { groups?: Array<{ routesSharingBuses: string[]; scheduledNow: number }> };
    expect(res.groups?.[0]).toMatchObject({ routesSharingBuses: ['29'], scheduledNow: 9 });
  });
});

describe('buses_needed on the hosted server (CIV-1977)', () => {
  it('rides the split release and answers the same from it', async () => {
    const { splitStore, splitPaths } = await import('../../shared/mcpSplitStore');
    const { memoryStore } = await import('../../shared/mcpMemoryStore');
    const { agencyFiles } = await import('../mcp/splitBuild');
    const data = await import('../mcp/atlasData');
    const agency = { slug: 'fixture', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' };
    const v = { feed: 'f.zip', referenceDate: '20261118', periods: { pmPeak: [{ routes: ['01'], scheduled: 20, implied: 20, runningMin: 193, layoverMin: 40, atTarget: { 10: 12 } }] } };
    const { readFileSync } = await import('node:fs');
    const fx = JSON.parse(readFileSync(join(import.meta.dirname, '../../src/utils/__tests__/fixtures/ttc-29-weekday.json'), 'utf8')) as { features: unknown[] };
    data.useStore(memoryStore({ catalog: [agency] as never, files: { fixture: fx.features as never }, vehicles: { fixture: v as never } }));
    const files = new Map<string, unknown>(await agencyFiles(agency as never));
    expect(files.get(splitPaths.vehicles('fixture'))).toEqual(v);
    data.useStore(splitStore(async path => (files.has(path) ? JSON.parse(JSON.stringify(files.get(path))) : null)));
    expect(await data.busesNeeded('fixture', '1', 'pmPeak')).toMatchObject({ cached: true, olderSchedule: false, groups: [{ routes: ['01'], scheduled: 20 }] });
  });
});
