import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canRebuildPmtilesAfterRefresh, dataRefreshGuardError, hashIndex, type DataRefreshMarker, writeRefreshRunResult } from '../dataRefreshMarker';

// Never write the real tmp/atlas-refresh-result.json: refresh-release reads it to decide
// whether PMTiles may be rebuilt.
const resultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-refresh-result-'));
const resultPath = path.join(resultDir, 'atlas-refresh-result.json');
afterAll(() => fs.rmSync(resultDir, { recursive: true, force: true }));

describe('data refresh marker guard', () => {
  it('rejects PMTiles builds without a successful refresh', () => {
    expect(dataRefreshGuardError(null, __filename)).toContain('No successful data refresh');
  });

  it('rejects a marker when the agency index changed afterward', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-marker-'));
    const indexPath = path.join(dir, 'index.json');
    fs.writeFileSync(indexPath, '{"agencies":[]}');
    const marker: DataRefreshMarker = {
      generatedAt: new Date().toISOString(),
      source: 'refresh',
      slugs: ['example'],
      indexSha256: hashIndex(indexPath),
      complete: true,
    };
    fs.writeFileSync(indexPath, '{"agencies":[{"slug":"changed"}]}');
    expect(dataRefreshGuardError(marker, indexPath)).toContain('agency index changed');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('marks a batch incomplete when one requested agency is stale', () => {
    const result = writeRefreshRunResult(['good', 'bad'], { good: 'processed', bad: 'stale' }, resultPath);
    expect(result.complete).toBe(false);
  });

  it('lets a full run rebuild PMTiles when agencies kept their live data, but not when one failed', () => {
    const kept = writeRefreshRunResult(['a', 'b', 'c', 'd'], { a: 'processed', b: 'stale', c: 'skipped', d: 'refused' }, resultPath);
    expect(kept.complete).toBe(false);
    expect(canRebuildPmtilesAfterRefresh(kept)).toBe(true);
    const failed = writeRefreshRunResult(['a', 'b'], { a: 'processed', b: 'failed' }, resultPath);
    expect(canRebuildPmtilesAfterRefresh(failed)).toBe(false);
    expect(JSON.parse(fs.readFileSync(resultPath, 'utf8'))).toMatchObject({ statuses: { b: 'failed' }, complete: false });
  });
});
