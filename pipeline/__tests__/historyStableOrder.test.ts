/**
 * CIV-1315: a build reads the same bytes whatever order the archive downloads finish in. The
 * snapshot downloads run in parallel, and before this the maps were filled in completion order, so
 * two dry runs on the same archive differed in agency order, in route order among sort ties and in
 * the long-name fallback (the first change file carrying a name). Here the second run lists keys in
 * reverse and finishes every read in reverse order, with a high concurrency so the order really
 * differs; its outputs must equal the in-order run's byte for byte.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';

type ReadOrder = { reversed: boolean; rank: Map<string, number>; completed: string[] };
const G = globalThis as unknown as { __historyReadOrder: ReadOrder };

// Two more change files for a route with no current entry, named differently in each period, so the
// long-name fallback is exercised (every fixture route is named the same in every period).
const EXTRA: Record<string, string> = {
  'history/alpha/50/20180901.json': JSON.stringify({ headway: 30, routeLongName: 'Fifty, as first named' }),
  'history/alpha/50/20230901.json': JSON.stringify({ headway: 15, routeLongName: 'Fifty, renamed' }),
};

vi.mock('../r2.js', async () => {
  const { r2Mocks } = await import('./historyBuild/harness.js');
  const base = r2Mocks();
  return {
    ...base,
    r2ListArchive: async (prefix: string) => {
      const order = G.__historyReadOrder;
      const keys = [...await base.r2ListArchive(prefix), ...Object.keys(EXTRA).filter(k => k.startsWith(prefix))].sort();
      keys.forEach((k, i) => order.rank.set(k, i));
      return order.reversed ? keys.reverse() : keys;
    },
    r2GetArchive: async (key: string) => {
      const order = G.__historyReadOrder;
      const value = EXTRA[key] ?? await base.r2GetArchive(key);
      // Reversed: the first listed key finishes last.
      if (order.reversed) await new Promise(r => setTimeout(r, order.rank.size - (order.rank.get(key) ?? 0)));
      order.completed.push(key);
      return value;
    },
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
      c.agencyList = (buildHistoryAgencyList as (r: unknown, o?: unknown) => unknown)(rows, options);
      c.resolveDone?.();
      return ((c.agencyList as { slugs: string[] }).slugs).length;
    },
  };
});

async function runBuild(reversed: boolean) {
  vi.resetModules();
  const cap = resetCapture();
  G.__historyReadOrder = { reversed, rank: new Map(), completed: [] };
  process.env.ATLAS_HISTORY_V2 = '1';
  process.env.R2_ACCESS_KEY_ID = 'test';
  // Every read in a phase in flight at once, so the delays alone decide the completion order.
  process.env.HISTORY_DOWNLOAD_CONCURRENCY = '1000';
  process.env.HISTORY_TRIP_DURATION_CONCURRENCY = '1000';
  await import('../build-history.js');
  await cap.done;
  return { cap, completed: G.__historyReadOrder.completed };
}

type Agency = { slug: string; routes: Array<{ routeShortName: string; routeName: string }> };

describe('build-history reads the same whatever order the downloads finish in (CIV-1315)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.ATLAS_HISTORY_V2;
    delete process.env.HISTORY_DOWNLOAD_CONCURRENCY;
    delete process.env.HISTORY_TRIP_DURATION_CONCURRENCY;
  });

  it('reversed listing and reversed completion give byte-identical outputs', async () => {
    const inOrder = await runBuild(false);
    const reversed = await runBuild(true);
    // The two runs really read in different orders.
    expect(reversed.completed).not.toEqual(inOrder.completed);
    expect(reversed.completed.slice(0, 3)).not.toEqual(inOrder.completed.slice(0, 3));

    expect(inOrder.cap.historyConfig).toBeTruthy();
    expect(reversed.cap.historyConfig).toBe(inOrder.cap.historyConfig);
    expect(reversed.cap.puts).toEqual(inOrder.cap.puts);
    expect(reversed.cap.files).toEqual(inOrder.cap.files);
    expect(reversed.cap.agencyList).toEqual(inOrder.cap.agencyList);

    // Agencies in listed-key order; the long-name fallback reads the oldest change file's name.
    const agencies = JSON.parse(inOrder.cap.historyConfig!) as Agency[];
    expect(agencies.map(a => a.slug)).toEqual(['alpha', 'beta', 'gamma']);
    expect(agencies[0].routes.find(r => r.routeShortName === '50')?.routeName).toBe('Fifty, as first named');
  });
});
