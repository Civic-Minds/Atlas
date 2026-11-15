import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISSING_VALUE } from '../missingValue';
import { headwayAmount, headwayEvery } from '../headwayText';

// CIV-1569 part 4: one mark for a missing value, the em dash the frequency text already used.
describe('missing value (CIV-1569)', () => {
  it('is the em dash, the same mark a missing frequency prints', () => {
    expect(MISSING_VALUE).toBe('—');
    expect(headwayEvery(null)).toBe(MISSING_VALUE);
    expect(headwayAmount(undefined)).toBe(MISSING_VALUE);
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

describe('no hand-typed dash for an empty cell (CIV-1569)', () => {
  it('a lone dash string or JSX text comes from MISSING_VALUE', () => {
    const allowed = new Set(['shared/missingValue.ts']);
    const hits = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).flatMap(f => {
      const name = relative(ROOT, f);
      if (allowed.has(name)) return [];
      return code(readFileSync(f, 'utf8')).split('\n')
        .filter(line => /['"`][—–]['"`]|>[—–]<|=["'][—–]["']/.test(line) && !/\.(split|join|replace)\(/.test(line))
        .map(line => `${name}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
