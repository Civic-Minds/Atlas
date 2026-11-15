/**
 * CIV-1485: build-history's reused-number test reads a sidecar route's `desc` (historyNameFromDesc, King County Metro)
 * when its only name is the number. 61 was a Ballard loop in 2013-2014 and is a Lake City route from 2025, on other
 * streets: it splits. 28 keeps its line under a restyled description: it stays whole. The shown name stays the number.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const j = (v: unknown) => JSON.stringify(v);
const lineAt = (x: number) => [[x, 45.5], [x, 45.6]];
const archive: Record<string, string> = {};
const sidecar = (pk: string, routes: Record<string, unknown>) => {
  archive[`history-v2/delta/${pk}.json`] = j({ version: 2, slug: 'delta', periodKey: pk, refDate: pk, routes });
  archive[`history-v2-shapes/delta/${pk}.json`] = j({ version: 1, slug: 'delta', periodKey: pk, refDate: pk, decimals: 5, toleranceM: 15,
    routes: Object.fromEntries(Object.keys(routes).map(k => [k, { c: k === '61' && Number(pk.slice(0, 4)) >= 2025 ? lineAt(-122.3) : k === '61' ? lineAt(-122.6) : lineAt(-122.7) }])) });
};
for (const y of [2013, 2014]) sidecar(`${y}0901`, { '61': { name: '61', desc: 'Ballard - North Beach Loop', rep: { h: 30 } }, '28': { name: '28', desc: 'Broadview', rep: { h: 15 } } });
for (const y of [2025, 2026]) sidecar(`${y}0901`, { '61': { name: '61', desc: 'Lake City - Northgate - Greenwood', rep: { h: 30 } }, '28': { name: '28', desc: 'Whittier Heights - Fremont - Downtown Seattle', rep: { h: 15 } } });
const feature = (routeShortName: string, routeLongName: string, x: number) => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: lineAt(x) },
  properties: { day: 'Weekday', directionId: 0, routeType: 3, routeShortName, routeLongName, headway: 20, routeAllDayHeadway: 20 },
});
const pub: Record<string, string> = {
  'atlas/delta.json': j({ type: 'FeatureCollection', features: [feature('61', '', -122.3), feature('28', '', -122.7)] }),
};
const files: Record<string, string> = {
  'public/data/index.json': j({ agencies: [{ slug: 'delta', name: 'Delta Transit', region: 'Oregon', center: [-122.6, 45.5] }] }),
  'config/history-route-aliases.json': j({}),
  'config/history-route-identity.json': j({ delta: ['61', '28'] }),
  'config/history-period-excludes.json': j({}),
  'config/history-retired-routes.json': j({}),
};
const G = globalThis as unknown as { __cfg?: { config?: string; done?: () => void } };

vi.mock('../r2.js', () => {
  const list = (store: Record<string, string>) => async (prefix: string) => Object.keys(store).filter(k => k.startsWith(prefix)).sort();
  return {
    r2ListArchive: list(archive),
    r2GetArchive: async (k: string) => archive[k] ?? null,
    r2Get: async (k: string) => pub[k] ?? null,
    r2Put: async (k: string, body: string) => { if (k === 'atlas/history-config.json') G.__cfg!.config = body; },
  };
});
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  const readFileSync = ((p: unknown, ...rest: unknown[]) => {
    const hit = Object.entries(files).find(([k]) => String(p).endsWith(k));
    return hit ? hit[1] : (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof actual.readFileSync;
  const writeFileSync = (() => undefined) as unknown as typeof actual.writeFileSync;
  const mkdirSync = (() => undefined) as unknown as typeof actual.mkdirSync;
  return { ...actual, readFileSync, writeFileSync, mkdirSync, default: { ...actual, readFileSync, writeFileSync, mkdirSync } };
});
vi.mock('../../scripts/build-history-agency-list.js', () => ({
  writeHistoryAgencyList: () => { G.__cfg!.done?.(); return 1; },
}));

describe('identity test reads the route description (CIV-1485)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.ATLAS_HISTORY_V2; });

  it('splits 61 into "61 (2013-2014)" and today\'s 61; 28 stays whole; names shown are unchanged', async () => {
    let done!: () => void;
    const finished = new Promise<void>(r => { done = r; });
    G.__cfg = { done };
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await finished;
    const cfg = JSON.parse(G.__cfg.config!) as Array<{ slug: string; routes: Array<{ routeShortName: string; routeName: string; snapshots: Array<{ year: number }> }> }>;
    const routes = cfg.find(a => a.slug === 'delta')!.routes;
    const old = routes.find(r => r.routeShortName === '61 (2013-2014)');
    expect(old?.snapshots.map(s => s.year)).toEqual([2013, 2014]);
    expect(routes.find(r => r.routeShortName === '61')?.snapshots.every(s => s.year >= 2025)).toBe(true);
    const r28 = routes.find(r => r.routeShortName === '28');
    expect(r28?.snapshots.map(s => s.year)).toEqual(expect.arrayContaining([2013, 2014, 2025]));
    expect(routes.some(r => r.routeShortName.startsWith('28 ('))).toBe(false);
    // The description only feeds the test: History still shows the number (CIV-1485 open question).
    expect(r28?.routeName).toBe('28');
  });
});
