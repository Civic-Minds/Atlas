/**
 * CIV-1275: an agency artifact that records a direction-split merge (#1285: BART "Yellow-N" and
 * "Yellow-S" became "Yellow") folds the halves' old keys into the merged key with no entry in
 * config/history-route-aliases.json. Runs the v2 build on the shared synthetic fixture plus one
 * extra agency, "delta", whose artifact carries `directionSplits`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';

vi.mock('../r2.js', async () => {
  const { historyBuildFixture } = await import('./historyBuild/fixture.js');
  const { capture } = await import('./historyBuild/harness.js');
  const fx = historyBuildFixture();
  const j = (v: unknown) => JSON.stringify(v);
  const line = { type: 'LineString', coordinates: [[-122, 37], [-122, 37.1]] };
  fx.pub['atlas/delta.json'] = j({
    type: 'FeatureCollection',
    directionSplits: [{ base: 'Yellow', halves: ['Yellow-N', 'Yellow-S'] }],
    features: [
      { type: 'Feature', geometry: line, properties: { day: 'Weekday', directionId: 0, routeType: 1, routeShortName: 'Yellow', routeLongName: 'Antioch ↔ SFO', headway: 10, routeAllDayHeadway: 10 } },
      { type: 'Feature', geometry: line, properties: { day: 'Weekday', directionId: 1, routeType: 1, routeShortName: 'Yellow', routeLongName: 'Antioch ↔ SFO', headway: 12, routeAllDayHeadway: 10 } },
    ],
  });
  // Old change files under the halves' keys: the worse of the two directions is the period's value.
  fx.archive['history/delta/Yellow-N/20190901.json'] = j({ headway: 15, routeLongName: 'SFO to Antioch' });
  fx.archive['history/delta/Yellow-S/20190901.json'] = j({ headway: 20, routeLongName: 'Antioch to SFO' });
  fx.archive['history/delta/Yellow-N/20230901.json'] = j({ headway: 12, routeLongName: 'SFO to Antioch' });
  fx.archive['history/delta/Yellow-S/20230901.json'] = j({ headway: 14, routeLongName: 'Antioch to SFO' });
  // #1431: trip time files are under the halves' keys too. The longer direction each period: 73 (S), then 72 (N).
  const north = ['a', 'b', 'c'];
  const south = ['c', 'b', 'a'];
  fx.archive['trip-duration/delta/Yellow-N/20190901.json'] = j({ durationMinutes: 70, refDate: '20190915', stopSequence: north });
  fx.archive['trip-duration/delta/Yellow-S/20190901.json'] = j({ durationMinutes: 73, refDate: '20190915', stopSequence: south });
  fx.archive['trip-duration/delta/Yellow-N/20230901.json'] = j({ durationMinutes: 72, refDate: '20230915', stopSequence: north });
  fx.archive['trip-duration/delta/Yellow-S/20230901.json'] = j({ durationMinutes: 71, refDate: '20230915', stopSequence: south });
  (fx.index as { agencies: unknown[] }).agencies.push({ slug: 'delta', name: 'Delta Rail', region: 'California', center: [-122, 37] });
  const list = (store: Record<string, string>) => async (prefix: string) => Object.keys(store).filter(k => k.startsWith(prefix)).sort();
  (globalThis as unknown as { __deltaFixture?: unknown }).__deltaFixture = fx;
  return {
    r2ListArchive: list(fx.archive),
    r2GetArchive: async (key: string) => fx.archive[key] ?? null,
    r2Get: async (key: string) => fx.pub[key] ?? null,
    r2Put: async (key: string, body: string) => {
      capture().puts![key] = body;
      if (key === 'atlas/history-config.json') capture().historyConfig = body;
    },
  };
});
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  const { capture } = await import('./historyBuild/harness.js');
  const readFileSync = ((p: unknown, ...rest: unknown[]) => {
    const fx = (globalThis as unknown as { __deltaFixture?: { index: unknown; aliases: unknown } }).__deltaFixture;
    const path = String(p);
    if (fx && path.endsWith('public/data/index.json')) return JSON.stringify(fx.index);
    // No alias config at all: everything delta folds comes from its artifact.
    if (fx && path.endsWith('config/history-route-aliases.json')) return JSON.stringify(fx.aliases);
    return (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof actual.readFileSync;
  const writeFileSync = ((p: unknown, content: unknown) => { capture().files[String(p)] = String(content); }) as typeof actual.writeFileSync;
  const mkdirSync = (() => undefined) as unknown as typeof actual.mkdirSync;
  return { ...actual, readFileSync, writeFileSync, mkdirSync, default: { ...actual, readFileSync, writeFileSync, mkdirSync } };
});
vi.mock('../../scripts/build-history-agency-list.js', async () => {
  const { buildHistoryAgencyList } = await import('../../shared/historyEligibility.js');
  const { capture } = await import('./historyBuild/harness.js');
  return {
    writeHistoryAgencyList: (rows: unknown, options?: unknown) => {
      const c = capture();
      c.agencyListRows = rows;
      c.agencyListOptions = options;
      c.agencyList = (buildHistoryAgencyList as (r: unknown, o?: unknown) => unknown)(rows, options);
      c.resolveDone?.();
      return ((c.agencyList as { slugs: string[] }).slugs).length;
    },
  };
});

type Row = { slug: string; routes: Array<{ routeShortName: string; tripDuration?: unknown; snapshots: Array<{ year: number; weekdayHeadwayMin: number }> }> };

describe('History aliases generated from the artifact (CIV-1275)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.ATLAS_HISTORY_V2;
  });

  it('folds Yellow-N and Yellow-S into Yellow from the artifact, with no config entry', async () => {
    vi.resetModules();
    const cap = resetCapture();
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await cap.done;
    const rows = JSON.parse(cap.historyConfig!) as Row[];
    const delta = rows.find(r => r.slug === 'delta')!;
    expect(delta.routes.map(r => r.routeShortName)).toEqual(['Yellow']);
    const pairs = delta.routes[0].snapshots.map(s => [s.year, s.weekdayHeadwayMin]);
    // The worse direction each period, then today's value.
    expect(pairs).toEqual([[2019, 20], [2023, 14], [2026, 10]]);
    // #1431: the merged line keeps its trip time, the longer direction each period.
    expect(delta.routes[0].tripDuration).toEqual({ firstLabel: 'Sep 2019', firstMinutes: 73, lastLabel: 'Sep 2023', lastMinutes: 72 });
    // The shared fixture's own agencies are untouched by the new rule.
    expect(rows.find(r => r.slug === 'alpha')!.routes.map(r => r.routeShortName)).toEqual(expect.arrayContaining(['10', '20', '40']));
  });
});
