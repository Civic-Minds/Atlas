import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('live yesterday workflow contract', () => {
  const workflow = readFileSync(resolve('.github/workflows/live-yesterday.yml'), 'utf8');
  it('runs by hand only until the schedule is switched on', () => {
    expect(workflow).toContain('  workflow_dispatch:');
    expect(workflow).toContain("# - cron: '15 9 * * *'");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });
  it('fetches, then checks the timetable, then builds, in the layout live-analyze.sh reads', () => {
    const fetch = workflow.indexOf('scripts/live-fetch-archive.ts --days 8');
    const gtfs = workflow.indexOf('scripts/live-gtfs-for-date.ts --target "$LIVE_DATA/gtfs/candidates/surface"');
    const build = workflow.indexOf('run: npm run live:yesterday');
    expect(fetch).toBeGreaterThan(0);
    expect(gtfs).toBeGreaterThan(fetch);
    expect(build).toBeGreaterThan(gtfs);
    expect(workflow).toContain('--out "$LIVE_DATA/archive"');
  });
});
