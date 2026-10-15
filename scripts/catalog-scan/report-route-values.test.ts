import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPORT = join(import.meta.dirname, 'report.py');
const period = (wdph: number | null, pass: number[]) => ({ wdph, wdpch: wdph, value: wdph, pass });
const route = (midday: ReturnType<typeof period>, route60 = true) => ({
  short: '9', long: 'Nine', features: 2,
  periods: { all: period(10, [10, 15, 20, 30, 60]), amPeak: period(10, [10, 15, 20, 30, 60]), midday, pmPeak: period(10, [10, 15, 20, 30, 60]), evening: period(10, [10, 15, 20, 30, 60]), late: period(null, []), overnight: period(null, []) },
  night: { dirs: { 0: { n30: false, n60: route60 } }, route30: false, route60 },
});
function dir(routes: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), 'rv-'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'x.json'), JSON.stringify({ slug: 'x', routes }));
  return d;
}
const report = (a: string, b: string) => execFileSync('python3', ['-I', REPORT, 'route-values', a, b], { encoding: 'utf8' });

describe('report.py route-values', () => {
  it('prints 0 rows when a run is compared with itself', () => {
    const a = dir({ 'R||Weekday': route(period(10, [10, 15, 20, 30, 60])) });
    const out = report(a, a);
    expect(out).toContain('rows changed: 0 | night changed: 0 | route-days added: 0, removed: 0');
  });

  it('lists a changed value with the threshold flips, and a Night change', () => {
    const a = dir({ 'R||Weekday': route(period(8, [10, 15, 20, 30, 60])) });
    const b = dir({ 'R||Weekday': route(period(25, [30, 60]), false) });
    const out = report(a, b);
    expect(out).toContain('rows changed: 1 | night changed: 1');
    expect(out).toContain('midday');
    expect(out).toContain('wdph 8->25');
    expect(out).toContain('10:pass->fail 15:pass->fail 20:pass->fail');
    expect(out).toContain('60:True->False');
  });

  it('reports added and removed route-days', () => {
    const a = dir({ 'R||Weekday': route(period(10, [10])) });
    const b = dir({ 'S||Weekday': route(period(10, [10])) });
    expect(report(a, b)).toContain('route-days added: 1, removed: 1');
  });
});
