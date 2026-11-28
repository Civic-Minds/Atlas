import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headwayPeriodShape, periodShapeParts } from '../../../shared/headwayText';
import { clockTime } from '../../../shared/timeText';
import { periodEdgeText } from '../effectiveHeadway';
import { copyPeriodEdge, type PeriodEdge } from '../../../shared/periodEdge';

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

// Guard (CIV-3186, replacing CIV-3135's per-copy check): an edge is copied field by field in one place only,
// copyPeriodEdge in shared/periodEdge.ts, and its type is written out only there, so a new edge field ("before") is added once
// and no card, list, agency page or Studio comparison can drop it.
const ROOTS = ['src', 'shared', 'pipeline', 'scripts'];
const EDGE_HOME = join('shared', 'periodEdge.ts');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name === '__snapshots__' || name === 'fixtures') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('one period edge type and copy (CIV-3186)', () => {
  it('no field-by-field edge copy or inline edge type outside shared/periodEdge.ts', () => {
    const copies: string[] = [];
    for (const file of ROOTS.flatMap(sources)) {
      if (file === EDGE_HOME) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/\{ thenGap: \w+\.thenGap \}|from\?: number; until\?: number; every: number/.test(line)) copies.push(`${file}:${i + 1}`);
      });
    }
    expect(copies).toEqual([]);
  });

  it('copyPeriodEdge keeps every edge field, drops absent ones and anything else', () => {
    const full = { from: 400, until: 1200, every: 15, then: 30, thenGap: 37, before: 32 };
    expect(copyPeriodEdge({ ...full, stretch: 2, partOfRoute: true } as PeriodEdge)).toEqual(full);
    const plain = copyPeriodEdge({ every: 24, from: 760, until: undefined });
    expect(plain).toEqual({ from: 760, every: 24 });
    expect(Object.keys(plain)).toEqual(['from', 'every']);
  });
});
