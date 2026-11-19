/**
 * CIV-1913 research only (dry-run branch, never merged): how many route-periods split into two steady parts with
 * different public grades (pipeline/tripSets.ts splitResearch), counted only where the whole period reads a worse grade
 * than its better part. Reads tmp/derived-reprocess; writes
 * tmp/civ1913/{summary.md,splits.tsv}. A route-period counts once per route, day and period (rows of one route merge).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const dir = process.argv[2] ?? 'tmp/derived-reprocess';
const outDir = 'tmp/civ1913';
const slugs = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(path.join(dir, e.name, `${e.name}.json`))).map(e => e.name).sort();
const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const cells = new Map<string, any>();
let routePeriods = 0;
const seenAll = new Set<string>();
for (const slug of slugs) {
  const fc = JSON.parse(readFileSync(path.join(dir, slug, `${slug}.json`), 'utf8'));
  for (const f of fc.features ?? []) {
    const p = f.properties ?? {};
    if (p.routeShortName == null && p.routeId == null) continue;
    if (f.geometry?.type === 'Point') continue;
    const by = p.researchSplitByPeriod;
    if (!by) continue;
    for (const [period, v] of Object.entries(by) as [string, any][]) {
      const k = `${slug}|${p.routeId}|${p.day}|${period}`;
      if (!seenAll.has(k)) { seenAll.add(k); routePeriods++; }
      // A split matters only where the whole period reads worse than its better part (the card's one number hides it).
      const dirs = (v?.dirs ?? []).map((d: any) => (d && (d.whole == null || d.whole > Math.min(d.before, d.after)) ? d : null));
      if (!dirs.some(Boolean) || cells.has(k)) continue;
      cells.set(k, { slug, route: p.routeShortName ?? p.routeId, name: p.routeLongName ?? '', day: p.day, period, every: dirs.every(Boolean), dirs, filter: p.routeFilterHeadwayByPeriod?.[period] ?? null });
    }
  }
}
const all = [...cells.values()];
const big = (c: any) => c.dirs.some((d: any) => d && d.steps >= 2);
const byPeriod: Record<string, number> = {}, pairs: Record<string, number> = {};
const agencies = new Set<string>();
for (const c of all) {
  byPeriod[c.period] = (byPeriod[c.period] ?? 0) + 1;
  agencies.add(c.slug);
  const d = c.dirs.find(Boolean);
  const pk = `${d.before} -> ${d.after}`; pairs[pk] = (pairs[pk] ?? 0) + 1;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'summary.md'), [
  `# CIV-1913 split periods (${slugs.length} agencies, ${routePeriods} route-periods with a main stretch)`,
  '',
  `- Split (any direction): ${all.length} route-periods at ${agencies.size} agencies; every direction: ${all.filter(c => c.every).length}`,
  `- Split by 2+ grade steps (e.g. 15 then 60): ${all.filter(big).length}`,
  `- By period: ${JSON.stringify(byPeriod)}`,
  `- Grade pairs (before -> after, first splitting direction): ${JSON.stringify(Object.fromEntries(Object.entries(pairs).sort((a, b) => b[1] - a[1])))}`,
  '',
].join('\n'));
writeFileSync(path.join(outDir, 'splits.tsv'), ['agency\troute\tname\tday\tperiod\tevery direction\tfilter value today\tsplits (dir: before until HH:MM, then after)'].concat(all.map(c => [c.slug, c.route, c.name, c.day, c.period, c.every, c.filter, c.dirs.map((d: any, i: number) => d ? `${i}: ${d.before} until ${fmt(d.at)}, then ${d.after}` : `${i}: -`).join('; ')].join('\t'))).join('\n') + '\n');
console.log(readFileSync(path.join(outDir, 'summary.md'), 'utf8'));
