/**
 * With ATLAS_HISTORY_V2=1 the build leaves out a sidecar period whose reference date is a
 * holiday-week date (and the same period's change file), and lists it in the build report.
 * A sidecar with no refDateQuality, or holiday:false, is kept. (Default behaviour is covered by
 * buildHistoryDefaultGolden.test.ts: the sidecars below are ignored without the flag.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';

vi.mock('../r2.js', async () => {
  const base = (await import('./historyBuild/harness.js')).r2Mocks();
  const j = JSON.stringify;
  const extra: Record<string, string> = {
    // holiday reference date (Jan 5 2023) for period 20221101: dropped, with its change file
    'history-v2/alpha/20221101.json': j({ version: 2, slug: 'alpha', periodKey: '20221101', refDate: '20230105', routes: { '10': { rep: { h: 50 } } },
      refDateQuality: { holiday: true, reason: 'test holiday', tripsOnRef: 60, medianTrips: 100 } }),
    'history/alpha/10/20221101.json': j({ headway: 45 }),
    // normal period with a quality field saying not holiday: kept
    'history-v2/alpha/20210901.json': j({ version: 2, slug: 'alpha', periodKey: '20210901', refDate: '20210915', routes: { '10': { rep: { h: 35 } } },
      refDateQuality: { holiday: false, reason: 'ok', tripsOnRef: 100, medianTrips: 100 } }),
  };
  return {
    ...base,
    r2ListArchive: async (prefix: string) => [...await base.r2ListArchive(prefix), ...Object.keys(extra).filter(k => k.startsWith(prefix))].sort(),
    r2GetArchive: async (key: string) => extra[key] ?? base.r2GetArchive(key),
  };
});
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  const { fakeRead, capture } = await import('./historyBuild/harness.js');
  const readFileSync = ((p: unknown, ...rest: unknown[]) => fakeRead(String(p)) ?? (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest)) as typeof actual.readFileSync;
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

type Row = { slug: string; routes: Array<{ routeShortName: string; snapshots: Array<{ year: number; weekdayHeadwayMin: number }> }> };

describe('build-history drops holiday-reference sidecar periods (ATLAS_HISTORY_V2=1)', () => {
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

  it('leaves the holiday period out, keeps the other, and reports it', async () => {
    vi.resetModules();
    const cap = resetCapture();
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await cap.done;
    const alpha = (JSON.parse(cap.historyConfig!) as Row[]).find(r => r.slug === 'alpha')!;
    const pairs = (k: string) => alpha.routes.find(r => r.routeShortName === k)!.snapshots.map(s => [s.year, s.weekdayHeadwayMin]);
    // No 2023 point (the holiday period, sidecar 50 and change file 45); the quality-ok 2021 point is kept.
    expect(pairs('10')).toEqual([[2015, 40], [2018, 30], [2019, 22], [2021, 35], [2024, 18], [2026, 20]]);
    const report = JSON.parse(Object.entries(cap.files).find(([k]) => k.includes('history-build-report.json'))![1]);
    expect(report.droppedHolidayPeriods).toEqual([{ slug: 'alpha', periodKey: '20221101', refDate: '20230105', reason: 'test holiday', routesAffected: 1 }]);
  }, 30_000);
});
