import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_ARCHIVE_BUCKET, LIVE_ARCHIVE_BUCKET_BY_SLUG, LIVE_MIN_SAMPLE, LIVE_POLL_SEC } from '../live';

// Rules move 2: Live's thresholds live in shared/rules/live.ts. Values pinned as they were before the move.
describe("Live's thresholds (shared/rules/live.ts)", () => {
  it('keeps the values', () => {
    expect([LIVE_MIN_SAMPLE, LIVE_POLL_SEC, DEFAULT_LIVE_ARCHIVE_BUCKET]).toEqual([30, 15, 'atlas-live']);
  });

  // Each archiver's wrangler file binds the bucket the app reads that agency from (Kingston its own, the rest atlas-live).
  it('matches every archiver wrangler bucket', () => {
    const dir = join(import.meta.dirname, '..', '..', '..', 'workers', 'gtfs-rt-archiver');
    const tomls = readdirSync(dir).filter(f => /^wrangler(\.[\w-]+)?\.toml$/.test(f));
    expect(tomls.length).toBeGreaterThan(0);
    for (const f of tomls) {
      const bucket = /bucket_name\s*=\s*"([^"]+)"/.exec(readFileSync(join(dir, f), 'utf8'))?.[1];
      const slug = /^wrangler\.([\w-]+)\.toml$/.exec(f)?.[1];
      expect(bucket, f).toBe((slug && LIVE_ARCHIVE_BUCKET_BY_SLUG[slug]) ?? DEFAULT_LIVE_ARCHIVE_BUCKET);
    }
  });
});
