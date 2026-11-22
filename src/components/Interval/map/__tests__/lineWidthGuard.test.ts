import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CIV-2057 (Ryan: "Why do the lines still look so thick here"; #1661 fixed Live's): every map draws its lines at widths from
 * routeStyle.ts, so Studio's, the main map's and Live's lines can never drift apart again. Outside routeStyle.ts a MapLibre
 * `line-width` takes routeStyle's named widths and width helpers only: no number of its own, and no width constant or helper
 * from anywhere else. A local holding a width (a `const w = …` passed to line-width) is held to the same rule where it is set.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const STYLE_FILE = 'src/components/Interval/map/routeStyle.ts';
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : walk(p);
  return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [relative(ROOT, p)] : [];
});
const FILES = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'shared'))].filter(f => f !== STYLE_FILE);

/** The expression after `start`, up to the comma, `)` or `}` that ends it at its own depth. */
function expressionAt(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return text.slice(start, i); depth--; }
    else if ((c === ',' || c === ';') && depth === 0) return text.slice(start, i);
  }
  return text.slice(start);
}

/** Names this file imports from routeStyle. */
function styleImports(text: string): Set<string> {
  const names = new Set<string>();
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\/routeStyle['"]/g)) {
    for (const part of m[1].split(',')) { const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop(); if (name) names.add(name); }
  }
  return names;
}

const NUMBER = /(?<![\w$.])\d+(?:\.\d+)?(?![\w$])/;
const IGNORED = new Set(['as', 'any', 'unknown', 'number', 'null', 'undefined', 'true', 'false', 'const']);

/** The text from `open` (an opening bracket) to its closing one, without them. */
function inside(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if ('([{'.includes(text[i])) depth++;
    else if (')]}'.includes(text[i]) && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** The branches of a top-level `a ? b : c` (the condition is not a width), else the expression itself. */
function branches(expr: string): string {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '?' && depth === 0 && expr[i + 1] !== '.' && expr[i + 1] !== '?') return expr.slice(i + 1);
  }
  return expr;
}

/**
 * What is wrong with a width expression in this file, or null. A routeStyle helper's arguments are what it matches, not
 * widths; any other call (a zoom interpolation) must take its widths from routeStyle. `seen` stops a local that refers to itself.
 */
function problem(expr: string, text: string, imports: Set<string>, seen = new Set<string>()): string | null {
  let bare = branches(expr.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""'));
  // Drop the arguments of routeStyle helpers, and check other calls' arguments for a routeStyle width.
  for (let m; (m = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/.exec(bare));) {
    const open = m.index + m[0].length - 1;
    const args = inside(bare, open);
    if (!imports.has(m[1])) {
      if (NUMBER.test(args)) return `a number of its own in ${m[1]}(…)`;
      if (![...imports].some(name => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(args))) return `${m[1]}(…), which is not from routeStyle.ts`;
      const inner = problem(args, text, imports, seen);
      if (inner) return inner;
    }
    bare = bare.slice(0, m.index) + 'STYLE_CALL' + bare.slice(open + args.length + 2);
  }
  if (NUMBER.test(bare)) return `a number of its own (${expr.trim().replace(/\s+/g, ' ').slice(0, 80)})`;
  for (const m of bare.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)/g)) {
    const name = m[1];
    if (IGNORED.has(name) || imports.has(name) || name === 'STYLE_CALL') continue;
    if (/^[A-Z][A-Z0-9_]+$/.test(name)) return `${name}, which is not from routeStyle.ts`;
    // A local: each place it is set must follow the same rule (a destructured or passed-in value has none here).
    if (seen.has(name)) continue;
    seen.add(name);
    for (const set of text.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*=(?![=>])`, 'g'))) {
      const found = problem(expressionAt(text, set.index! + set[0].length), text, imports, seen);
      if (found) return `${name} is set from ${found}`;
    }
  }
  return null;
}

describe('every map line width comes from routeStyle.ts (CIV-2057)', () => {
  it('sets no MapLibre line-width outside routeStyle.ts with its own numbers or widths', () => {
    const found = FILES.flatMap(f => {
      const text = readFileSync(join(ROOT, f), 'utf8');
      if (!text.includes('line-width')) return [];
      const imports = styleImports(text);
      return [...text.matchAll(/['"]line-width['"]\s*[:,]\s*/g)].flatMap(m => {
        const why = problem(expressionAt(text, m.index! + m[0].length), text, imports);
        return why ? [`${f}:${text.slice(0, m.index).split('\n').length}: line-width uses ${why}`] : [];
      });
    });
    expect(found).toEqual([]);
  });

  it('catches a number, an outside constant and a local set from a number', () => {
    const check = (src: string) => [...src.matchAll(/['"]line-width['"]\s*[:,]\s*/g)].map(m => problem(expressionAt(src, m.index! + m[0].length), src, styleImports(src)));
    expect(check(`paint: { 'line-width': 3.5 }`)[0]).toMatch(/number/);
    expect(check(`paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2] }`)[0]).toMatch(/number/);
    expect(check(`const OWN_WIDTH = 3; paint: { 'line-width': OWN_WIDTH }`)[0]).toMatch(/OWN_WIDTH/);
    expect(check(`let w = 2; map.setPaintProperty(id, 'line-width', w);`)[0]).toMatch(/w is set from a number/);
    expect(check(`const zoomed = (a, b) => [a, b]; paint: { 'line-width': zoomed(2, 3) }`)[0]).toMatch(/number of its own in zoomed/);
    expect(check(`import { ROUTE_HIT_WIDTH_PX } from './routeStyle';\npaint: { 'line-width': ROUTE_HIT_WIDTH_PX, 'line-opacity': 0 }`)[0]).toBeNull();
  });
});
