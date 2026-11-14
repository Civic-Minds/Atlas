import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routeShortLabel, routesShortLabel, withRouteWord } from './format';

// CIV-1569: "Route " + a route's number comes from one place, built on routeLabels().primary.
describe('routeShortLabel (CIV-1569)', () => {
  it('keeps the agency form of the number, drops leading zeros', () => {
    expect(routeShortLabel('504')).toBe('Route 504');
    expect(routeShortLabel('52A')).toBe('Route 52A');
    expect(routeShortLabel('01')).toBe('Route 1');
    expect(routeShortLabel('SSSF')).toBe('Route SSSF');
    expect(routeShortLabel(' 1X ')).toBe('Route 1X');
    expect(routeShortLabel('')).toBe('');
    expect(routeShortLabel(null)).toBe('');
  });

  it('lists several routes after one "Routes"', () => {
    expect(routesShortLabel(['504'])).toBe('Route 504');
    expect(routesShortLabel(['501', '504'])).toBe('Routes 501, 504');
    expect(routesShortLabel([])).toBe('');
  });

  it('puts "Route " before a label already built', () => {
    expect(withRouteWord('504 — King')).toBe('Route 504 — King');
  });
});

const ROOT = resolve(__dirname, '../..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

describe('no hand-built "Route " + name (CIV-1569)', () => {
  // format.ts holds the builders; cleanRouteDisplayName rewrites "Route 01" inside a feed's own name.
  const ALLOWED = new Set(['src/utils/format.ts']);
  it('every "Route <number>" comes from routeShortLabel / withRouteWord', () => {
    const hits = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).flatMap(f => {
      const name = relative(ROOT, f);
      if (ALLOWED.has(name)) return [];
      return code(readFileSync(f, 'utf8')).split('\n')
        .filter(line => /Routes? \$\{|['"]Routes? ['"] *\+|>Routes? \$\{/.test(line))
        .map(line => `${name}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
