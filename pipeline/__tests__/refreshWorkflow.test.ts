import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('weekly refresh workflow contract', () => {
  it('persists feed metadata before the PMTiles gates run', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    const refresh = workflow.indexOf('      - name: Refresh agency feeds');
    const commit = workflow.indexOf('      - name: Commit refreshed feed metadata');
    const build = workflow.indexOf('      - name: Rebuild PMTiles vector tiles');
    const verify = workflow.indexOf('      - name: Verify PMTiles coverage');

    expect(refresh).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(refresh);
    expect(build).toBeGreaterThan(commit);
    expect(verify).toBeGreaterThan(build);
    expect(workflow).not.toContain('      - name: Commit updated files if changed');
  });
});
