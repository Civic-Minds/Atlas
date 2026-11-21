/**
 * Local only: the Live agency dashboard's data (CIV-262), the file scripts/live-agency-summary.ts writes from the route
 * analysis files. Always answers with a status; `reason` is a plain sentence (what is missing and what to do).
 */
import { readFile, readdir, stat } from 'fs/promises';
import { resolve } from 'path';
import { agencyHasLiveAnalysis } from '../shared/livePollingConfig.js';
import type { AgencySummary } from '../shared/liveAgency.js';
import { liveAgencyName } from './agencyName.js';
import { liveNoAgencyAnalysis } from '../src/content/noticeCopy';

export type LiveAgencyResponse =
  | { status: 'ready'; summary: AgencySummary }
  | { status: 'no_analysis' | 'unknown_agency'; reason: string };

function json(body: LiveAgencyResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handler(req: Request): Promise<Response> {
  const agency = new URL(req.url, 'http://localhost').searchParams.get('agency')?.trim().toLowerCase();
  if (!agency) return json({ status: 'unknown_agency', reason: 'Give an agency, for example ?agency=ttc.' }, 400);
  // Whitelist: an agency with Live analysis, or one whose summary file is in the folder listing (CIV-1828: Studio's
  // agencies, Kingston). Only a name found in the listing reaches the filesystem, never the request's text.
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  const listed = /^[a-z0-9-]+$/.test(agency) && (await readdir(dir).catch(() => [] as string[])).includes(`${agency}-agency.json`);
  if (!/^[a-z0-9-]+$/.test(agency) || !(agencyHasLiveAnalysis(agency) || listed)) return json({ status: 'unknown_agency', reason: liveNoAgencyAnalysis(await liveAgencyName(agency)) }, 404);
  try {
    const file = resolve(dir, `${agency}-agency.json`);
    const summary = JSON.parse(await readFile(file, 'utf8')) as AgencySummary;
    if (summary.schema !== 1) throw new Error('old file');
    // A summary older than any route file beside it describes routes that have since been re-run: treat it as missing.
    const built = (await stat(file)).mtimeMs;
    const routeFiles = (await readdir(dir)).filter(f => f.startsWith(`${agency}-`) && f.endsWith('-segments.json'));
    for (const f of routeFiles) if ((await stat(resolve(dir, f))).mtimeMs > built) throw new Error('stale summary');
    return json({ status: 'ready', summary });
  } catch {
    return json({ status: 'no_analysis', reason: `No agency summary for ${await liveAgencyName(agency)} yet. Build it with "npx tsx scripts/live-agency-summary.ts ${agency}" after the route analyses (npm run live:analyze).` });
  }
}

export default { fetch: handler };
