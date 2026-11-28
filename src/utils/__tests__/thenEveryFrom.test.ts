import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headwayPeriodShape, periodShapeParts } from '../../../shared/headwayText';
import { clockTime } from '../../../shared/timeText';
import { periodEdgeText } from '../effectiveHeadway';

// CIV-3135 (Ryan, 2026-11-28, "1"): service that comes more often partway through a period names the slower part first,
// "every 32 min, then every 17 from 4:37 PM", so a plain "from" only ever means the first bus. The pipeline side (slowStartEdge's
// `before`) is tested in pipeline/__tests__/slowStartEdge.test.ts: src tests can't import pipeline code (.vercelignore).
const plain = (text: string) => text.replace(/⁠/g, '').replace(/[  ]/g, ' ');
const at437 = 16 * 60 + 37;

describe('"every N min, then every M from <time>" (CIV-3135)', () => {
  it('reads Ryan\'s pick word for word (OC Transpo 41 westbound, weekday PM peak)', () => {
    expect(plain(headwayPeriodShape({ before: 32, every: 17, from: clockTime(at437) }))).toBe('every 32 min, then every 17 from 4:37 PM');
    expect(plain(periodEdgeText({ before: 32, every: 17, from: at437 }))).toBe('every 32 min, then every 17 from 4:37 PM');
  });

  it('a plain "from" (the first bus) and the "until … then" reading are unchanged', () => {
    expect(plain(periodEdgeText({ every: 24, from: 12 * 60 + 40 }))).toBe('every 24 min from 12:40 PM');
    expect(plain(periodEdgeText({ every: 15, until: 20 * 60 + 57, then: 30 }))).toBe('every 15 min until 8:57 PM, then every 30 min');
  });

  it('a table splits it into the slower spacing and the change', () => {
    expect(periodShapeParts('every 32 min, then every 17 from 4:37 PM')).toEqual({ main: 'every 32 min', note: 'then every 17 from 4:37 PM' });
  });
});

// Guard: every place that copies an edge field by field ("...(e.thenGap != null ? { thenGap: e.thenGap } : {})") copies
// `before` too, so no card, list, agency page or Studio comparison drops the slower part's number.
const ROOTS = ['src', 'shared', 'pipeline', 'scripts'];
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name === '__snapshots__' || name === 'fixtures') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('edge copies keep "before" (CIV-3135 guard)', () => {
  it('every field-by-field copy of thenGap also copies before', () => {
    const missing: string[] = [];
    for (const file of ROOTS.flatMap(sources)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\{ thenGap: (\w+)\.thenGap \}/g)) {
          if (!line.includes(`before: ${m[1]}.before`)) missing.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(missing).toEqual([]);
  });
});
