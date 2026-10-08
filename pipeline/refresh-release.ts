#!/usr/bin/env npx tsx
/**
 * Refresh one or more agencies, rebuild the complete verified data release,
 * and publish it only after the derived artifacts pass their checks.
 *
 * Usage:
 *   npm run refresh-release -- translink
 *   npm run refresh-release -- translink --force
 *
 * This is intentionally the recommended manual path for feed updates. The
 * lower-level build-pmtiles command only repackages already-published agency
 * artifacts; it never downloads GTFS feeds.
 */
import { execFileSync } from 'node:child_process';
import './loadEnv.js';
import { readRefreshRunResult } from './dataRefreshMarker.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run refresh-release -- <agency-slug> [agency-slug ...] [--force]');
  process.exit(1);
}

function run(script: string, scriptArgs: string[] = []): void {
  console.log(`\n>>> npm run ${script}${scriptArgs.length ? ` -- ${scriptArgs.join(' ')}` : ''}`);
  execFileSync('npm', ['run', script, ...(scriptArgs.length ? ['--', ...scriptArgs] : [])], {
    stdio: 'inherit',
    env: process.env,
  });
}

run('refresh', args);

const requestedSlugs = args.filter(arg => !arg.startsWith('--')).sort();
const refreshResult = readRefreshRunResult();
if (!refreshResult || !refreshResult.complete || refreshResult.requestedSlugs.join('\n') !== requestedSlugs.join('\n')) {
  const statuses = refreshResult
    ? Object.entries(refreshResult.statuses).map(([slug, status]) => `${slug}: ${status}`).join(', ')
    : 'no refresh result was written';
  throw new Error(`Refresh-release stopped before PMTiles: the requested batch was incomplete (${statuses}).`);
}
run('build-pmtiles');
run('verify-pmtiles-coverage');
run('build-history');
run('publish-data-release');

console.log('\nVerified Atlas data release published.');
