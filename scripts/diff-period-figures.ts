#!/usr/bin/env npx tsx
/**
 * Lists every route, direction, day and period whose map figure differs between two runs of the
 * pipeline over the same feeds: an old rule and a new one. Read-only: it reads local files and
 * writes only the report or summary named with --out. First used for CIV-1411 (a slow first hour in
 * an unsteady period, ATLAS_SLOW_FIRST_HOUR_UNSTEADY).
 *
 * A side is a directory holding <slug>/<slug>.json (what `npm run process -- <zip> <slug> --dry-run`
 * writes under tmp/process-preview and `npm run reprocess-derived-artifacts` under
 * tmp/derived-reprocess), or a summary file written by --summary. The cloud dry run
 * (rebuild-release.yml) uploads a summary of every agency as period-figures.json, so two dry runs
 * compare without downloading any agency file.
 *
 * Run:
 *   npx tsx scripts/diff-period-figures.ts --summary=<dir> --out=<file.json>
 *   npx tsx scripts/diff-period-figures.ts --before=<dir or file.json> --after=<dir or file.json> [--out=<file.md>]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

type Figures = Record<string, number | null>;
/** One drawn row: the route's and the direction's filter value per period (what the map and its filter read). */
type Row = { route: string; day: string; direction: string; routeFigure: Figures; directionFigure: Figures };
type Summary = Record<string, Record<string, Row>>;

function summarize(dir: string): Summary {
  const out: Summary = {};
  for (const slug of readdirSync(dir).sort()) {
    const path = resolve(dir, slug, `${slug}.json`);
    if (!existsSync(path)) continue;
    const features = (JSON.parse(readFileSync(path, 'utf8')) as { features?: Array<{ properties?: Record<string, unknown> }> }).features ?? [];
    const rows: Record<string, Row> = {};
    for (const { properties: p } of features) {
      if (!p || p.routeFilterHeadwayByPeriod == null) continue;
      const route = String(p.routeShortName || p.routeLongName || p.routeId || '');
      const base = [p.routeId ?? route, p.day ?? '', p.directionId ?? '', p.headsign ?? ''].join(' | ');
      let key = base;
      for (let n = 2; rows[key]; n++) key = `${base} #${n}`;
      rows[key] = {
        route,
        day: String(p.day ?? ''),
        direction: `${p.directionId ?? ''} to ${p.headsign ?? ''}`,
        routeFigure: p.routeFilterHeadwayByPeriod as Figures,
        directionFigure: (p.directionFilterHeadwayByPeriod ?? {}) as Figures,
      };
    }
    out[slug] = rows;
  }
  return out;
}

const load = (path: string): Summary => (statSync(path).isDirectory() ? summarize(path) : JSON.parse(readFileSync(path, 'utf8')) as Summary);

const summaryDir = arg('summary');
const outPath = arg('out');
if (summaryDir) {
  if (!outPath) throw new Error('--summary needs --out=<file.json>');
  const summary = summarize(resolve(summaryDir));
  writeFileSync(resolve(outPath), JSON.stringify(summary));
  console.log(`Wrote the period figures of ${Object.keys(summary).length} agencies to ${outPath}`);
} else {
  const beforeArg = arg('before');
  const afterArg = arg('after');
  if (!beforeArg || !afterArg) throw new Error('Usage: npx tsx scripts/diff-period-figures.ts --before=<dir or file.json> --after=<dir or file.json> [--out=<file.md>]');
  const before = load(resolve(beforeArg));
  const after = load(resolve(afterArg));
  const slugs = Object.keys(after).filter(slug => before[slug]).sort();
  const oneSide = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(slug => !before[slug] || !after[slug]).sort();
  const lines: string[] = [];
  let changedRoutes = 0;
  let unmatchedRows = 0;
  for (const slug of slugs) {
    const seen = new Set<string>();
    const routes = new Set<string>();
    for (const [key, a] of Object.entries(after[slug])) {
      const b = before[slug][key];
      if (!b) { unmatchedRows++; continue; }
      for (const [who, bv, av] of [['route', b.routeFigure, a.routeFigure], [`direction ${a.direction}`, b.directionFigure, a.directionFigure]] as const) {
        for (const period of new Set([...Object.keys(bv), ...Object.keys(av)])) {
          if ((bv[period] ?? null) === (av[period] ?? null)) continue;
          const line = `| ${slug} | ${a.route} | ${a.day} | ${period} | ${who} | ${bv[period] ?? 'none'} | ${av[period] ?? 'none'} |`;
          if (seen.has(line)) continue;
          seen.add(line);
          routes.add(`${a.route} ${a.day}`);
        }
      }
    }
    unmatchedRows += Object.keys(before[slug]).filter(key => !after[slug][key]).length;
    changedRoutes += new Set([...routes].map(r => r.split(' ')[0])).size;
    lines.push(...[...seen].sort());
  }
  const report = [
    `Compared ${slugs.length} agencies: ${changedRoutes} routes with a changed period figure, ${lines.length} changed cells.`,
    ...(unmatchedRows > 0 ? [`${unmatchedRows} rows are on one side only (not compared).`] : []),
    ...(oneSide.length > 0 ? [`Agencies on one side only (not compared): ${oneSide.join(', ')}.`] : []),
    '',
    '| Agency | Route | Day | Period | Figure | Before | After |',
    '|---|---|---|---|---|---|---|',
    ...lines,
  ].join('\n');
  if (outPath) writeFileSync(resolve(outPath), `${report}\n`);
  console.log(report);
}
