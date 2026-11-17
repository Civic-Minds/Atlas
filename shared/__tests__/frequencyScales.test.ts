import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as rules from '../frequencyRules';
import { publicTierOf, PUBLIC_TIER_MAXES, TIER_MAXES, VIOLATION_PERCENT_BY_TIER } from '../frequencyRules';
import { HEADWAY_TIERS } from '../config';

/**
 * Every frequency scale lives in shared/frequencyRules.ts (Ryan, 2026-11-17: "we need to keep this info centralized").
 * These pin the values the move kept, and fail on a hand-typed tier list anywhere else.
 */
describe('the frequency scales (one home)', () => {
  it('keeps every scale\'s values', () => {
    expect(PUBLIC_TIER_MAXES).toEqual([10, 15, 20, 30, 60]);
    expect(TIER_MAXES).toEqual([5, 8, 10, 15, 20, 30, 60]);
    expect(VIOLATION_PERCENT_BY_TIER).toEqual({ 5: 0.10, 8: 0.10, 10: 0.10, 15: 0.10, 20: 0.05, 30: 0.05, 60: 0.05 });
    expect(HEADWAY_TIERS.map(t => t.max)).toEqual([...PUBLIC_TIER_MAXES, Infinity]);
  });

  // CIV-1813. Ryan: "I do not know why I am repeating myself when I ask why there are any separate frequency bands
  // between modes". One grading scale for every mode; its finer grades count as the next public grade up.
  it('grades every mode on one scale, with every public grade and finer grades only inside one', () => {
    for (const t of PUBLIC_TIER_MAXES) expect(TIER_MAXES, `the scale skips the public ${t}`).toContain(t);
    for (const t of TIER_MAXES) expect(publicTierOf(t), `${t}`).not.toBeNull();
    expect([5, 8, 10, 12, 16, 20, 60].map(publicTierOf)).toEqual([10, 10, 10, 15, 20, 20, 60]);
    expect(publicTierOf(61)).toBeNull();
  });

  it('has no scale exported for one mode', () => {
    // Every exported number list is the one scale or the public one; no RAIL_/SURFACE_/BUS_ list.
    const lists = Object.entries(rules).filter(([, v]) => Array.isArray(v) || (v && typeof v === 'object' && Object.values(v).some(Array.isArray)));
    expect(lists.map(([k]) => k).sort()).toEqual(['PUBLIC_TIER_MAXES', 'TIER_MAXES']);
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

  it('has no mode-specific scale anywhere in the code', () => {
    const MODE_SCALE = /\b(?:RAIL_TIER_MAXES|SURFACE_TIER_MAXES|BUS_TIER_MAXES|MODE_TIER_SCALES|modeTierOverrides|getTiersForCriteria)\b/;
    const found = ['src', 'shared', 'pipeline', 'scripts', 'api', 'local-api', 'types']
      .flatMap(files)
      .filter(f => MODE_SCALE.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(found).toEqual([]);
  });
});
