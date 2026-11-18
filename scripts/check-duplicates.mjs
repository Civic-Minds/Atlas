#!/usr/bin/env node
/**
 * Copied code check: fails when src/ or shared/ gains a block of code copied from another file (Ryan,
 * 2026-11-17, on MapApp's own top bar and a pill group copied from PillGroup: shared components are reused,
 * never copied). Copies that exist today are listed in scripts/duplicates-baseline.json, which may only shrink,
 * like the rules boundary allowlist: a new copied pair, or a listed pair that grows, fails.
 *
 * How it matches: each file's code lines, with comments, blank lines, imports and lines of only brackets left
 * out, strings read as "s" and numbers as 0, so a copy with changed labels or sizes still matches. A copy is
 * WINDOW such lines in a row that appear the same in two places.
 *
 * Usage:
 *   node scripts/check-duplicates.mjs            check against the baseline (CI, npm run check:duplicates)
 *   node scripts/check-duplicates.mjs --top 10   also list the largest copied pairs
 *   node scripts/check-duplicates.mjs --shrink   rewrite the baseline without pairs that are gone or smaller
 *                                                 (never adds or raises a pair)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIRS = ['src', 'shared'];
/** Data tables (agency lists, service areas): rows look alike by design. */
const SKIP_DIRS = new Set(['src/data']);
const BASELINE = join(ROOT, 'scripts', 'duplicates-baseline.json');
/** Code lines in a row that make a copy. */
const WINDOW = 10;

const files = dir => readdirSync(join(ROOT, dir)).flatMap(name => {
  const rel = join(dir, name);
  if (name === 'node_modules' || name === '__tests__' || name.startsWith('.') || SKIP_DIRS.has(rel)) return [];
  if (statSync(join(ROOT, rel)).isDirectory()) return files(rel);
  return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [rel] : [];
});

/** A file's code lines, normalized, each with its line number. */
function codeLines(file) {
  const text = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''));
  const out = [];
  text.split('\n').forEach((raw, i) => {
    let line = raw.replace(/(^|[^:'"`])\/\/.*$/, '$1').trim();
    if (!line || /^(import|export \* from|export \{[^}]*\} from)\b/.test(line) || /^[\s{}()[\];,<>/]*$/.test(line)) return;
    line = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '"s"').replace(/-?\b\d+(\.\d+)?\b/g, '0').replace(/\s+/g, ' ');
    // Lines of only values (coordinates, number tables, string lists) are data, not code: a table is not a copy.
    if (/^[\s{}()[\];,0"s:.-]*$/.test(line)) return;
    out.push({ line, n: i + 1 });
  });
  return out;
}

const all = DIRS.flatMap(files).sort();
const windows = new Map(); // hash -> [{ file, at }]
const lines = new Map();
for (const file of all) {
  const code = codeLines(file);
  lines.set(file, code);
  for (let at = 0; at + WINDOW <= code.length; at++) {
    const h = createHash('sha1').update(code.slice(at, at + WINDOW).map(c => c.line).join('\n')).digest('base64');
    (windows.get(h) ?? windows.set(h, []).get(h)).push({ file, at });
  }
}

// Each pair of files: the code lines of the first that are inside a copy of the second, and where.
const pairs = new Map();
for (const places of windows.values()) {
  if (places.length < 2 || places.length > 6) continue; // a window repeated everywhere is boilerplate, not a copy
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      let [a, b] = [places[i], places[j]];
      if (a.file === b.file && Math.abs(a.at - b.at) < WINDOW) continue;
      if (a.file > b.file) [a, b] = [b, a];
      const key = `${a.file} <> ${b.file}`;
      const p = pairs.get(key) ?? pairs.set(key, { a: a.file, b: b.file, covered: new Set(), first: [Infinity, Infinity] }).get(key);
      for (let k = 0; k < WINDOW; k++) p.covered.add(a.at + k);
      const la = lines.get(a.file)[a.at].n, lb = lines.get(b.file)[b.at].n;
      if (la < p.first[0]) p.first = [la, lb];
    }
  }
}
const found = Object.fromEntries([...pairs].map(([k, p]) => [k, p.covered.size]).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));

const args = process.argv.slice(2);
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const listed = baseline.pairs ?? {};

if (args.includes('--shrink')) {
  const kept = Object.fromEntries(Object.entries(listed).filter(([k]) => found[k] != null).map(([k, v]) => [k, Math.min(v, found[k])]));
  writeFileSync(BASELINE, JSON.stringify({ ...baseline, pairs: kept }, null, 2) + '\n');
  console.log(`Baseline: ${Object.keys(listed).length} -> ${Object.keys(kept).length} pairs.`);
  process.exit(0);
}

const top = args.includes('--top') ? Number(args[args.indexOf('--top') + 1] ?? 10) : 0;
if (top) {
  for (const [k, n] of Object.entries(found).slice(0, top)) {
    const p = pairs.get(k);
    console.log(`${String(n).padStart(4)} lines  ${p.a}:${p.first[0]}  <>  ${p.b}:${p.first[1]}`);
  }
}

const problems = Object.entries(found).filter(([k, n]) => listed[k] == null || n > listed[k]);
const shrinkable = Object.keys(listed).filter(k => found[k] == null || found[k] < listed[k]);
if (shrinkable.length) console.log(`${shrinkable.length} baseline pair(s) shrank or are gone: run node scripts/check-duplicates.mjs --shrink to lock that in.`);
if (problems.length) {
  console.error(`Copied code (${problems.length}): reuse the shared component or function instead of copying it.`);
  for (const [k, n] of problems) {
    const p = pairs.get(k);
    console.error(`  ${n} lines${listed[k] != null ? ` (was ${listed[k]})` : ''}: ${p.a}:${p.first[0]} <> ${p.b}:${p.first[1]}`);
  }
  process.exit(1);
}
console.log(`No new copied code (${all.length} files, ${Object.keys(listed).length} known pairs).`);
