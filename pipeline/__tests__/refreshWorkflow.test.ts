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

    expect(refresh).toBeGreaterThanOrEqual(0);
    expect(persist).toBeGreaterThan(refresh);
    expect(build).toBeGreaterThan(persist);
    expect(verify).toBeGreaterThan(build);
    expect(workflow).not.toContain('      - name: Commit updated files if changed');
  });

  it('restores the refreshed files the pull request step resets, before PMTiles', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    const persist = workflow.indexOf('      - name: Open or update refresh pull request');
    const restore = workflow.indexOf('      - name: Restore refreshed files after the pull request step');
    const build = workflow.indexOf('      - name: Rebuild PMTiles vector tiles');
    expect(restore).toBeGreaterThan(persist);
    expect(build).toBeGreaterThan(restore);
    expect(workflow).toMatch(/id: refresh-pr\n\s+uses: peter-evans\/create-pull-request@/);
    expect(workflow).toContain('${{ steps.refresh-pr.outputs.pull-request-head-sha }}');
    expect(workflow).toContain('git checkout "$REFRESH_HEAD_SHA" -- .');
  });

  it('publishes the release pointer exactly once, after every derived artifact', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    const publishSteps = workflow.split('      - name: Publish verified data release').length - 1;
    expect(publishSteps).toBe(1);
    const publish = workflow.indexOf('      - name: Publish verified data release');
    for (const step of ['Rebuild PMTiles vector tiles', 'Verify PMTiles coverage', 'Rebuild history config']) {
      expect(publish).toBeGreaterThan(workflow.indexOf(`      - name: ${step}`));
    }
  });

  it('never runs two releases at once and cannot hang forever', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    expect(workflow).toMatch(/^concurrency:\n  group: atlas-data-release\n  cancel-in-progress: false$/m);
    expect(workflow).toMatch(/^    timeout-minutes: \d+$/m);
  });

  it('passes reviewed release-gate overrides to both the refresh and publish steps', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    expect(workflow).toMatch(/workflow_dispatch:[\s\S]*\n      allow:\n/);
    const refresh = workflow.slice(workflow.indexOf('      - name: Refresh agency feeds'), workflow.indexOf('      - name: Open or update refresh pull request'));
    const publish = workflow.slice(workflow.indexOf('      - name: Publish verified data release'));
    for (const step of [refresh, publish]) {
      expect(step).toContain('ALLOW_INPUT: ${{ inputs.allow }}');
      expect(step).toContain('--allow "$pair"');
    }
    expect(publish).toContain('npm run publish-data-release -- "${allow_args[@]}"');
  });

  it('regenerates agency pages only after the release is published, via an auto-merging PR limited to those files', () => {
    const workflow = readFileSync(resolve('.github/workflows/refresh-feeds.yml'), 'utf8');
    const publish = workflow.indexOf('      - name: Publish verified data release');
    const pr = workflow.indexOf('      - name: Open agency pages pull request');
    const merge = workflow.indexOf('      - name: Auto-merge agency pages pull request once checks pass');
    expect(pr).toBeGreaterThan(publish);
    expect(merge).toBeGreaterThan(pr);
    const prStep = workflow.slice(pr, merge);
    expect(prStep).toContain('shared/data/agency-pages.json');
    expect(prStep).toContain('shared/data/agency-page-slugs.json');
    expect(prStep).toContain('Regenerate agency pages for release-');
    expect(prStep).not.toMatch(/push-to-fork|signoff/);
    expect(workflow.slice(merge)).toContain('gh pr merge');
    // The generator runs inside publish-data-release, after the pointer moves.
    const publishSrc = readFileSync(resolve('pipeline/publish-data-release.ts'), 'utf8');
    expect(publishSrc.indexOf('build-agency-page-summaries.ts')).toBeGreaterThan(publishSrc.indexOf('Published Atlas data release'));
  });
});
