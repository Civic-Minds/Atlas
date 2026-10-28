/**
 * PROTOTYPE report (CIV-422 redesign): the path rule (share of the route's line in common between years, so the
 * mid-trip stops count, not just the ends) against the first prototype's long-name/terminus rule. Read-only: reads
 * the archive's v2 sidecars and period shapes, plus archived zips for agencies without sidecars; writes a local
 * Markdown report and nothing to R2.
 *   ATLAS_ENV_FILE=<env> npx tsx scripts/history-identity-path-report.ts [--zips indygo] [--out tmp/history-identity-path.md]
 */
import '../pipeline/loadEnv.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { r2GetArchive, r2GetArchiveBuffer, r2ListArchive } from '../pipeline/r2.js';
import { runWithConcurrency } from '../pipeline/utils.js';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import { extractRouteShapes } from '../pipeline/historyShapes.js';
import { historyRouteKey } from '../pipeline/historyRouteKey.js';
import { pathShareOn, sameRouteIdentity, sameRouteIdentityByName, terminiOf, type IdentityPeriod } from '../pipeline/historyRouteIdentity.js';
import { readFileSync, existsSync } from 'node:fs';
import type { HistoryPeriodShapes, HistoryV2Sidecar } from '../shared/historyV2.js';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const zipSlugs = (arg('--zips') ?? 'indygo').split(',').filter(Boolean);
const out = resolve(arg('--out') ?? 'tmp/history-identity-path.md');
const bySlug = new Map<string, Map<string, IdentityPeriod[]>>();
const add = (slug: string, key: string, p: IdentityPeriod) => {
  const routes = bySlug.get(slug) ?? bySlug.set(slug, new Map()).get(slug)!;
  (routes.get(key) ?? routes.set(key, []).get(key)!).push(p);
};

// Agencies with v2 sidecars: names from the sidecar, lines from the period's shapes file.
const keys = (await r2ListArchive('history-v2/')).filter(k => k.split('/').length === 3 && k.endsWith('.json'));
const shapeKeys = new Set((await r2ListArchive('history-v2-shapes/')).filter(k => k.split('/').length === 3));
await runWithConcurrency(keys.map(key => async () => {
  const [, slug, file] = key.split('/');
  const periodKey = file.replace('.json', '');
  const sc = JSON.parse((await r2GetArchive(key)) ?? 'null') as HistoryV2Sidecar | null;
  if (!sc || sc.version !== 2 || !sc.routes) return;
  const shapesKey = `history-v2-shapes/${slug}/${periodKey}.json`;
  const shapes = shapeKeys.has(shapesKey) ? JSON.parse((await r2GetArchive(shapesKey)) ?? 'null') as HistoryPeriodShapes | null : null;
  for (const [routeKey, rec] of Object.entries(sc.routes)) {
    const line = shapes?.routes[routeKey]?.c ?? null;
    add(slug, routeKey, { periodKey, sortKey: sc.refDate, year: Number(sc.refDate.slice(0, 4)), name: rec.name, termini: terminiOf(line), line });
  }
}), 8);

// Agencies without sidecars (IndyGo): the archived zips, read-only.
for (const slug of zipSlugs) {
  if (bySlug.has(slug)) continue;
  for (const key of (await r2ListArchive(`gtfs/archive/${slug}/`)).filter(k => k.endsWith('.zip'))) {
    const buf = await r2GetArchiveBuffer(key);
    if (!buf) continue;
    const gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer) as any;
    const lines = extractRouteShapes(gtfs);
    const names = new Map<string, string>();
    for (const r of gtfs.routes) {
      const k = historyRouteKey({ routeShortName: r.route_short_name, routeId: r.route_id, routeLongName: r.route_long_name }, { longNameFallback: true });
      if (k && !names.has(k)) names.set(k, r.route_long_name ?? '');
    }
    const periodKey = key.split('/').pop()!.replace('.zip', '');
    for (const [routeKey, shape] of lines) {
      add(slug, routeKey, { periodKey, sortKey: periodKey, year: Number(periodKey.slice(0, 4)), name: names.get(routeKey), termini: terminiOf(shape.coordinates), line: shape.coordinates });
    }
    console.log(`${slug} ${periodKey}: ${lines.size} routes`);
  }
}

const rows: string[] = [];
// Debug dump: both directions for every pair (to tune the rule).
const dump: string[] = [];
const cache = arg('--cache');
if (cache && !existsSync(cache)) writeFileSync(cache, JSON.stringify(Object.fromEntries([...bySlug].map(([s, m]) => [s, Object.fromEntries(m)]))));
const counts = { pairs: 0, pathSplits: 0, nameSplits: 0, both: 0, noLine: 0 };
for (const slug of [...bySlug.keys()].sort()) {
  for (const [routeKey, periods] of [...bySlug.get(slug)!.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const sorted = [...periods].sort((x, y) => x.sortKey.localeCompare(y.sortKey));
    for (let i = 1; i < sorted.length; i++) {
      const [prev, next] = [sorted[i - 1], sorted[i]];
      counts.pairs++;
      const path = sameRouteIdentity(prev, next);
      const byName = sameRouteIdentityByName(prev, next);
      if (path.shared == null) counts.noLine++;
      if (!path.same) counts.pathSplits++;
      if (!byName.same) counts.nameSplits++;
      if (!path.same && !byName.same) counts.both++;
      if (prev.line && next.line) dump.push([slug, routeKey, prev.year, next.year, pathShareOn(next.line, prev.line).toFixed(2), pathShareOn(prev.line, next.line).toFixed(2), byName.same ? 'n-same' : 'n-split'].join('\t'));
      if (path.same && byName.same) continue;
      rows.push(`| ${slug} | ${routeKey} | ${prev.year} -> ${next.year} | ${prev.name ?? ''} | ${next.name ?? ''} | ${path.shared == null ? 'no line' : `${Math.round(path.shared * 100)}%`} | ${byName.terminiM == null ? '' : `${(byName.terminiM / 1000).toFixed(1)} km`} | ${byName.same ? 'same' : 'split'} | ${path.same ? 'same' : 'split'} |`);
    }
  }
}
const lines = [
  '# CIV-422 redesign: path in common between years', '',
  `${counts.pairs} year-to-year pairs. Path rule splits ${counts.pathSplits}; the long-name/terminus rule split ${counts.nameSplits}; both ${counts.both}; ${counts.noLine} pairs have no line on one side (name rule decides).`, '',
  '| Agency | Route | Years | Name before | Name after | Path in common | Ends moved | Name rule | Path rule |', '|---|---|---|---|---|---|---|---|---|', ...rows, '',
];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out.replace(/\.md$/, '-pairs.tsv'), dump.join('\n'));
writeFileSync(out, lines.join('\n'));
console.log(lines.slice(0, 3).join('\n'), '->', out);
