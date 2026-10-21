/**
 * Runs pipeline/build-history.ts end to end against the synthetic fixture with every outside
 * dependency mocked (no network, no R2, no repo file written). The vi.mock calls live in the
 * test files (they must be hoisted there); this file holds the shared pieces.
 */
import { historyBuildFixture } from './fixture.js';

export interface BuildCapture {
  /** What was passed to r2Put('atlas/history-config.json', ...). */
  historyConfig?: string;
  /** Rows (and options) passed to writeHistoryAgencyList, and the list it would have written. */
  agencyListRows?: unknown;
  agencyListOptions?: unknown;
  agencyList?: unknown;
  /** Files the build tried to write with fs.writeFileSync. */
  files: Record<string, string>;
  done?: Promise<void>;
  resolveDone?: () => void;
}

const G = globalThis as unknown as { __historyBuildCapture?: BuildCapture };

export function resetCapture(): BuildCapture {
  const cap: BuildCapture = { files: {} };
  cap.done = new Promise<void>(resolve => { cap.resolveDone = resolve; });
  G.__historyBuildCapture = cap;
  return cap;
}

export function capture(): BuildCapture {
  return G.__historyBuildCapture as BuildCapture;
}

export function r2Mocks() {
  const fx = historyBuildFixture();
  const list = (store: Record<string, string>) => async (prefix: string) => Object.keys(store).filter(k => k.startsWith(prefix)).sort();
  return {
    r2ListArchive: list(fx.archive),
    r2GetArchive: async (key: string) => fx.archive[key] ?? null,
    r2Get: async (key: string) => fx.pub[key] ?? null,
    r2Put: async (key: string, body: string) => {
      if (key === 'atlas/history-config.json') {
        capture().historyConfig = body;
      }
    },
  };
}

/** readFileSync override for the two repo files the build reads. */
export function fakeRead(path: string): string | undefined {
  const fx = historyBuildFixture();
  if (path.endsWith('public/data/index.json')) return JSON.stringify(fx.index);
  if (path.endsWith('config/history-route-aliases.json')) return JSON.stringify(fx.aliases);
  return undefined;
}
