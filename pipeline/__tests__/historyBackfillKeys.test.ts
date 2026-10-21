import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { historyRouteKey } from '../historyRouteKey.js';

describe('history route keys', () => {
  it('falls back short name, then route_id, then long name', () => {
    expect(historyRouteKey({ routeShortName: '', routeId: '', routeLongName: ' Lake Line ' })).toBe('Lake Line');
    expect(historyRouteKey({ routeShortName: ' ', routeId: 'r9', routeLongName: 'Lake' })).toBe('r9');
  });

  it('no backfill skips a route because its short name is blank', () => {
    const dir = resolve(__dirname, '..');
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter(f => /^backfill-.*\.ts$/.test(f))) {
      readFileSync(resolve(dir, file), 'utf8').split('\n').forEach((line, i) => {
        if (/!\s*\w+(?:\.properties)?\.routeShortName\b/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
