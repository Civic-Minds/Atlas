#!/usr/bin/env npx tsx
/**
 * CIV-1430: compare rebuilt History v2 sidecars against the published ones, per period and per route, listing every
 * changed field. Local files only; never touches R2.
 *
 *   npx tsx pipeline/history-v2-diff.ts --slug mbta --published <dir> --rebuilt <dir> --out <file.json> [--md <file.md>]
 *
 * Both dirs hold <dir>/history-v2/{slug}/{periodKey}.json. For each period: whether every weekday field is
 * byte-identical (rep, name, flag, the route set and every top-level field), whether the only differences are added
 * weekend p / t / tp (checkWeekendOnlyAddition, the same check history:upload --replace-approved applies), the
 * counts of added weekend fields, and every other changed field with its before and after value.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkWeekendOnlyAddition, countAdded, diffJson, type FieldChange } from './historyV2Replace.js';
import { isEntryPoint, parseFlags } from './historyPublishLib.js';

export interface PeriodDiff {
  periodKey: string;
  status: 'weekend-only' | 'identical' | 'changed' | 'published-only' | 'rebuilt-only';
  refDate?: string;
  routes?: number;
  /** True when no weekday field (rep, name, flag), no route and no top-level field differs. */
  weekdayIdentical?: boolean;
  addedCounts?: Record<string, number>;
  addedTotal?: number;
  /** Every changed field other than the added weekend fields, grouped by route ('' = top level). */
  changes?: Record<string, FieldChange[]>;
  reason?: string;
}

const WEEKEND_PATH = /^routes\.[^.]+\.(sat|sun)(\.|$)/;

function listPeriods(dir: string, slug: string): Map<string, string> {
  const d = resolve(dir, 'history-v2', slug);
  const out = new Map<string, string>();
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d).filter(n => n.endsWith('.json')).sort()) out.set(f.slice(0, -5), readFileSync(resolve(d, f), 'utf8'));
  return out;
}

function routeOf(path: string): string {
  const m = /^routes\.([^.]+)/.exec(path);
  return m ? m[1] : '';
}

export function diffPeriod(periodKey: string, before: string | undefined, after: string | undefined): PeriodDiff {
  if (before == null) return { periodKey, status: 'rebuilt-only' };
  if (after == null) return { periodKey, status: 'published-only', reason: 'not rebuilt (see the backfill report: no zip, or not pinnable)' };
  const old = JSON.parse(before) as { refDate?: string; routes?: Record<string, unknown> };
  const base = { periodKey, refDate: old.refDate, routes: Object.keys(old.routes ?? {}).length };
  if (before === after) return { ...base, status: 'identical', weekdayIdentical: true, addedCounts: {}, addedTotal: 0 };
  const check = checkWeekendOnlyAddition(before, after);
  const all = check.ok ? [] : (check.changes.length ? check.changes : diffJson(old, JSON.parse(after)));
  const changes: Record<string, FieldChange[]> = {};
  for (const c of all) (changes[routeOf(c.path)] ??= []).push(c);
  return {
    ...base,
    status: check.ok ? 'weekend-only' : 'changed',
    weekdayIdentical: all.every(c => WEEKEND_PATH.test(c.path)) && check.reason !== 'bytes differ outside the added weekend fields (key order or number formatting)',
    addedCounts: countAdded(check.added),
    addedTotal: check.added.length,
    ...(all.length ? { changes } : {}),
    ...(check.ok ? {} : { reason: check.reason }),
  };
}

export function diffDirs(slug: string, publishedDir: string, rebuiltDir: string): PeriodDiff[] {
  const pub = listPeriods(publishedDir, slug);
  const reb = listPeriods(rebuiltDir, slug);
  return [...new Set([...pub.keys(), ...reb.keys()])].sort().map(pk => diffPeriod(pk, pub.get(pk), reb.get(pk)));
}

export function markdownOf(slug: string, diffs: PeriodDiff[]): string {
  const lines = [`# History v2 rebuild diff: ${slug}`, '', '| Period | refDate | Status | Weekday byte-identical | Added weekend fields |', '|---|---|---|---|---|'];
  for (const d of diffs) {
    const added = d.addedCounts ? Object.entries(d.addedCounts).map(([k, v]) => `${k} ${v}`).join(', ') || '0' : '';
    lines.push(`| ${d.periodKey} | ${d.refDate ?? ''} | ${d.status} | ${d.weekdayIdentical == null ? '' : d.weekdayIdentical ? 'yes' : 'NO'} | ${added} |`);
  }
  for (const d of diffs.filter(x => x.changes)) {
    lines.push('', `## ${d.periodKey}: ${d.reason ?? d.status}`);
    for (const [route, cs] of Object.entries(d.changes!)) {
      for (const c of cs.slice(0, 50)) lines.push(`- ${route || '(top level)'} \`${c.path}\`: ${c.before ?? '(absent)'} -> ${c.after ?? '(absent)'}`);
      if (cs.length > 50) lines.push(`- ${route}: ${cs.length - 50} more`);
    }
  }
  return lines.join('\n') + '\n';
}

if (isEntryPoint(import.meta.url)) {
  const { values } = parseFlags(process.argv.slice(2), ['--slug', '--published', '--rebuilt', '--out', '--md'], []);
  const slug = values['--slug'];
  if (!slug || !values['--published'] || !values['--rebuilt'] || !values['--out']) {
    console.error('Usage: history-v2-diff.ts --slug <slug> --published <dir> --rebuilt <dir> --out <file.json> [--md <file.md>]');
    process.exit(2);
  }
  const diffs = diffDirs(slug, values['--published'], values['--rebuilt']);
  writeFileSync(resolve(values['--out']), JSON.stringify({ slug, periods: diffs }, null, 2));
  if (values['--md']) writeFileSync(resolve(values['--md']), markdownOf(slug, diffs));
  for (const d of diffs) console.log(`${d.periodKey} ${d.refDate ?? ''} ${d.status}${d.weekdayIdentical === false ? ' WEEKDAY CHANGED' : ''} added=${d.addedTotal ?? '-'} ${d.addedCounts ? JSON.stringify(d.addedCounts) : ''}${d.reason ? ` (${d.reason})` : ''}`);
}
