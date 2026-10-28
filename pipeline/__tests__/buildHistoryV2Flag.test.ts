/**
 * With ATLAS_HISTORY_V2=1 the build runs every v2 rule on the same synthetic fixture the
 * default-golden test uses. (Default behaviour is covered by buildHistoryDefaultGolden.test.ts.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';
import { parseHistoryShapes, shapeForYear } from '../../shared/historyV2Reader.js';

vi.mock('../r2.js', async () => (await import('./historyBuild/harness.js')).r2Mocks());
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


async function runBuild() {
  vi.resetModules();
  const cap = resetCapture();
  process.env.ATLAS_HISTORY_V2 = '1';
  process.env.R2_ACCESS_KEY_ID = 'test';
  await import('../build-history.js');
  await cap.done;
  return cap;
}

type Row = { slug: string; routes: Array<{ routeShortName: string; routeName: string; snapshots: Array<{ label: string; year: number; weekdayHeadwayMin: number }> }> };

describe('build-history with ATLAS_HISTORY_V2=1', () => {
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

  it('applies the v2 rules', async () => {
    const cap = await runBuild();
    const rows = JSON.parse(cap.historyConfig!) as Row[];
    const alpha = rows.find(r => r.slug === 'alpha')!;
    const route = (k: string) => alpha.routes.find(r => r.routeShortName === k)!;
    const pairs = (k: string) => route(k).snapshots.map(s => [s.year, s.weekdayHeadwayMin]);

    // One snapshot per year, no future, blank-label or unparseable snapshot.
    const r10 = route('10').snapshots;
    expect(new Set(r10.map(s => s.year)).size).toBe(r10.length);
    expect(r10.some(s => s.year > 2026 || s.label === '')).toBe(false);
    // Sidecar join: the all-day value replaces the old fastest-pattern value for the same period.
    expect(pairs('10')).toEqual([[2015, 40], [2018, 30], [2019, 22], [2024, 18], [2026, 20]]); // 10X folded in by alias
    expect(route('10').routeName).toBe('Main Street');
    // Current endpoint is the representative all-day value (20), not the fastest pattern (8).
    expect(r10[r10.length - 1].weekdayHeadwayMin).toBe(20);
    // A file keyed by an end date after this year is dated by when it was read (CIV-394): route 40's current
    // timetable (read May 2026, ends Dec 2030) is 2026's point, not dropped as a future year.
    expect(route('40').snapshots.map(s => [s.year, s.label, s.weekdayHeadwayMin])).toEqual([[2018, 'Sep 2018', 30], [2026, 'May 2026', 10]]);
    // A limited route gets no current endpoint.
    expect(pairs('20')).toEqual([[2018, 30], [2023, 60]]);
    // Long-name and route_id keys are kept.
    expect(alpha.routes.map(r => r.routeShortName)).toEqual(expect.arrayContaining(['R7', 'Lake Line']));
    // Eligibility counts real snapshot years only: beta's coverage years no longer qualify it.
    expect(cap.agencyListOptions).toEqual({ realYearsOnly: true });
    expect((cap.agencyList as { slugs: string[] }).slugs).toEqual([]);
    // The build report is written only in v2.
    expect(Object.keys(cap.files)).toEqual([expect.stringContaining('history-build-report.json')]);
  }, 30_000);

  it('publishes the deduped per-agency shapes file, joined by the kept snapshot period, and leaves history-config alone', async () => {
    const cap = await runBuild();
    expect(Object.keys(cap.puts!).sort()).toEqual(['atlas/history-config.json', 'atlas/history-v2-shapes/alpha.json']);
    const file = JSON.parse(cap.puts!['atlas/history-v2-shapes/alpha.json']) as import('../../shared/historyV2.js').HistoryShapesFile;
    const parsed = parseHistoryShapes(file);
    expect(parsed.ok).toBe(true);
    // 2015 comes from the aliased old key 10X; 2019 and 2024 share one stored line; 2018 has no shape file: none.
    expect(file.shapes).toHaveLength(3);
    expect(file.years['2019']['10']).toBe(file.years['2024']['10']);
    expect(file.years['2015']['10']).not.toBe(file.years['2019']['10']);
    expect(shapeForYear(file, '10', 2018)).toEqual({ kind: 'none' });
    expect(shapeForYear(file, 'R7', 2019).kind).toBe('shape');
    expect(shapeForYear(file, 'R7', 2024)).toEqual({ kind: 'none' });
    // Snapshots in history-config.json carry no shape fields.
    expect(cap.historyConfig).not.toContain('toleranceM');
  }, 30_000);
});
