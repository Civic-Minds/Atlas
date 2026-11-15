import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { directionBranchFallback } from '../headsignDisplay';
import { directionLabel, type LiveV3 } from '../liveDashboard';

// CIV-1569 part 6: one fallback name for a direction, one numbering (from 1).
describe('direction fallback (CIV-1569)', () => {
  it('the bound label when there is one, else "Direction " + the id counted from 1', () => {
    expect(directionBranchFallback(0)).toBe('Direction 1');
    expect(directionBranchFallback(1)).toBe('Direction 2');
    expect(directionBranchFallback(0, 'Westbound')).toBe('Westbound');
  });

  it("Live's direction names use the same fallback", () => {
    const v3 = { directionLabels: { '1': 'Eastbound' } } as unknown as LiveV3;
    expect(directionLabel(v3, 1)).toBe('Eastbound');
    expect(directionLabel(v3, 0)).toBe('Direction 1');
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

describe('no hand-built "Direction N" (CIV-1569)', () => {
  it('only directionBranchFallback writes it', () => {
    const hits = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).flatMap(f => {
      const name = relative(ROOT, f);
      if (name === 'shared/headsignDisplay.ts') return [];
      return code(readFileSync(f, 'utf8')).split('\n')
        .filter(line => /Direction \$\{|['"]Direction ['"] *\+/.test(line))
        .map(line => `${name}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
