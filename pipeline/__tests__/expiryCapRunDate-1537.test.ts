import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pipelineRunDateYmd } from '../pipelineTimeZone';
import { recordedFeedExpiry } from '../refreshMeta';

// #1537: two dry runs on Nov 15 Toronto (18:13 and 19:10, the second already Nov 16 in UTC) capped a
// placeholder calendar end at 20281115 and 20281116. The cap reads the run's one Toronto date.
const saved = process.env.ATLAS_RUN_AT;
afterEach(() => { if (saved == null) delete process.env.ATLAS_RUN_AT; else process.env.ATLAS_RUN_AT = saved; });

describe('placeholder expiry cap reads the Toronto run date (#1537)', () => {
  const capAt = (runAt: string) => {
    process.env.ATLAS_RUN_AT = runAt;
    return recordedFeedExpiry(null, '20500101', pipelineRunDateYmd());
  };

  it('caps runs before and after 19:00 Toronto on the same day at the same date', () => {
    expect(capAt('2026-11-15T23:13:27Z')).toBe('20281115'); // 18:13 Toronto, Nov 15
    expect(capAt('2026-11-16T00:10:02Z')).toBe('20281115'); // 19:10 Toronto, Nov 15 (Nov 16 UTC)
    expect(capAt('2026-11-16T05:00:00Z')).toBe('20281116'); // 00:00 Toronto, Nov 16
  });

  it.each(['pipeline/process-core.ts', 'pipeline/reprocess-derived-artifacts.ts'])('%s passes pipelineRunDateYmd() as today', file => {
    const src = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8');
    expect(src).not.toMatch(/runNow\(\)\.toISOString\(\)\.slice\(0, 10\)/);
    expect(src).toMatch(/recordedFeedExpiry\([^\n]*pipelineRunDateYmd\(\)|const todayYmd = pipelineRunDateYmd\(\);/);
  });
});
