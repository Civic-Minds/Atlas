/**
 * Local only: the agencies Studio's Live page offers (CIV-1828), from the route analysis files in the folder
 * (LIVE_SEGMENTS_DIR, default ../_live-data/out). An agency is listed once a route of it that is not held covers the
 * minimum days of recordings (shared/liveStudioAgencies.ts; the dev server is internal, so the shorter minimum). Only
 * names found by listing the folder are read; nothing from the request reaches the filesystem.
 */
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { dashboardHold, qualityHold, type LiveV3 } from '../shared/liveDashboard.js';
import { liveStudioAgencies, liveStudioMinDays, parseSegmentsFileName, type LiveRouteFile } from '../shared/liveStudioAgencies.js';

/** Each file's reading, kept while the file is unchanged (the files are a few MB; the menu asks on every visit). */
const seen = new Map<string, { mtimeMs: number; file: LiveRouteFile }>();

async function readRouteFile(dir: string, name: string): Promise<LiveRouteFile | null> {
  const parsed = parseSegmentsFileName(name);
  // A real agency only (its config file), so a renamed backup in the folder never adds one.
  if (!parsed || !existsSync(resolve('config/agencies', `${parsed.slug}.json`))) return null;
  const path = resolve(dir, name);
  const { mtimeMs } = await stat(path);
  const cached = seen.get(path);
  if (cached?.mtimeMs === mtimeMs) return cached.file;
  const data = JSON.parse(await readFile(path, 'utf8')) as { dates?: string[]; v3?: LiveV3 };
  const held = !data.v3 || data.v3.schema !== 3 || dashboardHold(parsed.slug, parsed.route) != null || qualityHold(data.v3) != null;
  const file: LiveRouteFile = { ...parsed, days: data.dates?.length ?? 0, held };
  seen.set(path, { mtimeMs, file });
  return file;
}

async function handler(): Promise<Response> {
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  const names = await readdir(dir).catch(() => [] as string[]);
  const files = (await Promise.all(names.map(n => readRouteFile(dir, n).catch(() => null)))).filter((f): f is LiveRouteFile => !!f);
  const minDays = liveStudioMinDays(true);
  const days: Record<string, number> = {};
  for (const f of files) if (!f.held) days[f.slug] = Math.max(days[f.slug] ?? 0, f.days);
  return new Response(JSON.stringify({ agencies: liveStudioAgencies(files, minDays), minDays, days }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default { fetch: handler };
