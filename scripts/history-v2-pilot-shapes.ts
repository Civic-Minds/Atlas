#!/usr/bin/env npx tsx
/**
 * Local-only: build History v2 route shapes for one pilot from archived zips and an agency-level
 * v2 file (the pilot's `{slug}-v2-agency.json`). No network, no R2.
 *
 *   npx tsx scripts/history-v2-pilot-shapes.ts --slug marta --zip-dir <dir of zips> \
 *     --agency-file <.../marta-v2-agency.json> --out-dir <pilot out dir> [--raw-cache <dir>] [--tolerance-m 15] [--decimals 5]
 *
 * All four pilots at once, from the scratchpad layout used by `npm run history-v2:fixtures`
 * (`{root}/{marta,denver,indygo,lacmta}-zips` and `-out`; output lands beside each `{slug}-v2-agency.json`):
 *   npm run history-v2:pilot-shapes -- --pilots [<root>]
 *
 * Writes `{out-dir}/history-v2-shapes/{slug}/{periodKey}.json` (one object per zip, same layout the v2 backfill
 * writes with --shapes) and `{out-dir}/{slug}-v2-shapes.json` (the agency file the UI reads; see
 * docs/data/DATA_HISTORY.md "Route shapes"). `--raw-cache` keeps each zip's full-resolution extraction so
 * later runs (other tolerances) skip the GTFS parse. The zips are untrusted data: only read, never executed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import {
  buildPeriodShapes, compileAgencyShapes, extractRouteShapes, periodShapesKey,
  HISTORY_SHAPE_DECIMALS, HISTORY_SHAPE_TOLERANCE_M, type RouteShape, type ShapeRouteYear,
} from '../pipeline/historyShapes.js';
import type { HistoryPeriodShapes } from '../shared/historyV2.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Full-resolution extraction for one zip, from the raw cache when present. */
export async function extractZip(zipPath: string, cacheFile?: string): Promise<Map<string, RouteShape>> {
  if (cacheFile && existsSync(cacheFile)) {
    return new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, RouteShape>));
  }
  const buf = readFileSync(zipPath);
  const gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const extracted = extractRouteShapes(gtfs as never);
  if (cacheFile) {
    mkdirSync(resolve(cacheFile, '..'), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(extracted)));
  }
  return extracted;
}

const DEFAULT_ROOT = '/private/tmp/claude-501/-Users-ryan/313c5ad2-816b-47fe-8c90-4f722b49b7de/scratchpad';
const PILOTS: Array<{ slug: string; dir: string }> = [
  { slug: 'marta', dir: 'marta' }, { slug: 'rtd-denver', dir: 'denver' }, { slug: 'indygo', dir: 'indygo' }, { slug: 'lacmta', dir: 'lacmta' },
];

async function buildPilot(slug: string, zipDir: string, agencyFile: string, outDir: string, rawCache: string | undefined, opts: { toleranceM: number; decimals: number }): Promise<void> {
  const agency = JSON.parse(readFileSync(resolve(agencyFile), 'utf8')) as {
    routes: Array<{ routeShortName: string; snapshots: Array<{ year: number; periodKey?: string; v2?: { refDate: string } }> }>;
  };
  const routeYears: ShapeRouteYear[] = [];
  const refDates = new Map<string, string>();
  for (const r of agency.routes) {
    for (const s of r.snapshots) {
      if (!s.periodKey) continue;
      routeYears.push({ routeKey: r.routeShortName, year: s.year, periodKey: s.periodKey });
      if (s.v2?.refDate) refDates.set(s.periodKey, s.v2.refDate);
    }
  }
  const periods = new Map<string, HistoryPeriodShapes>();
  for (const zip of readdirSync(resolve(zipDir)).filter(f => f.endsWith('.zip')).sort()) {
    const periodKey = basename(zip, '.zip');
    const extracted = await extractZip(resolve(zipDir, zip), rawCache ? join(resolve(rawCache), `${periodKey}.json`) : undefined);
    const period = buildPeriodShapes(slug, periodKey, refDates.get(periodKey) ?? periodKey, extracted, opts);
    periods.set(periodKey, period);
    const path = resolve(outDir, periodShapesKey(slug, periodKey));
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(period));
    console.log(`${zip}: ${Object.keys(period.routes).length} routes with a shape (${[...extracted.values()].filter(s => s.approximate).length} from stops)`);
  }
  const { file, stats } = compileAgencyShapes(slug, periods, routeYears);
  const out = resolve(outDir, `${slug}-v2-shapes.json`);
  writeFileSync(out, JSON.stringify(file));
  console.log(`${out}: ${stats.withShape}/${stats.routeYears} route-years with a shape, ${stats.distinctShapes} stored lines, ${stats.reused} reused`);
}

async function main(): Promise<void> {
  const opts = {
    toleranceM: Number(arg('--tolerance-m') ?? HISTORY_SHAPE_TOLERANCE_M),
    decimals: Number(arg('--decimals') ?? HISTORY_SHAPE_DECIMALS),
  };
  const rawCache = arg('--raw-cache');
  const pilotsIdx = process.argv.indexOf('--pilots');
  if (pilotsIdx >= 0) {
    const next = process.argv[pilotsIdx + 1];
    const root = resolve(next && !next.startsWith('--') ? next : DEFAULT_ROOT);
    for (const p of PILOTS) {
      const agencyFile = join(root, `${p.dir}-out`, `${p.dir}-v2-agency.json`);
      if (!existsSync(agencyFile) || !existsSync(join(root, `${p.dir}-zips`))) { console.warn(`skip ${p.slug}: ${agencyFile} or zips not found`); continue; }
      await buildPilot(p.slug, join(root, `${p.dir}-zips`), agencyFile, join(root, `${p.dir}-out`), rawCache ? join(resolve(rawCache), p.slug) : undefined, opts);
    }
    return;
  }
  const slug = arg('--slug');
  const zipDir = arg('--zip-dir');
  const agencyFile = arg('--agency-file');
  const outDir = arg('--out-dir');
  if (!slug || !zipDir || !agencyFile || !outDir) throw new Error('Usage: history-v2-pilot-shapes.ts --pilots [<root>] | --slug <slug> --zip-dir <dir> --agency-file <file> --out-dir <dir> [--raw-cache <dir>] [--tolerance-m N] [--decimals N]');
  await buildPilot(slug, zipDir, agencyFile, outDir, rawCache, opts);
}

if (process.argv[1] && /history-v2-pilot-shapes\.ts$/.test(process.argv[1])) {
  main().catch(error => { console.error(error); process.exit(1); });
}
