import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('live report refresh workflow contract', () => {
  const workflow = readFileSync(resolve('.github/workflows/live-report-refresh.yml'), 'utf8');
  const buildJob = workflow.slice(workflow.indexOf('\n  build:'), workflow.indexOf('\n  publish:'));
  // The publish job ends where the Studio job's banner starts.
  const studioStart = workflow.lastIndexOf('\n  # ---', workflow.indexOf('\n  # Atlas Studio agencies'));
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'), studioStart);
  const studioJob = workflow.slice(workflow.indexOf('\n  studio-build:'));

  it('runs daily off the hour (CIV-1690), and a manual run does not publish unless asked', () => {
    expect(workflow).toContain('  workflow_dispatch:');
    const crons = [...workflow.matchAll(/^\s+- cron: '([^']+)'/gm)].map(m => m[1]);
    expect(crons).toEqual(['17 9 * * *']);
    expect(workflow).toMatch(/mode:\n(.*\n)*?\s+default: no-publish/);
    expect(publishJob).toContain("if: github.ref == 'refs/heads/main' && (inputs.mode == 'publish' || github.event_name == 'schedule')");
    expect(buildJob).toContain('"$GITHUB_REF" != "refs/heads/main"');
  });

  it('has only a manual run and the daily schedule as triggers', () => {
    const on = workflow.slice(workflow.indexOf('\non:\n') + 5, workflow.indexOf('\npermissions:'));
    const triggers = on.split('\n').filter(l => /^  [a-z_]+:/.test(l)).map(l => l.trim());
    expect(triggers).toEqual(['workflow_dispatch:', 'schedule:']);
  });

  it('keeps the two jobs apart: publish waits for build, and neither keeps the checkout token', () => {
    expect(publishJob).toMatch(/^\n  publish:\n    needs: build\n/);
    for (const job of [buildJob, publishJob]) {
      expect(job.match(/uses: actions\/checkout@/g)).toHaveLength(1);
      expect(job).toMatch(/uses: actions\/checkout@v\d+\n\s+with:\n\s+persist-credentials: false/);
    }
  });

  it('never passes the flags that are for a person at a keyboard', () => {
    expect(workflow).not.toMatch(/run: .*--first-publish/);
    expect(workflow).not.toMatch(/run: .*--allow-older/);
    expect(workflow).not.toMatch(/run: .*--force/);
    expect(workflow).not.toMatch(/--max-failed-share/);
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
    // The summary gets the fetch report, the timetable match and a copy of what is published now.
    expect(buildJob).toContain('--report "$LIVE_DATA/review/fetch.json"');
    expect(buildJob).toContain('--fetch "$LIVE_DATA/review/fetch.json"');
    expect(buildJob).toContain('--published "$LIVE_DATA/review/published"');
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

  it('keeps Studio agencies (Kingston, CIV-1686) off, build-only and away from the public bucket', () => {
    expect(workflow.indexOf('\n  studio-build:')).toBeGreaterThan(workflow.indexOf('\n  publish:'));
    // Off: one literal switch, flipped by hand once there is enough data and a private destination.
    expect(studioJob).toMatch(/^\n  studio-build:\n(\s+#.*\n)+    if: \$\{\{ false \}\}\n/);
    expect(studioJob).toContain('agency: [kingston]');
    expect(studioJob).not.toContain('needs:');
    // Never published: no publish step, no write keys, no upload flag, no public files.
    expect(studioJob).not.toContain('live-publish');
    expect(studioJob).not.toContain('secrets.R2_ACCESS_KEY_ID');
    expect(studioJob).not.toContain('secrets.R2_SECRET_ACCESS_KEY');
    expect(studioJob).not.toMatch(/--upload/);
    expect(studioJob).not.toContain('atlas/live/');
    expect(studioJob).toContain('R2_ACCESS_KEY_ID: ${{ secrets.R2_RO_ACCESS_KEY_ID }}');
    expect(studioJob.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(studioJob).toMatch(/uses: actions\/checkout@v\d+\n\s+with:\n\s+persist-credentials: false/);
    // The agency's own folders and timetable, every route, then the time-loss report.
    const fetch = studioJob.indexOf('scripts/live-fetch-archive.ts --agency "$AGENCY" --days 15');
    const gtfs = studioJob.indexOf('scripts/live-gtfs-for-window.ts --agency "$AGENCY" --days 15');
    const analyse = studioJob.indexOf('bash scripts/live-analyze.sh all --agency "$AGENCY" --days 15');
    const timeLoss = studioJob.indexOf('scripts/live-time-loss-report.ts');
    expect(fetch).toBeGreaterThan(0);
    expect(gtfs).toBeGreaterThan(fetch);
    expect(analyse).toBeGreaterThan(gtfs);
    expect(timeLoss).toBeGreaterThan(analyse);
    // Its own cache, so the TTC cache key never holds another agency's positions.
    expect(studioJob).toContain('key: live-studio-archive-${{ matrix.agency }}-');
  });
});
