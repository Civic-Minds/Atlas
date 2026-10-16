/**
 * Local only: the Live agency dashboard's data (CIV-262), the file scripts/live-agency-summary.ts writes from the route
 * analysis files. Always answers with a status; `reason` is a plain sentence (what is missing and what to do).
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { agencyHasLiveAnalysis } from '../shared/livePollingConfig.js';
import type { AgencySummary } from '../shared/liveAgency.js';

export type LiveAgencyResponse =
  | { status: 'ready'; summary: AgencySummary }
  | { status: 'no_analysis' | 'unknown_agency'; reason: string };

function json(body: LiveAgencyResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handler(req: Request): Promise<Response> {
  const agency = new URL(req.url, 'http://localhost').searchParams.get('agency')?.trim().toLowerCase();
  if (!agency) return json({ status: 'unknown_agency', reason: 'Give an agency, for example ?agency=ttc.' }, 400);
  // Whitelist: only agencies with Live analysis map to a file name (no path input reaches the filesystem).
  if (!/^[a-z0-9-]+$/.test(agency) || !agencyHasLiveAnalysis(agency)) return json({ status: 'unknown_agency', reason: `Live has no route analysis for ${agency}.` }, 404);
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  try {
    const summary = JSON.parse(await readFile(resolve(dir, `${agency}-agency.json`), 'utf8')) as AgencySummary;
    if (summary.schema !== 1) throw new Error('old file');
    return json({ status: 'ready', summary });
  } catch {
    return json({ status: 'no_analysis', reason: `No agency summary for ${agency.toUpperCase()} yet. Build it with "npx tsx scripts/live-agency-summary.ts ${agency}" after the route analyses (npm run live:analyze).` });
  }
}

export default { fetch: handler };
