import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_TTC_ANALYSED_ROUTES } from '../../shared/rules/live';

describe('live report refresh workflow contract', () => {
  const workflow = readFileSync(resolve('.github/workflows/live-report-refresh.yml'), 'utf8');
  const buildJob = workflow.slice(workflow.indexOf('\n  build:'), workflow.indexOf('\n  publish:'));
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'), workflow.indexOf('\n  mcp-live:'));
  // CIV-1860: the MCP's Live files are built after the publish step, in their own job.
  const mcpLiveJob = workflow.slice(workflow.indexOf('\n  mcp-live:'));

  it('runs daily off the hour (CIV-1690), and a manual run does not publish unless asked', () => {
    expect(workflow).toContain('  workflow_dispatch:');
    const crons = [...workflow.matchAll(/^\s+- cron: '([^']+)'/gm)].map(m => m[1]);
    // CIV-2177: the two later ones are backups, run only when the day's refresh hasn't succeeded (the gate job).
    expect(crons).toEqual(['17 9 * * *', '17 14 * * *', '17 19 * * *']);
    expect(workflow).toMatch(/mode:\n(.*\n)*?\s+default: no-publish/);
    expect(publishJob).toContain("if: github.ref == 'refs/heads/main' && (inputs.mode == 'publish' || github.event_name == 'schedule')");
    expect(buildJob).toContain('"$GITHUB_REF" != "refs/heads/main"');
  });

  it('has only a manual run and the daily schedule as triggers', () => {
    const on = workflow.slice(workflow.indexOf('\non:\n') + 5, workflow.indexOf('\npermissions:'));
    const triggers = on.split('\n').filter(l => /^  [a-z_]+:/.test(l)).map(l => l.trim());
    expect(triggers).toEqual(['workflow_dispatch:', 'schedule:']);
  });

  it('keeps the jobs apart: publish waits for build, mcp-live waits for publish, and none keeps the checkout token', () => {
    expect(publishJob).toMatch(/^\n  publish:\n    needs: build\n/);
    expect(mcpLiveJob).toMatch(/^\n  mcp-live:\n    needs: \[gate, publish\]\n/);
    for (const job of [buildJob, publishJob, mcpLiveJob]) {
      expect(job.match(/uses: actions\/checkout@/g)).toHaveLength(1);
      expect(job).toMatch(/uses: actions\/checkout@v\d+\n\s+with:\n\s+persist-credentials: false/);
    }
  });

  it('runs a scheduled day once: the gate skips build and mcp-live when the publish job already succeeded today (CIV-2177)', () => {
    const gateJob = workflow.slice(workflow.indexOf('\n  gate:'), workflow.indexOf('\n  build:'));
    expect(gateJob).toContain('scripts/ci/refresh-last-success.sh live-report-refresh.yml publish || true');
    expect(gateJob).toMatch(/permissions:\n\s+actions: read\n\s+contents: read\n/);
    expect(gateJob).not.toContain('secrets.');
    expect(buildJob).toMatch(/^\n  build:\n    needs: gate\n    if: needs\.gate\.outputs\.run == 'true'\n/);
    expect(mcpLiveJob).toContain("if: always() && needs.gate.outputs.run == 'true' &&");
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
    expect(buildJob).toContain(`--routes ${LIVE_TTC_ANALYSED_ROUTES.join(',')}`);
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

  it('makes no Studio file public: Kingston’s report refreshes on Ryan’s Mac only (CIV-1716)', () => {
    // The repository is public, so a GitHub run's files and logs would make the Studio report public. Since CIV-1974
    // (Ryan's go: the Mac does no Studio builds) the rebuild builds Studio's buses-needed and schedule-change files, but
    // they go only to the private Live bucket: no workflow names an agency's Live report or keeps tmp/studio as an artifact.
    const dir = resolve('.github/workflows');
    for (const name of readdirSync(dir)) {
      const text = readFileSync(join(dir, name), 'utf8').replace(/^\s*#.*$/gm, '');
      expect([name, /--agency|kingston/i.test(text)]).toEqual([name, false]);
      for (const block of text.split(/uses: actions\/upload-artifact/).slice(1)) expect([name, /tmp\/studio/.test(block.split(/\n\s+- name:/)[0])]).toEqual([name, false]);
    }
    const local = readFileSync(resolve('scripts/studio-report.sh'), 'utf8');
    expect(JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts['studio:report']).toBe('bash scripts/studio-report.sh');
    // Read only: no publish step, no upload flag, no public files.
    expect(local).not.toMatch(/live-publish|--upload|atlas\/live\//);
    const fetch = local.indexOf('scripts/live-fetch-archive.ts --agency');
    const gtfs = local.indexOf('scripts/live-gtfs-for-window.ts --agency');
    const analyse = local.indexOf('scripts/live-analyze.sh all --agency');
    const timeLoss = local.indexOf('scripts/live-time-loss-report.ts');
    expect(fetch).toBeGreaterThan(0);
    expect(gtfs).toBeGreaterThan(fetch);
    expect(analyse).toBeGreaterThan(gtfs);
    expect(timeLoss).toBeGreaterThan(analyse);
  });
});
