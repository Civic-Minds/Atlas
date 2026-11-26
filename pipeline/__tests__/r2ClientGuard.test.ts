import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CIV-2976 D1: Node scripts that use the R2 write keys build their client with pipeline/r2.ts getR2Client(), which
 * carries the IPv4 and timeout fixes for CI and the missing-write-key message. The few allowed here run elsewhere or
 * use other keys: the hosted MCP's Worker-side readers and the local API's read-only and Vercel readers.
 */
const ALLOWED = new Set([
  'pipeline/r2.ts',
  'scripts/mcp/liveNowData.ts', // Worker-side, MCP read keys
  'shared/liveArchive.ts',
  'local-api/privateBucket.ts', // read-only keys
  'local-api/history-adherence.ts',
  'local-api/liveStore.ts',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|mts|mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

describe('R2 client guard (CIV-2976 D1)', () => {
  it('builds the R2 client only in pipeline/r2.ts, outside the listed readers', () => {
    const offenders = ['pipeline', 'scripts', 'shared', 'local-api']
      .flatMap(sourceFiles)
      .filter(file => !ALLOWED.has(file) && readFileSync(file, 'utf8').includes('new S3Client('));
    expect(offenders).toEqual([]);
  });
});
