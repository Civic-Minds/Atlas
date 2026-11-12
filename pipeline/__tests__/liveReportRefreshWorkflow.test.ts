import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('live report refresh workflow contract', () => {
  const workflow = readFileSync(resolve('.github/workflows/live-report-refresh.yml'), 'utf8');
  const buildJob = workflow.slice(workflow.indexOf('\n  build:'), workflow.indexOf('\n  publish:'));
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));

  it('runs by hand only, and a manual run does not publish unless asked', () => {
    expect(workflow).toContain('  workflow_dispatch:');
    expect(workflow).toContain("# - cron: '30 9 * * 1'");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).toMatch(/mode:\n(.*\n)*?\s+default: no-publish/);
    expect(publishJob).toContain("if: github.ref == 'refs/heads/main' && (inputs.mode == 'publish' || github.event_name == 'schedule')");
    expect(buildJob).toContain('"$GITHUB_REF" != "refs/heads/main"');
  });

  it('builds with the read-only keys and no write permission', () => {
    expect(workflow).toMatch(/^permissions:\n  contents: read$/m);
    expect(workflow).not.toMatch(/: write$/m);
    expect(buildJob).toContain('R2_ACCESS_KEY_ID: ${{ secrets.R2_RO_ACCESS_KEY_ID }}');
    expect(buildJob).toContain('R2_SECRET_ACCESS_KEY: ${{ secrets.R2_RO_SECRET_ACCESS_KEY }}');
    expect(buildJob).not.toContain('secrets.R2_ACCESS_KEY_ID');
    expect(buildJob).not.toContain('secrets.R2_SECRET_ACCESS_KEY');
    expect(buildJob).not.toMatch(/run: .*--upload/);
  });

  it('fetches 15 days, gets each date its timetable, analyses, then builds, in the layout live-analyze.sh reads', () => {
    const fetch = buildJob.indexOf('scripts/live-fetch-archive.ts --days 15');
    const gtfs = buildJob.indexOf('scripts/live-gtfs-for-window.ts --days 15');
    const analyse = buildJob.indexOf('bash scripts/live-analyze.sh all --days 15');
    const build = buildJob.indexOf('npx tsx scripts/live-publish.ts ttc');
    expect(fetch).toBeGreaterThan(0);
    expect(gtfs).toBeGreaterThan(fetch);
    expect(analyse).toBeGreaterThan(gtfs);
    expect(build).toBeGreaterThan(analyse);
    expect(buildJob).toContain('--routes 501,503,504,505,506,507,509,510,511,512');
    expect(buildJob).toContain('--feeds-dir "$LIVE_DATA/gtfs/candidates/surface-feeds" --surface "$LIVE_DATA/gtfs/candidates/surface"');
    expect(buildJob).toContain('LIVE_SEGMENTS_DIR=$RUNNER_TEMP/live-data/out');
  });

  it('saves the published files as an artifact before the one step that holds the write keys', () => {
    const save = publishJob.indexOf('name: Save the published files');
    const artifact = publishJob.indexOf('name: live-report-backup-');
    const upload = publishJob.indexOf('name: Publish the report files');
    expect(save).toBeGreaterThan(0);
    expect(artifact).toBeGreaterThan(save);
    expect(upload).toBeGreaterThan(artifact);
    expect(publishJob.slice(save, upload)).not.toMatch(/run: .*--upload/);
    expect(publishJob.slice(0, upload)).not.toContain('secrets.R2_ACCESS_KEY_ID');
    expect(publishJob.slice(upload)).toContain('R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}');
    expect(publishJob.match(/run: .*--upload/g)).toHaveLength(1);
    // The analysis never runs beside the write keys.
    expect(publishJob).not.toContain('live-analyze');
    expect(publishJob).not.toContain('live-publish.ts');
  });

  it('never puts an input straight into a shell command', () => {
    for (const block of workflow.split(/\n\s+run: /).slice(1)) {
      const command = block.split(/\n\s+(?:- name:|- uses:|env:|if:|uses:|with:)/)[0];
      expect(command).not.toContain('${{ inputs.');
      expect(command).not.toContain('${{ github.event');
    }
  });
});
