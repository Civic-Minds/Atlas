import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_TIER_MAXES, MODE_TIER_SCALES, RAIL_TIER_MAXES, SURFACE_TIER_MAXES, TIER_LABELS, VIOLATION_PERCENT_BY_TIER } from '../frequencyRules';
import { HEADWAY_TIERS } from '../config';

/**
 * Every frequency scale lives in shared/frequencyRules.ts (Ryan, 2026-11-17: "we need to keep this info centralized").
 * These pin the values the move kept, and fail on a hand-typed tier list anywhere else.
 */
describe('the frequency scales (one home)', () => {
  it('keeps every scale\'s values', () => {
    expect(SURFACE_TIER_MAXES).toEqual([10, 15, 20, 30, 60]);
    // Rail keeps its 8 and has no 20 (Ryan's open call).
    expect(RAIL_TIER_MAXES).toEqual([5, 8, 10, 15, 30, 60]);
    expect(MODE_TIER_SCALES).toEqual({ surface: SURFACE_TIER_MAXES, rail: RAIL_TIER_MAXES });
    expect(ALL_TIER_MAXES).toEqual([5, 8, 10, 15, 20, 30, 60]);
    expect(VIOLATION_PERCENT_BY_TIER).toEqual({ 5: 0.10, 8: 0.10, 10: 0.10, 15: 0.10, 20: 0.05, 30: 0.05, 60: 0.05 });
    expect(Object.keys(TIER_LABELS).map(Number)).toEqual(ALL_TIER_MAXES);
    expect(HEADWAY_TIERS.map(t => t.max)).toEqual([...SURFACE_TIER_MAXES, Infinity]);
  });

  const ROOT = join(import.meta.dirname, '..', '..');
  const HOME = 'shared/frequencyRules.ts';
  // Lists of minutes that are not frequency scales, each with its reason.
  const NOT_A_SCALE: Record<string, string> = {
    'shared/connections.ts': 'CONNECTION_WINDOWS: the connections view\'s wait groups (Ryan, 2026-11-04), not tiers',
    'scripts/audit-frequency-candidates.ts': 'the 2026-10 study\'s candidate near-miss curves, alternatives it compared',
  };
  const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap(name => {
    const rel = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
    if (statSync(join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.(ts|tsx|mts)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
  const T = '(?:5|8|10|15|20|30|60)';
  // Three or more tier minutes in a row, as an array or as object keys.
  const LIST = new RegExp(`\\[\\s*${T}(?:\\s*,\\s*${T}){2,}\\s*\\]`);
  const KEYS = new RegExp(`\\b${T}\\s*:\\s*[^,{}\\n]+,\\s*${T}\\s*:\\s*[^,{}\\n]+,\\s*${T}\\s*:`);

  it('has no hand-typed tier list outside shared/frequencyRules.ts', () => {
    const found = ['src', 'shared', 'pipeline', 'scripts', 'api', 'local-api']
      .flatMap(files)
      .filter(f => f !== HOME && !(f in NOT_A_SCALE))
      .filter(f => {
        const text = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
        return LIST.test(text) || KEYS.test(text);
      });
    expect(found).toEqual([]);
  });
});
