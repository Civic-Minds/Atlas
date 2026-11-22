/**
 * Live's route analysis for one archived agency (not the TTC), shared by the hosted MCP's private files
 * (scripts/mcp/releaseLivePrivate.ts, CIV-1860) and Studio's daily Live files (scripts/studio-live-cloud.ts, CIV-2077).
 * Fetches the agency's archived positions, the timetable for each service date, and runs live-segment-delay.ts for every
 * route in the archive. Every child runs through `run`, so the caller decides where its output goes (a private log in
 * the cloud: this repository is public).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { readCsv } from './live-agency-summary';
import type { LiveV3 } from '../shared/liveDashboard';

export type RunScript = (script: string, args: string[]) => boolean;

export class LiveBuildFailed extends Error {}

export interface ArchivedAgencyAnalysis {
  /** Where the analysis files are: `<slug>-<route>-segments.json` and `<slug>-agency.json`. */
  outDir: string;
  /** The timetable folders used, oldest first. */
  feedDirs: string[];
  /** route_id -> the route number riders know (route_short_name). */
  shortOf: Map<string, string>;
  /** Every route analysed, by the archive's route_id: its segments file and what it holds. */
  routes: Map<string, { file: string; generatedAt?: string; v3?: LiveV3 }>;
}

export function analyseArchivedAgency(slug: string, opts: { work: string; days: number; run: RunScript }): ArchivedAgencyAnalysis {
  const { work, days, run } = opts;
  const archive = join(work, `archive-${slug}`), feeds = join(work, 'gtfs', 'candidates', `${slug}-feeds`), outDir = join(work, 'out');
  mkdirSync(outDir, { recursive: true });
  if (!run('scripts/live-fetch-archive.ts', ['--agency', slug, '--days', String(days), '--out', archive, '--prune'])) throw new LiveBuildFailed('fetch');
  if (!run('scripts/live-gtfs-for-window.ts', ['--agency', slug, '--days', String(days), '--feeds-dir', feeds, '--archive', archive])) throw new LiveBuildFailed('timetables');
  const feedDirs = existsSync(feeds) ? readdirSync(feeds).map(d => join(feeds, d)).filter(d => existsSync(join(d, 'trips.txt'))).sort() : [];
  if (!feedDirs.length) throw new LiveBuildFailed('timetables');
  const gtfs = feedDirs.join(',');
  // The archive and the analysis key routes by the live feed's route_id; answers use the route number riders know.
  const shortOf = new Map<string, string>();
  for (const d of feedDirs) for (const r of readCsv(readFileSync(join(d, 'routes.txt'), 'utf8'))) shortOf.set(r.route_id, r.route_short_name || r.route_id);
  const archived = [...new Set(readdirSync(archive).map(f => f.match(/^(.+)-\d{4}-\d{2}-\d{2}\.jsonl$/)?.[1]).filter((r): r is string => !!r && /^[A-Za-z0-9]+$/.test(r)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const routes = new Map<string, { file: string; generatedAt?: string; v3?: LiveV3 }>();
  for (const route of archived) {
    const file = join(outDir, `${slug}-${route}-segments.json`);
    if (!run('scripts/live-segment-delay.ts', ['--gtfs', gtfs, '--archive', archive, '--route', route, '--days', String(days), '--agency', slug, '--out', file])) continue;
    const r = JSON.parse(readFileSync(file, 'utf8')) as { generatedAt?: string; v3?: LiveV3 };
    routes.set(route, { file, generatedAt: r.generatedAt, v3: r.v3 });
  }
  return { outDir, feedDirs, shortOf, routes };
}
