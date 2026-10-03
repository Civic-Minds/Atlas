import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('weekly refresh workflow contract', () => {
  it('persists feed metadata before the PMTiles gates run', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    const refresh = workflow.indexOf('      - name: Refresh agency feeds');
    const persist = workflow.indexOf('      - name: Open or update refresh pull request');
    const build = workflow.indexOf('      - name: Rebuild PMTiles vector tiles');
    const verify = workflow.indexOf('      - name: Verify PMTiles coverage');
    const history = workflow.indexOf('      - name: Rebuild history config');
    const publish = workflow.indexOf('      - name: Publish verified data release');

    expect(refresh).toBeGreaterThanOrEqual(0);
    expect(persist).toBeGreaterThan(refresh);
    expect(build).toBeGreaterThan(persist);
    expect(verify).toBeGreaterThan(build);
    expect(history).toBeGreaterThan(verify);
    expect(publish).toBeGreaterThan(history);
    expect(workflow).toContain('concurrency:\n  group: gtfs-refresh');
    expect(workflow).toContain('AGENCIES: ${{ inputs.agencies }}');
    expect(workflow).not.toContain('      - name: Commit updated files if changed');
  });
});
