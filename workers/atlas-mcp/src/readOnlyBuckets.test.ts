import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bucketGet } from './index';

// CIV-3165: the hosted MCP reads the published release through its R2 binding (ATLAS_DATA), and the Live files through
// MCP_LIVE and MCP_LIVE_ARCHIVE. It only ever reads them: no write, delete or upload call may appear in its code.
const SRC = 'workers/atlas-mcp/src';
const FILES = [
  ...readdirSync(SRC).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => `${SRC}/${f}`),
  'scripts/mcp/liveNowData.ts',
  'scripts/mcp/liveData.ts',
  'shared/mcpSplitStore.ts',
  'shared/mcpRelease.ts',
];
const WRITE = /\.(put|createMultipartUpload|resumeMultipartUpload)\(|(ATLAS_DATA|MCP_LIVE\w*|[bB]ucket)!?\??\.delete\(/;

describe('hosted MCP buckets are read only (CIV-3165)', () => {
  it('no R2 write, delete or upload call in the Worker or the readers it bundles', () => {
    const hits = FILES.flatMap(f => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, n: i + 1, line })))
      .filter(({ line }) => WRITE.test(line))
      .map(({ f, n, line }) => `${f}:${n}: ${line.trim()}`);
    expect(hits).toEqual([]);
  });

  it('wrangler.jsonc binds the data bucket the release pointer lives in', () => {
    expect(readFileSync('workers/atlas-mcp/wrangler.jsonc', 'utf8')).toMatch(/"binding": "ATLAS_DATA", "bucket_name": "atlas"/);
  });

  it('bucketGet reads the key of the URL path, and answers 404 for a missing one', async () => {
    const asked: string[] = [];
    const bucket = { get: async (key: string) => { asked.push(key); return key === 'atlas/release.json' ? { body: JSON.stringify({ releaseId: 'r1' }) } : null; } } as unknown as R2Bucket;
    const get = bucketGet(bucket);
    const ok = await get('https://data.transitatlas.fyi/atlas/release.json', { cf: { cacheTtl: 60 } } as RequestInit);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ releaseId: 'r1' });
    expect((await get(new URL('https://data.transitatlas.fyi/atlas/releases/r1/mcp/manifest.json'))).status).toBe(404);
    expect(asked).toEqual(['atlas/release.json', 'atlas/releases/r1/mcp/manifest.json']);
  });
});
