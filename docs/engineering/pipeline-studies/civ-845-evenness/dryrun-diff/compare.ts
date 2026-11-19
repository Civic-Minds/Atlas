#!/usr/bin/env tsx
/**
 * Dry-run diff report: compares two downloaded rebuild-release.yml dry-run artifact folders.
 * Read-only. Writes markdown to --out (or stdout).
 *
 * Usage (from anywhere):
 *   ~/Developer/Code/Platforms/Atlas/node_modules/.bin/tsx compare.ts \
 *     --baseline <dir of baseline artifact> --candidate <dir of candidate artifact> \
 *     [--out report.md] [--focus-slug drt --focus-route 900] [--repo ~/Developer/Code/Platforms/Atlas] \
 *     [--baseline-stops <dir> --candidate-stops <dir>]   # stop-level, see below
 *
 * A "run dir" is the folder `gh run download <id> -D <dir>` made (the script finds
 * period-figures.json, report.json and build-settings.json anywhere under it).
 *
 * Route level (always): period-figures.json holds, per agency/route/day/direction row, the route and
 * direction filter figure per period, steady flag, longest gap, card edges and headline. Stop-level
 * values (stopPeriodHeadways, stopPeriodCoverageHeadways) are NOT in the default artifact. For those,
 * dispatch both runs with the `agencies` input (e.g. "drt ttc ...") and pass the downloaded
 * rebuild-agencies-dry-run-<id> folders as --baseline-stops / --candidate-stops: every <slug>/<slug>.json
 * found is compared stop by stop and period by period (published value <-> refused/null).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; })) as Record<string, string>;
// also accept "--key value"
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--') && !argv[i].includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
const need = (k: string) => { if (!args[k]) { console.error(`missing --${k}`); process.exit(2); } return args[k]; };
const repo = resolve((args.repo ?? '~/Developer/Code/Platforms/Atlas').replace(/^~/, homedir()));
const focusSlug = args['focus-slug'] ?? 'drt';
const focusRoute = args['focus-route'] ?? '900';

type Fig = Record<string, number | boolean | string | null | undefined>;
type Row = { route: string; day: string; direction: string; routeFigure?: Fig; directionFigure?: Fig; steady?: Fig; longestGap?: Fig; edge?: Fig; stretchEdges?: Fig; headline?: Fig };
type Summary = Record<string, Record<string, Row>>;

function findFile(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; }
  }
  return null;
}
const readJson = <T,>(p: string | null): T | null => (p ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null);

type Run = { dir: string; summary: Summary; commit: string; runAt: string; status: Record<string, string>; reasons: Record<string, string> };
function loadRun(dir: string): Run {
  const summary = readJson<Summary>(findFile(dir, 'period-figures.json'));
  if (!summary) throw new Error(`no period-figures.json under ${dir}`);
  const bs = readJson<{ commit?: string; runAt?: string }>(findFile(dir, 'build-settings.json')) ?? {};
  const rep = readJson<{ agencies?: Array<{ slug: string; status: string; reason?: string }> }>(findFile(dir, 'report.json'));
  const status: Record<string, string> = {}; const reasons: Record<string, string> = {};
  for (const a of rep?.agencies ?? []) { status[a.slug] = a.status; if (a.reason) reasons[a.slug] = a.reason; }
  return { dir, summary, commit: bs.commit ?? '?', runAt: bs.runAt ?? '?', status, reasons };
}

// Repo helpers (tiers, country). Loaded dynamically so a bad --repo gives a clear message.
const { HEADWAY_TIERS, PERIOD_KEYS } = await import(join(repo, 'shared/config.ts')) as { HEADWAY_TIERS: Array<{ max: number }>; PERIOD_KEYS: string[] };
const { countryForRegion } = await import(join(repo, 'shared/regionCountry.ts')) as { countryForRegion: (r: string | null | undefined) => string | null };
const TIER_MAXES = HEADWAY_TIERS.map(t => t.max).filter(Number.isFinite);
const tierOf = (v: number) => TIER_MAXES.filter(max => v > max).length;
function agencyMeta(slug: string): { name: string; region: string; country: string } {
  const p = join(repo, 'config/agencies', `${slug}.json`);
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { shortName?: string; officialName?: string; region?: string };
    return { name: j.shortName ?? j.officialName ?? slug, region: j.region ?? '?', country: countryForRegion(j.region) ?? 'unknown' };
  } catch { return { name: slug, region: '?', country: 'unknown' }; }
}

const q = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const fmt = (v: unknown) => (v == null ? 'none' : typeof v === 'boolean' ? (v ? 'steady' : 'not steady') : String(v));
const num = (v: unknown): v is number => typeof v === 'number';

type Kind = 'route figure' | 'direction figure' | 'headline' | 'steady' | 'longest gap' | 'card edge' | 'stretch edges' | 'stop value' | 'stop coverage';
type Change = { slug: string; route: string; day: string; where: string; period: string; kind: Kind; before: unknown; after: unknown };
const VALUE_KINDS: Kind[] = ['route figure', 'direction figure', 'headline', 'stop value', 'stop coverage'];

function diffRoutes(b: Summary, a: Summary) {
  const changes: Change[] = []; const compared: Record<string, { rows: number; routes: Set<string> }> = {};
  const oneSide: string[] = [];
  for (const slug of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()) {
    if (!b[slug] || !a[slug]) { oneSide.push(`${slug} (${b[slug] ? 'baseline only' : 'candidate only'})`); continue; }
    const c = compared[slug] = { rows: 0, routes: new Set<string>() };
    const seenRoute = new Set<string>();
    for (const [key, ar] of Object.entries(a[slug])) {
      const br = b[slug][key]; if (!br) continue;
      c.rows++; c.routes.add(ar.route);
      const pairs: Array<[Kind, Fig | undefined, Fig | undefined]> = [
        ['route figure', br.routeFigure, ar.routeFigure], ['direction figure', br.directionFigure, ar.directionFigure], ['headline', br.headline, ar.headline],
        ['steady', br.steady, ar.steady], ['longest gap', br.longestGap, ar.longestGap], ['card edge', br.edge, ar.edge], ['stretch edges', br.stretchEdges, ar.stretchEdges]];
      for (const [kind, bv, av] of pairs) {
        if (!bv || !av) continue;
        for (const period of new Set([...PERIOD_KEYS, ...Object.keys(bv), ...Object.keys(av)])) {
          const from = bv[period] ?? null, to = av[period] ?? null;
          if (from === to) continue;
          if (kind === 'route figure') { const k = JSON.stringify([ar.route, ar.day, period]); if (seenRoute.has(k)) continue; seenRoute.add(k); }
          changes.push({ slug, route: ar.route, day: ar.day, where: kind === 'route figure' ? 'route' : ar.direction, period, kind, before: from, after: to });
        }
      }
    }
  }
  return { changes, compared, oneSide };
}

// Stop level: <dir>/**/<slug>/<slug>.json with features[].properties.stopPeriodHeadways / stopPeriodCoverageHeadways.
function loadStops(dir: string): Record<string, Array<{ properties?: Record<string, unknown> }>> {
  const out: Record<string, Array<{ properties?: Record<string, unknown> }>> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && p.split('/').slice(-2, -1)[0] === e.name.slice(0, -5)) {
        const j = JSON.parse(readFileSync(p, 'utf8')) as { features?: Array<{ properties?: Record<string, unknown> }> };
        out[e.name.slice(0, -5)] = j.features ?? [];
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}
function diffStops(bdir: string, adir: string) {
  const B = loadStops(bdir), A = loadStops(adir); const changes: Change[] = []; const compared: Record<string, number> = {};
  for (const slug of Object.keys(A).filter(s => B[s]).sort()) {
    const idx = (fs: Array<{ properties?: Record<string, unknown> }>) => {
      const m = new Map<string, Record<string, unknown>>();
      for (const { properties: p } of fs) { if (!p || p.routeId == null || p.stopId != null) continue; const base = [p.routeId, p.day ?? '', p.directionId ?? '', p.headsign ?? ''].join(' | '); let k = base; for (let n = 2; m.has(k); n++) k = `${base} #${n}`; m.set(k, p); }
      return m;
    };
    const bm = idx(B[slug]), am = idx(A[slug]); compared[slug] = 0;
    for (const [k, ap] of am) {
      const bp = bm.get(k); if (!bp) continue;
      const route = String(ap.routeShortName || ap.routeLongName || ap.routeId || '');
      for (const [field, kind] of [['stopPeriodHeadways', 'stop value'], ['stopPeriodCoverageHeadways', 'stop coverage']] as const) {
        const bt = (bp[field] ?? {}) as Record<string, Record<string, number | null>>, at = (ap[field] ?? {}) as Record<string, Record<string, number | null>>;
        for (const stop of new Set([...Object.keys(bt), ...Object.keys(at)])) {
          compared[slug]++;
          for (const period of new Set([...Object.keys(bt[stop] ?? {}), ...Object.keys(at[stop] ?? {})])) {
            const from = bt[stop]?.[period] ?? null, to = at[stop]?.[period] ?? null;
            if (from !== to) changes.push({ slug, route, day: String(ap.day ?? ''), where: `${ap.directionId ?? ''} to ${ap.headsign ?? ''}, stop ${stop}`, period, kind, before: from, after: to });
          }
        }
      }
    }
  }
  return { changes, compared };
}

// ---------- run ----------
const base = loadRun(need('baseline')), cand = loadRun(need('candidate'));
const r = diffRoutes(base.summary, cand.summary);
let all = r.changes; let stopCompared: Record<string, number> = {};
if (args['baseline-stops'] && args['candidate-stops']) { const s = diffStops(args['baseline-stops'], args['candidate-stops']); all = all.concat(s.changes); stopCompared = s.compared; }

const isFocus = (c: Change) => c.slug === focusSlug && c.route === focusRoute;
const L: string[] = [];
const sha = (s: string) => s.slice(0, 9);
L.push('# Dry-run diff report', '', `- Baseline: ${base.dir} (commit ${sha(base.commit)}, runAt ${base.runAt})`, `- Candidate: ${cand.dir} (commit ${sha(cand.commit)}, runAt ${cand.runAt})`);
if (base.runAt.slice(0, 10) !== cand.runAt.slice(0, 10)) L.push(`- WARNING: the runs read different dates (${base.runAt} vs ${cand.runAt}); service-week differences can show up as changes.`);
L.push('');

const comparedSlugs = Object.keys(r.compared).filter(s => r.compared[s].rows > 0);
const byCountry = new Map<string, string[]>();
for (const s of comparedSlugs) { const c = agencyMeta(s).country; byCountry.set(c, [...(byCountry.get(c) ?? []), s]); }
const nonFocus = comparedSlugs.filter(s => s !== focusSlug);
const nonFocusCountries = new Set(nonFocus.map(s => agencyMeta(s).country));
const totalRows = comparedSlugs.reduce((n, s) => n + r.compared[s].rows, 0);
const valueChanges = all.filter(c => VALUE_KINDS.includes(c.kind));
const lost = valueChanges.filter(c => c.before != null && c.after == null), gained = valueChanges.filter(c => c.before == null && c.after != null);
const both = valueChanges.filter(c => num(c.before) && num(c.after)) as Array<Change & { before: number; after: number }>;
const tierChanged = both.filter(c => tierOf(c.before) !== tierOf(c.after));
const collateral = all.filter(c => !isFocus(c));
const collateralValues = collateral.filter(c => VALUE_KINDS.includes(c.kind));

L.push('## Headline', '',
  `- Agencies compared: ${comparedSlugs.length} (${totalRows} route/day/direction rows); countries: ${[...byCountry].map(([c, s]) => `${c} ${s.length}`).join(', ')}.`,
  `- Excluding ${focusSlug}: ${nonFocus.length} agencies in ${nonFocusCountries.size} countr${nonFocusCountries.size === 1 ? 'y' : 'ies'} (${[...nonFocusCountries].join(', ')}). "Six additional agencies in two countries" (not counting DRT): ${nonFocus.length >= 6 && nonFocusCountries.size >= 2 ? 'SATISFIED by coverage' : 'NOT satisfied'} (coverage = compared, not necessarily affected; stop-level pooled values need the agencies input, see usage).`,
  `- Changed cells: ${all.length} total; value cells (figures, headlines, stops): ${valueChanges.length}. Published -> none: ${lost.length}. none -> published: ${gained.length}. Changed value to value: ${both.length}. Crossed a tier boundary: ${tierChanged.length}.`,
  `- Focus (${focusSlug} route ${focusRoute}) changed cells: ${all.filter(isFocus).length}. Collateral (everything else): ${collateral.length} cells (${collateralValues.length} value cells) in ${new Set(collateral.map(c => c.slug)).size} agencies.`,
  `- Stop-level compared: ${Object.keys(stopCompared).length ? `${Object.keys(stopCompared).length} agencies, ${Object.values(stopCompared).reduce((a, b) => a + b, 0)} stop tables` : 'no (route-level artifact only; pass --baseline-stops/--candidate-stops)'}.`);
if (r.oneSide.length) L.push(`- Agencies with output on one side only (NOT compared cell by cell, see section below): ${r.oneSide.join(', ')}.`);
// agency status differences (refused/processed) between runs
const statusDiff = [...new Set([...Object.keys(base.status), ...Object.keys(cand.status)])].filter(s => base.status[s] !== cand.status[s]).sort();
L.push(`- Agency status differences (report.json): ${statusDiff.length ? statusDiff.map(s => `${s}: ${base.status[s] ?? 'absent'} -> ${cand.status[s] ?? 'absent'}`).join('; ') : 'none'}.`, '');

if (r.oneSide.length) {
  L.push('## Agencies with output on one side only', '', 'An agency in the baseline but missing from the candidate was refused or failed there (no output, so every figure is effectively published -> none). The reason comes from report.json.', '', '| Agency | Country | Side | Rows on that side | Baseline status | Candidate status | Candidate reason |', '|---|---|---|---|---|---|---|');
  for (const e of r.oneSide) {
    const slug = e.split(' ')[0]; const inBase = !!base.summary[slug];
    const rows = Object.keys((inBase ? base.summary : cand.summary)[slug] ?? {}).length;
    L.push(`| ${slug} | ${agencyMeta(slug).country} | ${inBase ? 'baseline only' : 'candidate only'} | ${rows} | ${base.status[slug] ?? 'absent'} | ${cand.status[slug] ?? 'absent'} | ${(cand.reasons[slug] ?? '').replace(/\|/g, '/')} |`);
  }
  L.push('');
}
L.push('## Per agency', '', '| Agency | Country | Routes | Rows | Changed cells | Value cells | Published->none | none->published | Tier changes | Delta min | median | max |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const slug of [...new Set(all.map(c => c.slug))].sort((x, y) => all.filter(c => c.slug === y).length - all.filter(c => c.slug === x).length || x.localeCompare(y))) {
  const cs = all.filter(c => c.slug === slug), vs = cs.filter(c => VALUE_KINDS.includes(c.kind));
  const bo = vs.filter(c => num(c.before) && num(c.after)) as Array<Change & { before: number; after: number }>;
  const d = bo.map(c => c.after - c.before);
  const f = (x: number | null) => (x == null ? '-' : (x > 0 ? '+' : '') + (Math.round(x * 10) / 10));
  L.push(`| ${slug} | ${agencyMeta(slug).country} | ${r.compared[slug]?.routes.size ?? '-'} | ${r.compared[slug]?.rows ?? '-'} | ${cs.length} | ${vs.length} | ${vs.filter(c => c.before != null && c.after == null).length} | ${vs.filter(c => c.before == null && c.after != null).length} | ${bo.filter(c => tierOf(c.before) !== tierOf(c.after)).length} | ${f(q(d, 0))} | ${f(q(d, 0.5))} | ${f(q(d, 1))} |`);
}
if (!all.length) L.push('| (no changes) | | | | | | | | | | | |');
L.push('', 'Delta columns are after minus before, value-to-value cells only.', '');

L.push('## Top changed routes', '', '| Agency | Route | Changed cells | Largest delta (min) | Published->none | none->published |', '|---|---|---|---|---|---|');
const perRoute = new Map<string, Change[]>();
for (const c of all) perRoute.set(JSON.stringify([c.slug, c.route]), [...(perRoute.get(JSON.stringify([c.slug, c.route])) ?? []), c]);
for (const [k, cs] of [...perRoute].sort((x, y) => y[1].length - x[1].length).slice(0, 25)) {
  const [slug, route] = JSON.parse(k) as [string, string];
  const deltas = cs.filter(c => VALUE_KINDS.includes(c.kind) && num(c.before) && num(c.after)).map(c => Math.abs((c.after as number) - (c.before as number)));
  const vs = cs.filter(c => VALUE_KINDS.includes(c.kind));
  L.push(`| ${slug} | ${route} | ${cs.length} | ${deltas.length ? Math.max(...deltas) : '-'} | ${vs.filter(c => c.before != null && c.after == null).length} | ${vs.filter(c => c.before == null && c.after != null).length} |`);
}
if (!all.length) L.push('| (none) | | | | | |');
L.push('');

const table = (title: string, cs: Change[], cap = 400) => {
  L.push(`## ${title} (${cs.length})`, '');
  if (!cs.length) { L.push('None.', ''); return; }
  L.push('| Agency | Route | Day | Where | Period | Kind | Before | After |', '|---|---|---|---|---|---|---|---|');
  for (const c of cs.slice(0, cap)) L.push(`| ${c.slug} | ${c.route} | ${c.day} | ${c.where} | ${c.period} | ${c.kind} | ${fmt(c.before)} | ${fmt(c.after)} |`);
  if (cs.length > cap) L.push('', `(${cs.length - cap} more not shown; rerun with --cap=N)`);
  L.push('');
};
const cap = Number(args.cap ?? 400);
table('Newly refused (published -> none)', lost, cap);
table('Newly published (none -> value)', gained, cap);
table(`Collateral: changes outside ${focusSlug} route ${focusRoute}`, collateral, cap);
table(`Changes on ${focusSlug} route ${focusRoute}`, all.filter(isFocus), cap);

const out = L.join('\n') + '\n';
if (args.out) { writeFileSync(args.out, out); console.error(`wrote ${args.out}`); } else process.stdout.write(out);
