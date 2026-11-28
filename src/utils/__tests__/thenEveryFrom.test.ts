import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headwayPeriodShape, periodShapeParts } from '../../../shared/headwayText';
import { clockTime } from '../../../shared/timeText';
import { periodEdgeText } from '../effectiveHeadway';
import { periodEdge, slowStartEdge } from '../../../pipeline/tripSets';

// CIV-3135 (Ryan, 2026-11-28, "1"): service that comes more often partway through a period names the slower part first,
// "every 32 min, then every 17 from 4:37 PM", so a plain "from" only ever means the first bus.
const plain = (text: string) => text.replace(/⁠/g, '').replace(/[  ]/g, ' ');
const PM = { start: 15 * 60, end: 19 * 60 };
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

  it('the pipeline marks a slow start with the wait before it, and a late start with none', () => {
    // Every 35 or so from 3:00, then every 17 from 4:37 to the end of the peak.
    const times = [900, 935, 970, at437, ...Array.from({ length: 8 }, (_, i) => at437 + 17 * (i + 1))].filter(t => t < PM.end);
    const value = Math.ceil(Math.max(...times.slice(1, 4).map((t, i) => t - times[i])));
    expect(slowStartEdge(times, PM.start, PM.end, value)).toMatchObject({ from: at437, before: value });
    const late = Array.from({ length: 8 }, (_, i) => at437 + 17 * i);
    expect(periodEdge(late, PM.start, PM.end, at437 - PM.start)).not.toHaveProperty('before');
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
