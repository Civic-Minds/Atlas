import { beforeEach, describe, expect, it, vi } from 'vitest';

const puts: string[] = [];
vi.mock('../r2.js', () => ({ r2PutArchiveJson: vi.fn(async (key: string) => { puts.push(key); }) }));
const { writeHistoryCoverage } = await import('../historyCoverage.js');

// #1148: a dry run never writes to R2.
describe('writeHistoryCoverage', () => {
  beforeEach(() => { puts.length = 0; });

  it('makes no R2 put on a dry run', async () => {
    await writeHistoryCoverage('ttc', new Set([2024, 2023]), { dryRun: true });
    expect(puts).toEqual([]);
  });

  it('writes the sorted coverage years otherwise', async () => {
    const { r2PutArchiveJson } = await import('../r2.js');
    await writeHistoryCoverage('ttc', new Set([2024, 2023]), { dryRun: false });
    expect(puts).toEqual(['history/ttc/coverage.json']);
    expect(vi.mocked(r2PutArchiveJson).mock.calls.at(-1)?.[1]).toBe(JSON.stringify({ coverageYears: [2023, 2024], materializeAllPeriods: true }));
  });
});
