/**
 * With ATLAS_HISTORY_V2=1 a trip-duration period is labelled by when its feed ran, never by its
 * end-date key (CIV-1124: BART "Jan 2027"): the file's own refDate, else the same period's v2
 * sidecar. A period with neither, or dated after the build month, is left out.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';

vi.mock('../r2.js', async () => {
  const base = (await import('./historyBuild/harness.js')).r2Mocks();
  const j = JSON.stringify;
  const seq = ['a', 'b', 'c'];
  const extra: Record<string, string> = {
    // no in-service date anywhere: left out (it would be the first point)
    'trip-duration/alpha/10/20230101.json': j({ durationMinutes: 40, stopSequence: seq }),
    // dated by its sidecar: Mar 2025, not Nov 2025
    'history-v2/alpha/20251130.json': j({ version: 2, slug: 'alpha', periodKey: '20251130', refDate: '20250315', routes: { '10': { rep: { h: 18 } } } }),
    'trip-duration/alpha/10/20251130.json': j({ durationMinutes: 25, stopSequence: seq }),
    // dated by its own refDate: Jan 2026, not Jan 2027
    'trip-duration/alpha/10/20270131.json': j({ durationMinutes: 24, refDate: '20260110', stopSequence: seq }),
    // in service only from Aug 2026, after the Jun 2026 build: left out (it would be the last point)
    'trip-duration/alpha/10/20270630.json': j({ durationMinutes: 20, refDate: '20260801', stopSequence: seq }),
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

type Row = { slug: string; routes: Array<{ routeShortName: string; tripDuration?: unknown }> };

describe('build-history dates trip time by when the feed ran (ATLAS_HISTORY_V2=1)', () => {
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

  it('labels each period by its in-service month and leaves out undated and future periods', async () => {
    vi.resetModules();
    const cap = resetCapture();
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await cap.done;
    const alpha = (JSON.parse(cap.historyConfig!) as Row[]).find(r => r.slug === 'alpha')!;
    expect(alpha.routes.find(r => r.routeShortName === '10')!.tripDuration)
      .toEqual({ firstLabel: 'Mar 2025', firstMinutes: 25, lastLabel: 'Jan 2026', lastMinutes: 24 });
  }, 30_000);
});
