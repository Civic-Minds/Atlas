/**
 * PROTOTYPE report (CIV-422): where the long-name/terminus rule would cut a History route key into
 * different routes. Read-only: lists and reads the archive's v2 sidecars and period shapes, writes a
 * Markdown report locally, and writes nothing to R2.
 *   npx tsx scripts/history-identity-report.ts [--only-slug indygo] [--out tmp/history-identity-report.md]
 */
import '../pipeline/loadEnv.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { r2GetArchive, r2ListArchive } from '../pipeline/r2.js';
import { runWithConcurrency } from '../pipeline/utils.js';
import { splitRouteHistory, terminiOf, type IdentityPeriod } from '../pipeline/historyRouteIdentity.js';
import type { HistoryPeriodShapes, HistoryV2Sidecar } from '../shared/historyV2.js';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const onlySlug = arg('--only-slug');
const out = resolve(arg('--out') ?? 'tmp/history-identity-report.md');
// The cases the rule is meant to catch (CIV-422).
const TARGETS: Record<string, string[]> = { indygo: ['19', '18', '16', '56', '4', '901'] };

const keys = (await r2ListArchive('history-v2/')).filter(k => k.split('/').length === 3 && k.endsWith('.json') && (!onlySlug || k.split('/')[1] === onlySlug));
const shapeKeys = new Set((await r2ListArchive('history-v2-shapes/')).filter(k => k.split('/').length === 3));
console.log(`${keys.length} sidecars, ${shapeKeys.size} shape files`);

// slug -> route key -> periods
const bySlug = new Map<string, Map<string, IdentityPeriod[]>>();
await runWithConcurrency(keys.map(key => async () => {
  const [, slug, file] = key.split('/');
  const periodKey = file.replace('.json', '');
  const raw = await r2GetArchive(key);
  if (!raw) return;
  const sc = JSON.parse(raw) as HistoryV2Sidecar;
  if (sc.version !== 2 || !sc.routes) return;
  const shapesKey = `history-v2-shapes/${slug}/${periodKey}.json`;
  const shapes = shapeKeys.has(shapesKey) ? JSON.parse((await r2GetArchive(shapesKey)) ?? 'null') as HistoryPeriodShapes | null : null;
  const routes = bySlug.get(slug) ?? new Map<string, IdentityPeriod[]>();
  bySlug.set(slug, routes);
  for (const [routeKey, rec] of Object.entries(sc.routes)) {
    const list = routes.get(routeKey) ?? [];
    list.push({
      periodKey,
      sortKey: sc.refDate,
      year: Number(sc.refDate.slice(0, 4)),
      name: rec.name,
      termini: terminiOf(shapes?.routes[routeKey]?.c),
    });
    routes.set(routeKey, list);
  }
}), 8);

const lines: string[] = ['# CIV-422 prototype: route keys the long-name/terminus rule would split', ''];
let splitKeys = 0;
let totalKeys = 0;
const rows: string[] = [];
for (const slug of [...bySlug.keys()].sort()) {
  for (const [routeKey, periods] of [...bySlug.get(slug)!.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    totalKeys++;
    const { splits } = splitRouteHistory(periods, routeKey);
    if (splits.length === 0) continue;
    splitKeys++;
    for (const s of splits) {
      rows.push(`| ${slug} | ${routeKey} | ${s.fromYear} -> ${s.toYear} | ${s.before} | ${s.after} | ${s.verdict.terminiM == null ? 'no line' : `${(s.verdict.terminiM / 1000).toFixed(1)} km`} | ${s.verdict.reason} |`);
    }
  }
}
lines.push(`${splitKeys} of ${totalKeys} route keys split (${bySlug.size} agencies).`, '');
for (const [slug, targets] of Object.entries(TARGETS)) {
  if (!bySlug.has(slug)) continue;
  lines.push(`## Target cases (${slug})`, '');
  for (const t of targets) {
    const periods = bySlug.get(slug)!.get(t);
    const splits = periods ? splitRouteHistory(periods).splits : [];
    lines.push(`- ${t}: ${!periods ? 'no history' : splits.length ? splits.map(s => `split ${s.fromYear} -> ${s.toYear} ("${s.before}" -> "${s.after}")`).join('; ') : `not split (names: ${[...new Set(periods.map(p => p.name))].join(' / ')})`}`);
  }
  lines.push('');
}
lines.push('## Every split', '', '| Agency | Route | Years | Name before | Name after | Termini moved | Why |', '|---|---|---|---|---|---|---|', ...rows, '');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n'));
console.log(`${splitKeys} of ${totalKeys} route keys split -> ${out}`);
