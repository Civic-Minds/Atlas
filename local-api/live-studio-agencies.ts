/**
 * Local only: the agencies Studio's Live page offers (CIV-1828), from the route analysis files: the cloud's published files,
 * or LIVE_SEGMENTS_DIR when set (local-api/liveFiles.ts, CIV-2186). An agency is listed once a route of it that is not held covers the
 * minimum days of recordings (shared/liveStudioAgencies.ts; the dev server is internal, so the shorter minimum). Only
 * names found by listing the folder are read; nothing from the request reaches the filesystem.
 */
import { existsSync } from 'fs';
import { liveFiles, type LiveFiles } from './liveFiles.js';
import { resolve } from 'path';
import { dashboardHold, qualityHold, type LiveV3 } from '../shared/liveDashboard.js';
import { liveStudioAgencies, liveStudioMinDays, parseSegmentsFileName, type LiveRouteFile } from '../shared/liveStudioAgencies.js';
import { liveAgencyCoverage, type LiveAgencyCoverage } from '../shared/liveCore.js';
import { LIVE_AGENCY_SLUGS } from '../shared/livePollingConfig.js';

/** Each file's reading, kept while the file is unchanged (the files are a few MB; the menu asks on every visit). */
const seen = new Map<string, { stamp: string; file: LiveRouteFile }>();

async function readRouteFile(files: LiveFiles, name: string): Promise<LiveRouteFile | null> {
  const parsed = parseSegmentsFileName(name);
  // A real agency only (its config file), so a renamed backup in the folder never adds one.
  if (!parsed || !existsSync(resolve('config/agencies', `${parsed.slug}.json`))) return null;
  const stamp = await files.stamp(name);
  const cached = seen.get(name);
  if (stamp != null && cached?.stamp === stamp) return cached.file;
  const raw = await files.read(name);
  if (raw == null) return null;
  const data = JSON.parse(raw) as { dates?: string[]; v3?: LiveV3 };
  const held = !data.v3 || data.v3.schema !== 3 || dashboardHold(parsed.slug, parsed.route) != null || qualityHold(data.v3) != null;
  const file: LiveRouteFile = { ...parsed, days: data.dates?.length ?? 0, held };
  if (stamp != null) seen.set(name, { stamp, file });
  return file;
}

async function handler(): Promise<Response> {
  const source = liveFiles();
  const names = await source.list();
  const files = (await Promise.all(names.map(n => readRouteFile(source, n).catch(() => null)))).filter((f): f is LiveRouteFile => !!f);
  const minDays = liveStudioMinDays(true);
  // #1922: an agency whose summary isn't published opens to nothing (the cloud reader answers 404), so it isn't offered.
  const summaries = new Set(names.filter(n => n.endsWith('-agency.json')).map(n => n.slice(0, -'-agency.json'.length)));
  const days: Record<string, number> = {};
  // Days recorded per agency, held routes included (CIV-2173: the Status page's progress towards the minimum).
  for (const f of files) days[f.slug] = Math.max(days[f.slug] ?? 0, f.days);
  const agencies = liveStudioAgencies(files, minDays).filter(s => summaries.has(s));
  // CIV-3173: each agency's Live coverage from the core (vehicles on the map, weekly figures here), for every agency on either list.
  const coverage: Record<string, LiveAgencyCoverage> = {};
  for (const s of new Set([...LIVE_AGENCY_SLUGS, ...agencies])) coverage[s] = liveAgencyCoverage(s, agencies);
  return new Response(JSON.stringify({ agencies, minDays, days, coverage }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default { fetch: handler };
