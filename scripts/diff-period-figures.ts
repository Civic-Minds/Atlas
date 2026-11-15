#!/usr/bin/env npx tsx
/**
 * Lists every route, direction, day and period whose map figure, steady flag or longest gap differs
 * between two runs of the pipeline over the same feeds: an old rule and a new one. Read-only: it
 * reads local files and writes only the report or summary named with --out. First used for CIV-1411
 * (a slow start read as "every N from <time>", ATLAS_SLOW_START_FROM).
 *
 * A side is a directory holding <slug>/<slug>.json (what `npm run process -- <zip> <slug> --dry-run`
 * writes under tmp/process-preview and `npm run reprocess-derived-artifacts` under
 * tmp/derived-reprocess), or a summary file written by --summary. The cloud dry run
 * (rebuild-release.yml) uploads a summary of every agency as period-figures.json, so two dry runs
 * compare without downloading any agency file.
 *
 * Compared, for every day type, direction and period: the route's filter figure, the direction's
 * filter figure (a figure going from none to a value, or the reverse, is a change), the row's steady
 * flag and its longest gap. A summary written before the last two were added compares the figures only. Card edges ("every 4 from 7:28", CIV-1411) and each stretch's own edge are compared as text.
 * Section colours' per-stop values (stretchStopPeriodValues, kept in <slug>-sections.json beside the
 * route file) are summarized as encoded, with the stop order they run along, and compared stop by stop
 * (CIV-1606): per agency and period, how many stops' values went up (a longer wait) or down, then one
 * line per changed stop. A summary written before they were added skips this comparison.
 * The report starts with a summary (routes changed per agency, how many route figures got shorter or
 * longer, how many crossed 15 minutes or another tier boundary), then one line per change, by agency
 * and then by the size of the change.
 *
 * Run:
 *   npx tsx scripts/diff-period-figures.ts --summary=<dir> --out=<file.json>
 *   npx tsx scripts/diff-period-figures.ts --before=<dir or file.json> --after=<dir or file.json> [--out=<file.md>]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyAgencySections, type AgencySections } from '../shared/agencySections.js';
import { HEADWAY_TIERS, PERIOD_KEYS } from '../shared/config.js';
import { decodeStopRuns } from '../shared/stopRuns.js';

type Figures = Record<string, number | null | undefined>;
type Flags = Record<string, boolean | null | undefined>;
type Texts = Record<string, string | null | undefined>;
/** One drawn row: the route's and the direction's filter value per period (what the map and its filter read), and the row's own steady flag and longest gap (what its card reads). */
export type Row = { route: string; day: string; direction: string; routeFigure: Figures; directionFigure: Figures; steady?: Flags; longestGap?: Figures; edge?: Texts; stretchEdges?: Texts;
  /** The section colours' value per stop and period, run-length encoded as the pipeline writes it, and the stops it runs along. */
  stopValues?: Texts; stopOrder?: string[] };
export type Summary = Record<string, Record<string, Row>>;

export function summarizeFeatures(features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>): Record<string, Row> {
  const rows: Record<string, Row> = {};
  for (const { properties: p } of features) {
    // Every route row, with a route figure or without one: a row that gains or loses its figure is a change.
    if (!p || p.routeId == null || p.stopId != null) continue;
    const route = String(p.routeShortName || p.routeLongName || p.routeId || '');
    const base = [p.routeId ?? route, p.day ?? '', p.directionId ?? '', p.headsign ?? ''].join(' | ');
    let key = base;
    for (let n = 2; rows[key]; n++) key = `${base} #${n}`;
    rows[key] = {
      route,
      day: String(p.day ?? ''),
      direction: `${p.directionId ?? ''} to ${p.headsign ?? ''}`,
      routeFigure: (p.routeFilterHeadwayByPeriod ?? {}) as Figures,
      directionFigure: (p.directionFilterHeadwayByPeriod ?? {}) as Figures,
      steady: (p.headwayByPeriodSustained ?? {}) as Flags,
      longestGap: (p.maxGapByPeriod ?? {}) as Figures,
      edge: edgeTexts(p.stretchPeriodEdge as EdgeMap | undefined),
      stretchEdges: stretchEdgeTexts(p.stretchMeta as StretchMeta | undefined),
      stopValues: (p.stretchStopPeriodValues ?? {}) as Texts,
      ...(p.stretchStopPeriodValues ? { stopOrder: ((p.fullStopOrder ?? p.stopOrder ?? []) as unknown[]).map(String) } : {}),
    };
  }
  return rows;
}

type Edge = { from?: number; until?: number; every: number; stretch?: 'main' | number };
type EdgeMap = Partial<Record<string, Edge>>;
type StretchMeta = { main?: { edge?: EdgeMap } | null; tails?: Array<{ edge?: EdgeMap }> };
const clock = (m: number) => { const t = Math.round(m) % 1440; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** The card's period edge as words ("every 4 from 7:28"), so a change in its time or spacing is one line. */
export const edgeText = (e: Edge) => `every ${e.every} ${e.from != null ? `from ${clock(e.from)}` : `until ${clock(e.until ?? 0)}`}${e.stretch != null ? ` (${e.stretch === 'main' ? 'main' : `branch ${e.stretch}`})` : ''}`;
function edgeTexts(edges: EdgeMap | undefined): Texts {
  return Object.fromEntries(Object.entries(edges ?? {}).filter(([, e]) => e).map(([k, e]) => [k, edgeText(e!)]));
}
/** Each stretch's own edge (CIV-1251), the branch rows' words, joined per period. */
function stretchEdgeTexts(meta: StretchMeta | undefined): Texts {
  const out: Record<string, string[]> = {};
  const add = (label: string, edges: EdgeMap | undefined) => {
    for (const [k, e] of Object.entries(edges ?? {})) if (e) (out[k] ??= []).push(`${label}: ${edgeText(e)}`);
  };
  add('main', meta?.main?.edge);
  (meta?.tails ?? []).forEach((t, i) => add(`branch ${i}`, t.edge));
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('; ')]));
}

function summarize(dir: string): Summary {
  const out: Summary = {};
  for (const slug of readdirSync(dir).sort()) {
    const path = resolve(dir, slug, `${slug}.json`);
    if (!existsSync(path)) continue;
    const features = (JSON.parse(readFileSync(path, 'utf8')) as { features?: Array<{ properties?: Record<string, unknown> }> }).features ?? [];
    // The section colours' fields live in the sections file; put them back on their features first.
    const sectionsPath = resolve(dir, slug, `${slug}-sections.json`);
    const sections = existsSync(sectionsPath) ? JSON.parse(readFileSync(sectionsPath, 'utf8')) as AgencySections : null;
    out[slug] = summarizeFeatures(applyAgencySections(features, sections));
  }
  return out;
}

const TIER_MAXES = HEADWAY_TIERS.map(t => t.max).filter(Number.isFinite);
const tierOf = (v: number) => TIER_MAXES.filter(max => v > max).length;

type What = 'route figure' | 'direction figure' | 'steady' | 'longest gap' | 'card edge' | 'stretch edges';
/** One stop whose section-colour value changed in one period. */
export type StopChange = { slug: string; route: string; day: string; direction: string; period: string; stopId: string; before: number | null; after: number | null };

/** The stops whose value differs between two rows, matched by stop id (the n-th visit of a stop to its n-th visit). */
export function diffStopValues(slug: string, b: Row, a: Row): StopChange[] {
  const out: StopChange[] = [];
  const bv = b.stopValues ?? {};
  const av = a.stopValues ?? {};
  const visits = (order: readonly string[] | undefined) => {
    const seen = new Map<string, number>();
    return (order ?? []).map(id => { const n = (seen.get(id) ?? 0) + 1; seen.set(id, n); return n > 1 ? `${id}#${n}` : id; });
  };
  const bKeys = visits(b.stopOrder);
  const aKeys = visits(a.stopOrder);
  for (const period of [...new Set([...PERIOD_KEYS, ...Object.keys(bv), ...Object.keys(av)])].filter(k => (bv[k] ?? null) !== (av[k] ?? null))) {
    const bDecoded = decodeStopRuns(bv[period]);
    const bVals = new Map(bKeys.map((k, i) => [k, bDecoded[i] ?? null] as const));
    const aDecoded = decodeStopRuns(av[period]);
    const aVals = new Map(aKeys.map((k, i) => [k, aDecoded[i] ?? null] as const));
    for (const key of [...new Set([...aKeys, ...bKeys])]) {
      const from = bVals.get(key) ?? null;
      const to = aVals.get(key) ?? null;
      if (from !== to) out.push({ slug, route: a.route, day: a.day, direction: a.direction, period, stopId: key, before: from, after: to });
    }
  }
  return out;
}

export type Change = { slug: string; route: string; day: string; direction: string; period: string; what: What; before: number | boolean | string | null; after: number | boolean | string | null };

/** Largest first: a figure gained or lost, then by minutes changed; a flag change last. */
const size = (c: Change) => (typeof c.before !== 'number' && c.before != null) || (typeof c.after !== 'number' && c.after != null) ? 0
  : (c.before == null || c.after == null ? Infinity : Math.abs((c.after as number) - (c.before as number)));

export function diffSummaries(before: Summary, after: Summary): { report: string; changes: Change[]; stopChanges: StopChange[] } {
  const slugs = Object.keys(after).filter(slug => before[slug]).sort();
  const oneSide = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(slug => !before[slug] || !after[slug]).sort();
  const changes: Change[] = [];
  let unmatchedRows = 0;
  let figuresOnly = false;
  let noStopValues = false;
  const stopChanges: StopChange[] = [];
  for (const slug of slugs) {
    const seenRoute = new Set<string>();
    for (const [key, a] of Object.entries(after[slug])) {
      const b = before[slug][key];
      if (!b) { unmatchedRows++; continue; }
      if (b.stopValues === undefined || a.stopValues === undefined) noStopValues = true;
      else stopChanges.push(...diffStopValues(slug, b, a));
      const sides: Array<[What, Figures | Flags | Texts | undefined, Figures | Flags | Texts | undefined]> = [
        ['route figure', b.routeFigure, a.routeFigure], ['direction figure', b.directionFigure, a.directionFigure],
        ['steady', b.steady, a.steady], ['longest gap', b.longestGap, a.longestGap],
        ['card edge', b.edge, a.edge], ['stretch edges', b.stretchEdges, a.stretchEdges],
      ];
      for (const [what, bv, av] of sides) {
        if (bv === undefined || av === undefined) { figuresOnly = true; continue; }
        for (const period of new Set([...PERIOD_KEYS, ...Object.keys(bv), ...Object.keys(av)])) {
          const from = bv[period] ?? null;
          const to = av[period] ?? null;
          if (from === to) continue;
          // The route figure is the same on every row of the route that day: one line for it.
          if (what === 'route figure') {
            const once = JSON.stringify([a.route, a.day, period]);
            if (seenRoute.has(once)) continue;
            seenRoute.add(once);
          }
          changes.push({ slug, route: a.route, day: a.day, direction: what === 'route figure' ? 'route' : a.direction, period, what, before: from, after: to });
        }
      }
    }
    unmatchedRows += Object.keys(before[slug]).filter(key => !after[slug][key]).length;
  }
  changes.sort((x, y) => x.slug.localeCompare(y.slug) || size(y) - size(x)
    || x.route.localeCompare(y.route, undefined, { numeric: true }) || x.day.localeCompare(y.day) || x.period.localeCompare(y.period) || x.what.localeCompare(y.what) || x.direction.localeCompare(y.direction));

  // Routes are counted by agency and route name held together as one key, so a name with spaces is one route.
  const routeKey = (c: Change) => JSON.stringify([c.slug, c.route]);
  const routesOf = (list: Change[]) => new Set(list.map(routeKey)).size;
  const routeFigures = changes.filter(c => c.what === 'route figure');
  const both = routeFigures.filter((c): c is Change & { before: number; after: number } => typeof c.before === 'number' && typeof c.after === 'number');
  const crossed = (limit: number) => both.filter(c => (c.before <= limit) !== (c.after <= limit));
  const perAgency = new Map<string, Set<string>>();
  for (const c of changes) perAgency.set(c.slug, (perAgency.get(c.slug) ?? new Set()).add(c.route));
  const show = (v: Change['before']) => (v == null || v === '' ? 'none' : typeof v === 'boolean' ? (v ? 'steady' : 'not steady') : String(v));
  const report = [
    `Compared ${slugs.length} agencies: ${routesOf(changes)} routes with a change, ${changes.length} changed cells (${routeFigures.length} route figures, ${changes.filter(c => c.what === 'direction figure').length} direction figures, ${changes.filter(c => c.what === 'steady').length} steady flags, ${changes.filter(c => c.what === 'longest gap').length} longest gaps, ${changes.filter(c => c.what === 'card edge').length} card edges, ${changes.filter(c => c.what === 'stretch edges').length} stretch edges).`,
    ...(figuresOnly ? ['One side has no steady flags or longest gaps (an older summary): only the figures are compared.'] : []),
    ...(unmatchedRows > 0 ? [`${unmatchedRows} rows are on one side only (not compared).`] : []),
    ...(oneSide.length > 0 ? [`Agencies on one side only (not compared): ${oneSide.join(', ')}.`] : []),
    '',
    'Route figures (the map and its filter):',
    `- Shorter: ${routesOf(both.filter(c => c.after < c.before))} routes (${both.filter(c => c.after < c.before).length} cells). Longer: ${routesOf(both.filter(c => c.after > c.before))} routes (${both.filter(c => c.after > c.before).length} cells).`,
    `- From none to a value: ${routesOf(routeFigures.filter(c => c.before == null))} routes. From a value to none: ${routesOf(routeFigures.filter(c => c.after == null))} routes.`,
    `- Crossed 15 minutes: ${routesOf(crossed(15))} routes (${crossed(15).filter(c => c.after <= 15).length} cells to 15 or under, ${crossed(15).filter(c => c.after > 15).length} cells to over 15).`,
    `- Crossed any tier boundary (${TIER_MAXES.join(', ')}): ${routesOf(both.filter(c => tierOf(c.before) !== tierOf(c.after)))} routes (${both.filter(c => tierOf(c.before) !== tierOf(c.after)).length} cells).`,
    '',
    `Routes changed per agency (${perAgency.size} agencies):`,
    ...[...perAgency].sort((x, y) => y[1].size - x[1].size || x[0].localeCompare(y[0])).map(([slug, routes]) => `- ${slug}: ${routes.size}`),
    '',
    'Section colours, per stop (a stop that goes up waits longer):',
    ...(noStopValues ? ['- One side has no per-stop values (an older summary): not compared.'] : []),
    `- ${stopChanges.length} stop values changed: ${stopChanges.filter(c => c.before != null && c.after != null && c.after > c.before).length} up, ${stopChanges.filter(c => c.before != null && c.after != null && c.after < c.before).length} down, ${stopChanges.filter(c => c.before == null).length} from none to a value, ${stopChanges.filter(c => c.after == null).length} from a value to none.`,
    ...stopCounts(stopChanges),
    '',
    '| Agency | Route | Day | Direction | Period | What | Before | After |',
    '|---|---|---|---|---|---|---|---|',
    ...changes.map(c => `| ${c.slug} | ${c.route} | ${c.day} | ${c.direction} | ${c.period} | ${c.what} | ${show(c.before)} | ${show(c.after)} |`),
    ...(stopChanges.length > 0 ? [
      '',
      '| Agency | Route | Day | Direction | Period | Stop | Before | After |',
      '|---|---|---|---|---|---|---|---|',
      ...stopChanges.map(c => `| ${c.slug} | ${c.route} | ${c.day} | ${c.direction} | ${c.period} | ${c.stopId} | ${show(c.before)} | ${show(c.after)} |`),
    ] : []),
  ].join('\n');
  return { report, changes, stopChanges };
}

/** Per agency and period: stops up, down, gained and lost. */
function stopCounts(stopChanges: StopChange[]): string[] {
  const counts = new Map<string, { up: number; down: number; gained: number; lost: number }>();
  for (const c of stopChanges) {
    const key = `${c.slug} ${c.period}`;
    const n = counts.get(key) ?? { up: 0, down: 0, gained: 0, lost: 0 };
    if (c.before == null) n.gained++;
    else if (c.after == null) n.lost++;
    else if (c.after > c.before) n.up++;
    else n.down++;
    counts.set(key, n);
  }
  return [...counts].sort((x, y) => x[0].localeCompare(y[0])).map(([key, n]) => `  - ${key}: ${n.up} up, ${n.down} down, ${n.gained} from none, ${n.lost} to none`);
}

function main(): void {
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const load = (path: string): Summary => (statSync(path).isDirectory() ? summarize(path) : JSON.parse(readFileSync(path, 'utf8')) as Summary);
  const summaryDir = arg('summary');
  const outPath = arg('out');
  if (summaryDir) {
    if (!outPath) throw new Error('--summary needs --out=<file.json>');
    const summary = summarize(resolve(summaryDir));
    writeFileSync(resolve(outPath), JSON.stringify(summary));
    console.log(`Wrote the period figures of ${Object.keys(summary).length} agencies to ${outPath}`);
    return;
  }
  const beforeArg = arg('before');
  const afterArg = arg('after');
  if (!beforeArg || !afterArg) throw new Error('Usage: npx tsx scripts/diff-period-figures.ts --before=<dir or file.json> --after=<dir or file.json> [--out=<file.md>]');
  const { report } = diffSummaries(load(resolve(beforeArg)), load(resolve(afterArg)));
  if (outPath) writeFileSync(resolve(outPath), `${report}\n`);
  console.log(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
