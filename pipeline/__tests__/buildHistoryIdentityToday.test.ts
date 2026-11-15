/**
 * CIV-1582: the reused-number test also runs between the last archived period and today's map. A listed key whose
 * archived line is a different route from today's keeps today's route under the key; the archived years publish as
 * "<number> (<years>)" (TriMet 10: Harold St until 2022, Steele today).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const j = (v: unknown) => JSON.stringify(v);
const lineAt = (x: number) => [[x, 45.5], [x, 45.6]];
const archive: Record<string, string> = {};
const sidecar = (pk: string, routes: Record<string, unknown>) => {
  archive[`history-v2/delta/${pk}.json`] = j({ version: 2, slug: 'delta', periodKey: pk, refDate: pk, routes });
  archive[`history-v2-shapes/delta/${pk}.json`] = j({ version: 1, slug: 'delta', periodKey: pk, refDate: pk, decimals: 5, toleranceM: 15,
    routes: Object.fromEntries(Object.keys(routes).map(k => [k, { c: k === '10' ? lineAt(-122.6) : lineAt(-122.7) }])) });
};
// 10 is Harold St in every archived year; 20 keeps its name and line. Today 10 is Steele, on other streets.
for (let y = 2013; y <= 2022; y++) sidecar(`${y}0901`, { '10': { name: 'Harold St', rep: { h: 30 } }, '20': { name: 'Twenty', rep: { h: 15 } } });
const feature = (routeShortName: string, routeLongName: string, x: number) => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: lineAt(x) },
  properties: { day: 'Weekday', directionId: 0, routeType: 3, routeShortName, routeLongName, headway: 20, routeAllDayHeadway: 20 },
});
const pub: Record<string, string> = {
  'atlas/delta.json': j({ type: 'FeatureCollection', features: [feature('10', 'Steele', -122.4), feature('20', 'Twenty', -122.7)] }),
};
const files: Record<string, string> = {
  'public/data/index.json': j({ agencies: [{ slug: 'delta', name: 'Delta Transit', region: 'Oregon', center: [-122.6, 45.5] }] }),
  'config/history-route-aliases.json': j({}),
  'config/history-route-identity.json': j({ delta: ['10', '20'] }),
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

describe('identity test across the boundary to today (CIV-1582)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.ATLAS_HISTORY_V2; });

  it('publishes the archived route as "10 (2013-2022)" and keeps 10 for today\'s route; a same route stays whole', async () => {
    let done!: () => void;
    const finished = new Promise<void>(r => { done = r; });
    G.__cfg = { done };
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await finished;
    const cfg = JSON.parse(G.__cfg.config!) as Array<{ slug: string; routes: Array<{ routeShortName: string; snapshots: Array<{ year: number }> }> }>;
    const routes = cfg.find(a => a.slug === 'delta')!.routes;
    const old = routes.find(r => r.routeShortName === '10 (2013-2022)');
    expect(old?.snapshots.map(s => s.year)).toEqual([2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022]);
    expect(routes.find(r => r.routeShortName === '10')?.snapshots.some(s => s.year < 2026) ?? false).toBe(false);
    expect(routes.find(r => r.routeShortName === '20')?.snapshots.length).toBeGreaterThanOrEqual(10);
  });
});
