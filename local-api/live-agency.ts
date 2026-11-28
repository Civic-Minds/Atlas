/**
 * Local only: the Live agency dashboard's data (CIV-262), the file scripts/live-agency-summary.ts writes from the route
 * analysis files. Always answers with a status; `reason` is a plain sentence (what is missing and what to do).
 */
import { liveFiles } from './liveFiles.js';
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
  // The cloud's published files, or LIVE_SEGMENTS_DIR when set (CIV-2186).
  const files = liveFiles();
  const listed = /^[a-z0-9-]+$/.test(agency) && (await files.list()).includes(`${agency}-agency.json`);
  if (!/^[a-z0-9-]+$/.test(agency) || !(agencyHasLiveAnalysis(agency) || listed)) return json({ status: 'unknown_agency', reason: liveNoAgencyAnalysis(await liveAgencyName(agency)) }, 404);
  try {
    const file = `${agency}-agency.json`;
    const raw = await files.read(file);
    if (raw == null) throw new Error('no file');
    const summary = JSON.parse(raw) as AgencySummary;
    if (summary.schema !== 1) throw new Error('old file');
    // A summary older than any route file beside it describes routes that have since been re-run: treat it as missing. In a
    // folder the stamps are modified times; in the cloud an agency's files share one run, so its summary is never older.
    const built = Number(await files.stamp(file));
    const routeFiles = (await files.list()).filter(f => f.startsWith(`${agency}-`) && f.endsWith('-segments.json'));
    if (Number.isFinite(built)) for (const f of routeFiles) if (Number(await files.stamp(f)) > built) throw new Error('stale summary');
    return json({ status: 'ready', summary });
  } catch {
    return json({ status: 'no_analysis', reason: `No agency summary for ${await liveAgencyName(agency)} yet.` });
  }
}

export default { fetch: handler };
