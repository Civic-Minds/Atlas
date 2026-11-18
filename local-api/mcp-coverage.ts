/**
 * Local only (CIV-1871): what the daily mcp-live job wrote to the private bucket, for the coverage page's MCP column:
 * `live/<slug>/coverage.json` for each agency Live records (the focus list's Live set). Reads only, with the READ-ONLY keys
 * (R2_RO_ACCESS_KEY_ID, R2_RO_SECRET_ACCESS_KEY) and the bucket name (MCP_LIVE_BUCKET) from the main checkout's .env.local;
 * it never uses the write keys. Without them it answers `available: false` and the page leaves the status out.
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PRODUCT_FOCUS } from '../shared/rules/focus.js';
import { MCP_COVERAGE_PREFIX } from '../shared/coverageRows.js';
import type { LiveCoverage } from '../shared/liveCoverage.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handler(): Promise<Response> {
  const { R2_ACCOUNT_ID: account, R2_RO_ACCESS_KEY_ID: accessKeyId, R2_RO_SECRET_ACCESS_KEY: secretAccessKey, MCP_LIVE_BUCKET: bucket } = process.env;
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
