import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { historyRouteKey } from '../historyRouteKey.js';

describe('history route keys', () => {
  it('v2 falls back short name, then route_id, then long name', () => {
    expect(historyRouteKey({ routeShortName: '', routeId: '', routeLongName: ' Lake Line ' }, { longNameFallback: true })).toBe('Lake Line');
    expect(historyRouteKey({ routeShortName: ' ', routeId: 'r9', routeLongName: 'Lake' }, { longNameFallback: true })).toBe('r9');
  });

  it('no backfill skips a route inline because its short name is blank (they go through backfillRouteKey, which is flag-gated)', () => {
    const dir = resolve(__dirname, '..');
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter(f => /^backfill-.*\.ts$/.test(f))) {
      readFileSync(resolve(dir, file), 'utf8').split('\n').forEach((line, i) => {
        if (/!\s*\w+(?:\.properties)?\.routeShortName\b/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the legacy backfills take their key from backfillRouteKey (flag-gated, default = old skip)', () => {
    for (const slug of ['mdb', 'gcrta', 'cdta', 'mbta', 'norta']) {
      const src = readFileSync(resolve(__dirname, '..', `backfill-${slug}-history.ts`), 'utf8');
      expect(src, slug).toMatch(/backfillRouteKey\(/);
      expect(src, slug).not.toMatch(/historyRouteKey\(/);
    }
  });
});
