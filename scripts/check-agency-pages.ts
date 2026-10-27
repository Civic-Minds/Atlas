#!/usr/bin/env npx tsx
/**
 * Check that the committed agency page summaries match the data release the site serves (#1156).
 *
 *   npm run check:agency-pages            warn when they don't (exit 0)
 *   npm run check:agency-pages -- --strict   fail when they don't (exit 1)
 *
 * Read-only: one GET of the public atlas/release.json. A warning by default, because the summaries can
 * only catch up after a publish and a red check would block unrelated pushes. In GitHub Actions the
 * warning is a workflow annotation. Without network the check says it was skipped and passes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { agencyPagesFreshness, REGENERATE_HELP } from './agencyPagesFreshness.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Checks that shared/data/agency-pages.json was built from the release in the public atlas/release.json.\n');
  console.log('  --strict   exit 1 when the summaries are behind (default: warn only)\n');
  console.log(REGENERATE_HELP);
  process.exit(0);
}
const strict = args.includes('--strict');
const inActions = process.env.GITHUB_ACTIONS === 'true';

const summary = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'shared/data/agency-pages.json'), 'utf8')) as { releaseId?: string };
let publicReleaseId: string | null = null;
try {
  const response = await fetch(`${R2_PUBLIC_URL.replace(/\/$/, '')}/atlas/release.json?v=${Date.now().toString(36)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.ok) publicReleaseId = ((await response.json()) as { releaseId?: string }).releaseId ?? null;
} catch {
  publicReleaseId = null;
}

const result = agencyPagesFreshness(summary.releaseId, publicReleaseId);
if (result.status === 'current') {
  console.log(result.message);
} else if (result.status === 'unknown') {
  console.log(`Skipped: ${result.message}`);
} else {
  if (inActions) console.log(`::warning title=Agency page summaries are behind::${result.message}`);
  console.warn(`${result.message}\n\n${REGENERATE_HELP}`);
  if (strict) process.exit(1);
}
