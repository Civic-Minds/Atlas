/**
 * CIV-238 research 3 (worst-wait rule; see pipeline/tripSets.ts research block). Older header kept below.
 * CIV-238 research only (dry-run branch, never merged): how many routes change pass/fail at
 * 10/15/20/30 if the period's opening or closing wait must also be at most N + grace(N), the tier
 * rule's grace (max(5, 15% of N)). Reads reprocess output (tmp/derived-reprocess) and the research
 * fields stamped there; writes tmp/civ238/{summary.md,changes.tsv}.
 *
 * Two versions: "any" counts the wait from the period start to the first bus and from the last bus
 * to the period end; "true" counts an end only where the route has no bus beyond it (service starts
 * or stops inside the period). Internal gaps keep the settled tolerances in both.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { featurePassesHeadwayFilter, normalizeRouteFilterFeatures } from '../shared/routeHeadwayFilter';

const dir = process.argv[2] ?? 'tmp/derived-reprocess';
const outDir = 'tmp/civ238';
const PERIODS = ['amPeak', 'midday', 'pmPeak', 'evening'] as const;
const DAYS = ['Weekday', 'Saturday', 'Sunday'];
const THRESHOLDS = [10, 15, 20, 30];
type Props = Record<string, any>;

const slugs = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(path.join(dir, e.name, `${e.name}.json`))).map(e => e.name).sort();
const key = (p: Props) => `${p.routeId ?? ''}${p.routeBranch ? `::${p.routeBranch}` : ''}`;
const totals = Object.fromEntries(THRESHOLDS.map(n => [n, { pass: 0, any: 0, true: 0, agencies: new Set<string>(), legacy: 0 }]));
const perAgency: string[] = [];
const changes: string[] = [['agency', 'route', 'day', 'period', 'N', 'cut A (edges with grace)', 'cut B (edges no grace)', 'opening wait', 'opening kind', 'closing wait', 'closing kind', 'longest gap between buses', 'headsign'].join('\t')];

for (const slug of slugs) {
  const fc = JSON.parse(readFileSync(path.join(dir, slug, `${slug}.json`), 'utf8'));
  const feats = (fc.features ?? []).filter((f: any) => f.properties?.routeShortName != null && f.geometry?.type !== 'Point');
  for (const f of feats) f.properties.agencySlug ??= slug;
  normalizeRouteFilterFeatures(feats);
  const routes = new Map<string, Props[]>();
  for (const f of feats) routes.set(key(f.properties), [...(routes.get(key(f.properties)) ?? []), f.properties]);
  const mine = Object.fromEntries(THRESHOLDS.map(n => [n, { pass: 0, any: 0, true: 0 }]));
  for (const rows of routes.values()) for (const day of DAYS) for (const period of PERIODS) THRESHOLDS.forEach((n, bit) => {
    const passing = rows.filter(p => p.day === day && featurePassesHeadwayFilter(p, period, n));
    if (passing.length === 0) return;
    mine[n].pass++; totals[n].pass++;
    const stamped = passing.filter(p => p.researchEdgeRuleByPeriod?.[period] != null);
    if (stamped.length < passing.length) { totals[n].legacy++; return; }
    // "any" = edge waits under the near-miss grace (A); "true" = edge waits with no grace (B).
    const cutA = stamped.every(p => (p.researchEdgeRuleByPeriod[period].fail >> bit) & 1);
    const cutB = stamped.every(p => (p.researchEdgeRuleByPeriod[period].fail >> (bit + 4)) & 1);
    if (!cutA && !cutB) return;
    if (cutA) { mine[n].any++; totals[n].any++; totals[n].agencies.add(slug); }
    if (cutB) { mine[n].true++; totals[n].true++; }
    const p = stamped[0], r = p.researchEdgeRuleByPeriod[period];
    changes.push([slug, p.routeShortName, day, period, n, cutA ? 'A' : '', cutB ? 'B' : '', r.open, r.trueOpen ? 'true' : 'boundary', r.close, r.trueClose ? 'true' : 'boundary', r.maxInternal, p.headsign ?? ''].join('\t'));
  });
  if (THRESHOLDS.some(n => mine[n].any > 0)) perAgency.push(`| ${slug} | ${THRESHOLDS.map(n => `${mine[n].pass} / ${mine[n].any} / ${mine[n].true}`).join(' | ')} |`);
}

mkdirSync(outDir, { recursive: true });
const lines = [
  `# CIV-238 counts (${slugs.length} agencies)`,
  '',
  'Cells are route x day type x period that pass today. "any" = cut when an opening or closing wait over N + grace counts; "true" = cut only when it is a true start or end of service.',
  '',
  '| N | passing today | cut A (edges with near-miss grace) | cut B (edges, no grace) | agencies with a cut (A) | cells without research data |',
  '|---|---|---|---|---|---|',
  ...THRESHOLDS.map(n => `| ${n} | ${totals[n].pass} | ${totals[n].any} | ${totals[n].true} | ${totals[n].agencies.size} | ${totals[n].legacy} |`),
  '',
  `| agency | ${THRESHOLDS.map(n => `N=${n} pass / any / true`).join(' | ')} |`,
  `|---|${THRESHOLDS.map(() => '---').join('|')}|`,
  ...perAgency,
];
writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
writeFileSync(path.join(outDir, 'changes.tsv'), changes.join('\n') + '\n');
console.log(lines.slice(0, 11).join('\n'));
