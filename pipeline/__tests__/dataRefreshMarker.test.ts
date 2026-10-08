import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataRefreshGuardError, hashIndex, type DataRefreshMarker } from '../dataRefreshMarker';

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
    };
    fs.writeFileSync(indexPath, '{"agencies":[{"slug":"changed"}]}');
    expect(dataRefreshGuardError(marker, indexPath)).toContain('agency index changed');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
