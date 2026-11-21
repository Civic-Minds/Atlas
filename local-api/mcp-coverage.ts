/**
 * Local only (CIV-1871): what the daily mcp-live job wrote to the private bucket, for the coverage page's MCP column:
 * `live/<slug>/coverage.json` for each agency Live records (the focus list's Live set). Reads only, with the READ-ONLY keys
 * (R2_RO_ACCESS_KEY_ID, R2_RO_SECRET_ACCESS_KEY), the bucket name (MCP_LIVE_BUCKET) and the account (R2_ACCOUNT_ID). They are
 * read from the main checkout's .env.local, because a worktree's .env.local has no R2 keys on purpose, and only those four
 * are picked out of it: the write keys are never read into this process. Without them it answers `available: false` and
 * the page leaves the status out.
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
export const MCP_COVERAGE_ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_RO_ACCESS_KEY_ID', 'R2_RO_SECRET_ACCESS_KEY', 'MCP_LIVE_BUCKET'] as const;

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

async function handler(): Promise<Response> {
  const { R2_ACCOUNT_ID: account, R2_RO_ACCESS_KEY_ID: accessKeyId, R2_RO_SECRET_ACCESS_KEY: secretAccessKey, MCP_LIVE_BUCKET: bucket } = mainCheckoutEnv();
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return json({ available: false, coverage: {} });
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  const coverage: Record<string, LiveCoverage> = {};
  await Promise.all(PRODUCT_FOCUS.live.map(async slug => {
    try {
      const body = await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${MCP_COVERAGE_PREFIX}/${slug}/coverage.json` }))).Body!.transformToString();
      coverage[slug] = JSON.parse(body) as LiveCoverage;
    } catch { /* no file, or no access: that agency's status stays out */ }
  }));
  return json({ available: true, coverage });
}

export default { fetch: handler };
