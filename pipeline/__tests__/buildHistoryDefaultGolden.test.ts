/**
 * History v2 must be opt-in. With ATLAS_HISTORY_V2 unset (the weekly refresh-feeds cron), the
 * build must write exactly the bytes origin/main's build wrote.
 *
 * The golden (historyBuild/main-golden.json) was made by running origin/main's own
 * pipeline/build-history.ts (commit c7d4c2a5) on this same synthetic fixture with this same
 * harness, via GENERATE_HISTORY_GOLDEN=<path>. Regenerate only from origin/main's code, never
 * from this branch:
 *   git worktree add --detach <dir> origin/main; copy this test + pipeline/__tests__/historyBuild/
 *   into it; GENERATE_HISTORY_GOLDEN=<out.json> npx vitest run pipeline/__tests__/buildHistoryDefaultGolden.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';

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

const GOLDEN = resolve(__dirname, 'historyBuild/main-golden.json');

async function runBuild(v2: '1' | undefined) {
  vi.resetModules();
  const cap = resetCapture();
  if (v2) process.env.ATLAS_HISTORY_V2 = v2; else delete process.env.ATLAS_HISTORY_V2;
  process.env.R2_ACCESS_KEY_ID = 'test';
  await import('../build-history.js');
  await cap.done;
  return cap;
}

describe('build-history default (ATLAS_HISTORY_V2 unset) is byte-identical to origin/main', () => {
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

  const generate = process.env.GENERATE_HISTORY_GOLDEN;
  (generate ? it : it.skip)('generates the golden (run against origin/main only)', async () => {
    const cap = await runBuild(undefined);
    // fs is mocked above (it captures writes); write the golden with the real one.
    const real = await vi.importActual<typeof import('node:fs')>('node:fs');
    real.writeFileSync(generate!, `${JSON.stringify({ historyConfig: cap.historyConfig, agencyList: cap.agencyList }, null, 1)}\n`);
  }, 30_000);

  (generate ? it.skip : it)('matches origin/main byte for byte on the multi-agency fixture', async () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { historyConfig: string; agencyList: unknown };
    const cap = await runBuild(undefined);
    expect(cap.historyConfig).toBe(golden.historyConfig);
    expect(cap.agencyList).toEqual(golden.agencyList);
    // The default build writes no v2 report and passes no v2 eligibility option.
    expect(Object.keys(cap.files)).toEqual([]);
    expect(cap.agencyListOptions).toEqual({ realYearsOnly: false });
  }, 30_000);

  (generate ? it.skip : it)('the fixture exercises the cases the gate protects', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { historyConfig: string; agencyList: { slugs: string[] } };
    const rows = JSON.parse(golden.historyConfig) as Array<{ slug: string; routes: Array<{ routeShortName: string; snapshots: Array<{ label: string; year: number; weekdayHeadwayMin: number }> }> }>;
    const alpha = rows.find(r => r.slug === 'alpha')!;
    const r10 = alpha.routes.find(r => r.routeShortName === '10')!;
    const years = r10.snapshots.map(s => s.year);
    expect(new Set(years).size).toBeLessThan(years.length); // duplicate years survive on main
    expect(r10.snapshots.some(s => s.year === 2030)).toBe(true); // future label survives
    expect(r10.snapshots.some(s => s.label === '')).toBe(true); // empty label survives
    expect(alpha.routes.some(r => r.routeShortName === 'R7')).toBe(true);
    expect(alpha.routes.find(r => r.routeShortName === '20')).toBeDefined(); // limited route gets a current endpoint on main
    expect(golden.agencyList.slugs).toContain('beta'); // eligible through coverage years on main
  });

  (generate ? it.skip : it)('with the flag set the same fixture builds differently (the gate is real)', async () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { historyConfig: string };
    const cap = await runBuild('1');
    expect(cap.historyConfig).not.toBe(golden.historyConfig);
    expect(cap.agencyListOptions).toEqual({ realYearsOnly: true });
  }, 30_000);
});
