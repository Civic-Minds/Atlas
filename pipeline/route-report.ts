#!/usr/bin/env npx tsx
/**
 * route-report.ts — QA report for a processed agency's route/frequency data.
 * Usage: npm run route-report -- <slug> [--live]
 *
 * Reads tmp/process-preview/<slug>/<slug>.json by default (the output of
 * `npm run process -- ... --dry-run`). Pass --live to instead fetch the
 * currently-published data from R2 for an agency already in production.
 *
 * Prints a route x direction x day frequency table (headway by period), then
 * flags three patterns that have caused real Atlas bugs before, so a new or
 * changed feed can be checked before it's published:
 *   - minStopHeadway far below the terminal headway (Niagara 301 pattern, #241)
 *   - near-duplicate headsigns on the same route+direction (Niagara typo, #242)
 *   - shapes that needed truncation/de-interleaving during parsing (Guadalajara, #219/#244),
 *     or that show clustered implausible jumps flagged but NOT auto-repaired (Nancy Réseau Stan)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getAgencyDataUrl, PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config.js';

const rawArgs = process.argv.slice(2);
const live = rawArgs.includes('--live');
const slug = rawArgs.find(a => !a.startsWith('--'));

if (!slug) {
  console.error('Usage: npm run route-report -- <slug> [--live]');
  process.exit(1);
}

interface RouteFeature {
  type: 'Feature';
  geometry: { type: string };
  properties: {
    routeShortName?: string;
    directionId?: number;
    day?: string;
    headsign?: string | null;
    tier?: string;
    headway?: number | null;
    headwayByPeriod?: Partial<Record<PeriodKey, number | null>>;
    minStopHeadway?: number;
  };
}

interface ShapeAnomaly {
  shapeId: string;
  truncated: boolean;
  deinterleaved: boolean;
  clusteredJumps: boolean;
}

async function loadGeojson(): Promise<{ features: RouteFeature[] }> {
  const previewPath = resolve('tmp/process-preview', slug!, `${slug}.json`);
  if (!live && existsSync(previewPath)) {
    console.log(`Reading dry-run preview: ${previewPath}\n`);
    return JSON.parse(readFileSync(previewPath, 'utf8'));
  }
  const url = getAgencyDataUrl(slug!);
  console.log(`Fetching live data: ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return (await res.json()) as { features: RouteFeature[] };
}

function shapeAnomaliesPath(): string {
  return resolve('tmp/process-preview', slug!, `${slug}-shape-anomalies.json`);
}

function loadShapeAnomalies(): ShapeAnomaly[] {
  const path = shapeAnomaliesPath();
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Plain Levenshtein edit distance — used to catch near-duplicate headsigns (typos). */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

async function main() {
  const { features } = await loadGeojson();
  const routeFeatures = features.filter(
    f => f.geometry?.type === 'LineString' && f.properties?.routeShortName != null && f.properties?.directionId != null,
  );

  if (routeFeatures.length === 0) {
    console.log('No route features found — check the slug and that the preview/live data exists.');
    return;
  }

  const byRoute = new Map<string, RouteFeature[]>();
  for (const f of routeFeatures) {
    const key = f.properties.routeShortName!;
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key)!.push(f);
  }
  const sortedRoutes = [...byRoute.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  console.log(`=== Route Report: ${slug} (${sortedRoutes.length} routes, ${routeFeatures.length} route/direction/day rows) ===\n`);

  for (const route of sortedRoutes) {
    const rows = byRoute.get(route)!.sort((a, b) => {
      const d = (a.properties.directionId ?? 0) - (b.properties.directionId ?? 0);
      if (d !== 0) return d;
      return (a.properties.day ?? '').localeCompare(b.properties.day ?? '');
    });
    console.log(`Route ${route}`);
    for (const f of rows) {
      const p = f.properties;
      const periodStr = PERIOD_KEYS.map(pk => `${PERIOD_LABELS[pk]}=${p.headwayByPeriod?.[pk] ?? '-'}`).join('  ');
      console.log(
        `  dir ${p.directionId} · ${(p.day ?? '').padEnd(8)} · "${p.headsign ?? '(no headsign)'}" · tier=${p.tier} · headway=${p.headway ?? '-'}min · minStop=${p.minStopHeadway ?? '-'}min`,
      );
      console.log(`      ${periodStr}`);
    }
    console.log('');
  }

  // --- Flag (a): minStopHeadway far below the terminal headway (Niagara 301 pattern) ---
  const RATIO_THRESHOLD = 1.8;
  const mismatchFlags: string[] = [];
  for (const f of routeFeatures) {
    const p = f.properties;
    if (p.headway == null || p.minStopHeadway == null || p.minStopHeadway <= 0) continue;
    if (p.headway >= p.minStopHeadway * RATIO_THRESHOLD) {
      mismatchFlags.push(
        `  Route ${p.routeShortName} dir ${p.directionId} (${p.day}, "${p.headsign ?? '?'}"): terminal headway ${p.headway}min but some stop sees ${p.minStopHeadway}min (${(p.headway / p.minStopHeadway).toFixed(1)}x)`,
      );
    }
  }

  // --- Flag (b): near-duplicate headsigns on the same route+direction (Niagara typo pattern) ---
  const headsignFlags: string[] = [];
  const headsignsByRouteDir = new Map<string, Set<string>>();
  for (const f of routeFeatures) {
    const p = f.properties;
    if (!p.headsign) continue;
    const key = `${p.routeShortName}::${p.directionId}`;
    if (!headsignsByRouteDir.has(key)) headsignsByRouteDir.set(key, new Set());
    headsignsByRouteDir.get(key)!.add(p.headsign);
  }
  for (const [key, headsigns] of headsignsByRouteDir) {
    const list = [...headsigns];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = normalize(list[i]);
        const b = normalize(list[j]);
        if (a === b) continue;
        const dist = editDistance(a, b);
        const maxLen = Math.max(a.length, b.length);
        if (dist > 0 && dist <= 3 && dist / maxLen < 0.3) {
          const [route, dir] = key.split('::');
          headsignFlags.push(`  Route ${route} dir ${dir}: "${list[i]}" vs "${list[j]}" (edit distance ${dist})`);
        }
      }
    }
  }

  // --- Flag (c): shapes that needed correction during parsing (Guadalajara pattern) ---
  const anomalyFileExists = existsSync(shapeAnomaliesPath());
  const shapeAnomalies = loadShapeAnomalies();

  console.log('=== Anomaly Flags ===\n');
  console.log(`Headway mismatch (minStopHeadway vs terminal headway, ratio >= ${RATIO_THRESHOLD}x): ${mismatchFlags.length}`);
  mismatchFlags.forEach(f => console.log(f));
  console.log('');
  console.log(`Near-duplicate headsigns per route+direction: ${headsignFlags.length}`);
  headsignFlags.forEach(f => console.log(f));
  console.log('');
  if (live) {
    console.log('Shapes needing correction during parsing: unavailable in --live mode (only captured by a --dry-run process run)');
  } else if (!anomalyFileExists) {
    console.log('Shapes needing correction during parsing: no anomalies file found — re-run "npm run process -- ... --dry-run" to regenerate it (older previews predate this check)');
  } else {
    console.log(`Shapes needing correction during parsing: ${shapeAnomalies.length}`);
    for (const a of shapeAnomalies) {
      const kinds = [
        a.truncated && 'truncated at implausible jump',
        a.deinterleaved && 'de-interleaved duplicate sequences',
        a.clusteredJumps && 'clustered jumps detected (NOT auto-repaired — two interleaved sub-paths, needs manual review)',
      ]
        .filter(Boolean)
        .join(' + ');
      console.log(`  shape_id=${a.shapeId}: ${kinds}`);
    }
  }

  const totalFlags = mismatchFlags.length + headsignFlags.length + shapeAnomalies.length;
  console.log(`\n${totalFlags === 0 ? 'No anomalies flagged.' : `${totalFlags} total anomaly flag(s) — review before publishing.`}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
