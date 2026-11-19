/**
 * CIV-1913 research only (dry-run branch, never merged), attempt 2: how many route-periods split into two parts whose
 * typical gaps differ (pipeline/research1913.ts), and how many are two or more public grades apart in every direction
 * (hand-checked for overstatement). Prints the must-flag (Metro Transit METRO E Line weekday Late) and must-not (MBTA 116
 * weekday Late) rows. Reads tmp/derived-reprocess; writes
 * tmp/civ1913/{summary.md,splits.tsv}. A route-period counts once per route, day and period (rows of one route merge).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_TIER_MAXES } from '../shared/rules/frequency.js';
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
      const dirs = v?.dirs ?? [];
      if (!dirs.some(Boolean) || cells.has(k)) continue;
      const filter = p.routeFilterHeadwayByPeriod?.[period] ?? null;
      // Two or more public grades apart in every splitting direction (over 60 counts as one grade past 60). The card's
      // own words are not in the tiles, so whether it overstates is hand-checked on the narrowed rows.
      const idx = (x: number | null) => (x == null ? PUBLIC_TIER_MAXES.length : PUBLIC_TIER_MAXES.indexOf(x));
      const big = dirs.filter(Boolean).every((d: any) => Math.abs(idx(d.before) - idx(d.after)) >= 2);
      cells.set(k, { slug, route: p.routeShortName ?? p.routeId, name: p.routeLongName ?? '', day: p.day, period, every: dirs.every(Boolean), dirs, filter, big });
    }
  }
}
const all = [...cells.values()];
const byPeriod: Record<string, number> = {}, pairs: Record<string, number> = {};
const agencies = new Set<string>();
const g = (x: number | null) => (x == null ? 'over 60' : String(x));
for (const c of all) {
  byPeriod[c.period] = (byPeriod[c.period] ?? 0) + 1;
  agencies.add(c.slug);
  const d = c.dirs.find(Boolean);
  const pk = `${g(d.before)} -> ${g(d.after)}`; pairs[pk] = (pairs[pk] ?? 0) + 1;
}
const narrow = all.filter(c => c.big && c.every && (c.period === 'evening' || c.period === 'late'));
const show = (c: any) => `${c.slug} ${c.route || c.name} ${c.day} ${c.period}: card ${c.filter}; ` + c.dirs.map((d: any, i: number) => d ? `${i}: ${g(d.before)} (typ ${d.beforeGap}) until ${fmt(d.at)}, then ${g(d.after)} (typ ${d.afterGap})` : `${i}: -`).join('; ');
const find = (slug: string, re: RegExp, day: string, period: string) => all.find(c => c.slug === slug && re.test(`${c.route} ${c.name}`) && c.day === day && c.period === period);
const must = find('metro-transit', /E Line/, 'Weekday', 'late');
const mustNot = find('mbta', /^116 /, 'Weekday', 'late');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'summary.md'), [
  `# CIV-1913 attempt 2 split periods (${slugs.length} agencies, ${routePeriods} route-periods with a main stretch)`,
  '',
  `- Must flag, Metro Transit METRO E Line weekday Late: ${must ? 'FLAGGED ' + show(must) : 'NOT FLAGGED'}`,
  `- Must not flag, MBTA 116 weekday Late: ${mustNot ? 'FLAGGED ' + show(mustNot) : 'not flagged'}`,
  `- Split (any direction): ${all.length} route-periods at ${agencies.size} agencies; every direction: ${all.filter(c => c.every).length}`,
  `- Two or more grades apart: ${all.filter(c => c.big).length}; of those, every direction, evening or late: ${narrow.length} at ${new Set(narrow.map(c => c.slug)).size} agencies`,
  `- By period: ${JSON.stringify(byPeriod)}`,
  `- Grade pairs (first splitting direction): ${JSON.stringify(Object.fromEntries(Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 25)))}`,
  '',
  '## Two or more grades apart, every direction, evening or late (first 80)',
  '',
  ...narrow.slice(0, 80).map(c => `- ${show(c)}`),
  '',
].join('\n'));
writeFileSync(path.join(outDir, 'splits.tsv'), ['agency\troute\tname\tday\tperiod\tevery direction\t2+ grades\tfilter value today\tsplits'].concat(all.map(c => [c.slug, c.route, c.name, c.day, c.period, c.every, c.big, c.filter, show(c)].join('\t'))).join('\n') + '\n');
console.log(readFileSync(path.join(outDir, 'summary.md'), 'utf8'));
