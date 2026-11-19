import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDryRun, comparePeriod, seasonOf, summarize } from '../history-v2-repick-report.js';

const base = { periodKey: '20180924', publishedRefDate: '20180924', publishedPickedBy: 'legacy-or-absent' };

describe('History re-pick dry run (CIV-1313)', () => {
  it('refuses any argument that asks for a write', () => {
    expect(() => assertDryRun(['--slug', 'stm', '--in', 'a', '--out', 'tmp/output'])).not.toThrow();
    for (const bad of ['--write', '--upload', '--replace-approved', '--overwrite', '--publish']) expect(() => assertDryRun([bad])).toThrow(/never writes/);
  });

  it('is read-only by construction: no R2 writer, sink or upload helper in the source, and no R2 import outside --list-slugs', () => {
    const src = readFileSync(resolve(__dirname, '../history-v2-repick-report.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '');
    expect(src).not.toMatch(/r2Put|r2Delete|PutObject|DeleteObject|localDirSink|r2ArchiveSink|writeSidecar|history-v2-upload|historyPublishLib\.js'.*assertWriteGate/);
    expect(src.match(/writeFileSync\(/g)?.length).toBe(3);
    expect(src.match(/import\('\.\/r2\.js'\)/g)?.length).toBe(1);
    expect(src).toMatch(/r2ListArchive\('history-v2\/'\)/);
    expect(src).not.toMatch(/^import .*r2\.js/m);
  });

  it('counts a changed week and season, and route differences', () => {
    const row = comparePeriod(base,
      { refDate: '20180924', routes: { a: { p: 1 }, b: { p: 2 }, c: { p: 3 } } },
      { refDate: '20180618', anchor: '20180618', routes: { a: { p: 1 }, b: { p: 9 }, d: { p: 4 } } });
    expect(row).toMatchObject({ refDateChanged: true, seasonChanged: true, routes: 4, routesChanged: 1, routesAdded: 1, routesRemoved: 1, periodChanged: true });
    expect(seasonOf('20181210')).toBe('winter');
  });

  it('an identical re-pick changes nothing; summary counts periods, routes and agencies', () => {
    const same = comparePeriod(base, { refDate: '20180924', routes: { a: { p: 1 } } }, { refDate: '20180924', anchor: '20180924', routes: { a: { p: 1 } } });
    expect(same.periodChanged).toBe(false);
    const diff = comparePeriod(base, { refDate: '20180924', routes: { a: 1 } }, { refDate: '20180618', anchor: '20180618', routes: { a: 2 } });
    const s = summarize([{ slug: 'x', rows: [same, diff, { ...base, skipped: 'no zip' }] }, { slug: 'y', rows: [same] }]);
    expect(s).toMatchObject({ agencies: 2, agenciesWithChange: 1, periods: 4, periodsRead: 3, periodsChanged: 1, periodsSeasonChanged: 1, periodsNotRead: 1, routesChanged: 1 });
  });
});
