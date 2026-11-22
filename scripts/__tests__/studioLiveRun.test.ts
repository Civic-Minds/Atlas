import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_MIN_HEALTHY_DAYS_PER_WEEK } from '../../shared/rules/live';
import type { LiveV3 } from '../../shared/liveDashboard';
import { STUDIO_LIVE_KEEP_RUNS, acceptStudioLiveBuild, goodDaysByWeek, nextStudioLivePointer, runsToPrune, studioLiveRunPrefix } from '../studioLiveRun';

// CIV-2077: Studio's Live files rebuild daily in the cloud, with the two checks from docs/operations/LIVE_ANALYSIS.md.
const v3 = (thisWeek: string[], lastWeek: string[]) => ({ weekly: { thisWeek: { healthyDates: thisWeek }, lastWeek: { healthyDates: lastWeek } } }) as unknown as LiveV3;
const days = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`);
const N = LIVE_MIN_HEALTHY_DAYS_PER_WEEK;

describe('thin weeks', () => {
  it('counts a good day once across routes', () => {
    expect(goodDaysByWeek([v3(days(2), days(1)), v3(days(3), []), undefined])).toEqual({ thisWeek: 3, lastWeek: 1 });
  });

  it('replaces an agency only when each week has the shared minimum of good days', () => {
    expect(acceptStudioLiveBuild({ thisWeek: N, lastWeek: N }, true)).toBe(true);
    expect(acceptStudioLiveBuild({ thisWeek: N - 1, lastWeek: N }, true)).toBe(false);
    expect(acceptStudioLiveBuild({ thisWeek: N, lastWeek: N - 1 }, true)).toBe(false);
  });

  it('a first build needs only this week', () => {
    expect(acceptStudioLiveBuild({ thisWeek: N, lastWeek: 0 }, false)).toBe(true);
    expect(acceptStudioLiveBuild({ thisWeek: N - 1, lastWeek: 0 }, false)).toBe(false);
  });
});

describe('pointer and runs', () => {
  const files = { files: ['kingston-1-segments.json'], thisWeekGoodDays: 5, lastWeekGoodDays: 5 };

  it('points rebuilt agencies at the new run and keeps the rest on theirs', () => {
    const prev = nextStudioLivePointer(null, '100', 't1', { kingston: files, hamilton: files });
    const next = nextStudioLivePointer(prev, '101', 't2', { kingston: files });
    expect(next.agencies.kingston.run).toBe('101');
    expect(next.agencies.hamilton.run).toBe('100');
    expect(next.agencies.hamilton.builtAt).toBe('t1');
  });

  it('prunes only runs nothing points at, keeping the newest few', () => {
    const runs = ['90', '91', '92', '93', '94', '100', '101'];
    const keys = runs.map(r => `${studioLiveRunPrefix(r)}kingston/a.json`);
    const pointer = nextStudioLivePointer(nextStudioLivePointer(null, '90', 't', { hamilton: files }), '101', 't', { kingston: files });
    const pruned = runsToPrune(keys, pointer).map(k => k.split('/')[2]);
    const unused = runs.filter(r => r !== '90' && r !== '101');
    expect(pruned).toEqual(unused.slice(0, unused.length - STUDIO_LIVE_KEEP_RUNS));
    expect(pruned).not.toContain('90');
  });
});

describe('the cloud script (public repository)', () => {
  const src = readFileSync(resolve(__dirname, '../studio-live-cloud.ts'), 'utf8');

  it('prints counts only: no agency, route or figure in its log lines', () => {
    const logs = src.match(/console\.(log|error|warn)\([^;]*\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).not.toMatch(/\$\{(slug|route|a|b|f|e|weeks|built|pointer)\b/);
    expect(src).not.toMatch(/stdio:\s*'inherit'/);
  });

  it('switches the pointer only after every file is up, and deletes only under its own prefix', () => {
    expect(src.indexOf('Key: STUDIO_LIVE_POINTER')).toBeGreaterThan(src.indexOf('for (const f of b.files)'));
    expect(src).toMatch(/startsWith\('studio-live\/runs\/'\)/);
  });

  it('the workflow uploads no artifact, saves no cache, and schedules only behind STUDIO_LIVE_DAILY', () => {
    const wf = readFileSync(resolve(__dirname, '../../.github/workflows/studio-live-refresh.yml'), 'utf8');
    expect(wf).not.toMatch(/upload-artifact|actions\/cache/);
    expect(wf).toMatch(/github\.event_name != 'schedule' \|\| vars\.STUDIO_LIVE_DAILY == '1'/);
    expect(wf).toMatch(/refs\/heads\/main/);
  });
});
