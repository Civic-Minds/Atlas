/**
 * Local only (CIV-1871): what the daily mcp-live job wrote to the private bucket, for the coverage page's MCP column:
 * `live/<slug>/coverage.json` for each agency Live records (the focus list's Live set). Reads only, with the READ-ONLY keys
 * (R2_RO_ACCESS_KEY_ID, R2_RO_SECRET_ACCESS_KEY), the bucket name (MCP_LIVE_BUCKET) and the account (R2_ACCOUNT_ID). They are
 * read from the main checkout's .env.local, because a worktree's .env.local has no R2 keys on purpose, and only those four
 * are picked out of it: the write keys are never read into this process. Without them it answers `available: false` and
 * the page leaves the status out.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';
import { PRODUCT_FOCUS } from '../shared/rules/focus.js';
import { MCP_COVERAGE_PREFIX } from '../shared/coverageRows.js';
import type { LiveCoverage } from '../shared/liveCoverage.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** The four settings this handler may read, from the main checkout's .env.local (the checkout the worktrees were made from). */
// #1928: R2_LIVE_READ_* is a read-only token for the private Live bucket alone (the R2_RO_* token is scoped to the data and
// archive buckets, so it is refused there); the reader prefers it and falls back to R2_RO_* while it is unset.
export const MCP_COVERAGE_ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_LIVE_READ_ACCESS_KEY_ID', 'R2_LIVE_READ_SECRET_ACCESS_KEY', 'R2_RO_ACCESS_KEY_ID', 'R2_RO_SECRET_ACCESS_KEY', 'MCP_LIVE_BUCKET'] as const;

/** The main checkout's folder (a worktree has no tmp/ data of its own), or null outside git. */
export function mainCheckoutRoot(): string | null {
  try { return dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()); } catch { return null; }
}

export function mainCheckoutEnv(): Partial<Record<(typeof MCP_COVERAGE_ENV_KEYS)[number], string>> {
  let root: string;
  try {
    root = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim());
  } catch { return {}; }
  const file = resolve(root, '.env.local');
  if (!existsSync(file)) return {};
  const all = parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(MCP_COVERAGE_ENV_KEYS.filter(k => all[k]).map(k => [k, all[k]]));
}

/** Each Live agency's coverage file from the private bucket (privateBucket: throws without the read-only keys). */
export async function readMcpCoverage(): Promise<Record<string, LiveCoverage>> {
  const { privateBucket } = await import('./privateBucket.js');
  const bucket = privateBucket();
  const coverage: Record<string, LiveCoverage> = {};
  await Promise.all(PRODUCT_FOCUS.live.map(async slug => {
    const body = await bucket.get(`${MCP_COVERAGE_PREFIX}/${slug}/coverage.json`).catch(() => null);
    if (body) { try { coverage[slug] = JSON.parse(body) as LiveCoverage; } catch { /* an unreadable file counts as none */ } }
  }));
  return coverage;
}

async function handler(): Promise<Response> {
  try { return json({ available: true, coverage: await readMcpCoverage() }); }
  catch { return json({ available: false, coverage: {} }); }
}

export default { fetch: handler };
