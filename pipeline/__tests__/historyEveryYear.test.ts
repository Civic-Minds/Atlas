/**
 * History v2: one snapshot per route per year for every year the route ran (a sidecar entry with a
 * weekday headline), regardless of whether the headway changed. Old per-route change files (no
 * sidecar) keep the change-only rule: nothing is invented for a v1-only period.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';
import { filterSnapshotsForPublish, isFlatRouteToSkip } from '../historyV2Build.js';
import { routesForYear, snapshotValue, yearsAvailable } from '../../shared/historyV2Reader.js';

const j = (v: unknown) => JSON.stringify(v);
const side = (periodKey: string, routes: Record<string, unknown>) =>
  j({ version: 2, slug: 'delta', periodKey, refDate: periodKey, routes });

function deltaFixture() {
  const archive: Record<string, string> = {};
  // Sidecars. A: same headway 2014-2016. B: ran 2014 and 2016, absent from the 2015 sidecar.
  // C: limited (no number) in 2014 and 2015. D: blank weekday in 2015.
  archive['history-v2/delta/20140901.json'] = side('20140901', { A: { name: 'Alpha', rep: { h: 20 } }, B: { name: 'Bravo', rep: { h: 30 } }, C: { rep: { lim: true }, flag: 'limited' } });
  archive['history-v2/delta/20150901.json'] = side('20150901', { A: { name: 'Alpha', rep: { h: 20 } }, C: { rep: { lim: true }, flag: 'limited' }, D: { rep: {} } });
  archive['history-v2/delta/20160901.json'] = side('20160901', { A: { name: 'Alpha', rep: { h: 20 } }, B: { name: 'Bravo', rep: { h: 30 } }, M: { name: 'Mike', rep: { h: 20 } } });
  archive['history-v2/delta/20170901.json'] = side('20170901', { M: { name: 'Mike', rep: { h: 20 } } });
  // M: old per-route change files only for 2012-2015 (no sidecar covers 2012-2013 at all; the
  // 2014 and 2015 sidecars exist but do not list M). Same value in 2012-2014: change-only keeps 2012.
  for (const [pk, h] of [['20120901', 30], ['20130901', 30], ['20140901', 30], ['20150901', 20]] as const) archive[`history/delta/M/${pk}.json`] = j({ headway: h });
  const feature = (props: Record<string, unknown>) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79, 43], [-79, 43.1]] }, properties: { day: 'Weekday', directionId: 0, routeType: 3, ...props } });
  const pub = { 'atlas/delta.json': j({ type: 'FeatureCollection', features: [feature({ routeShortName: 'A', routeLongName: 'Alpha', headway: 20, routeAllDayHeadway: 20 })] }) };
  return { archive, pub, index: { agencies: [{ slug: 'delta', name: 'Delta Transit', region: 'Ontario', center: [-79, 43] }] }, aliases: {} };
}

vi.mock('../r2.js', async () => {
  const fx = deltaFixture();
  const { capture: cap } = await import('./historyBuild/harness.js');
  const list = (store: Record<string, string>) => async (prefix: string) => Object.keys(store).filter(k => k.startsWith(prefix)).sort();
  return {
    r2ListArchive: list(fx.archive),
    r2GetArchive: async (key: string) => fx.archive[key] ?? null,
    r2Get: async (key: string) => (fx.pub as Record<string, string>)[key] ?? null,
    r2Put: async (key: string, body: string) => { cap().puts![key] = body; if (key === 'atlas/history-config.json') cap().historyConfig = body; },
  };
});
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  const { capture: cap } = await import('./historyBuild/harness.js');
  const fx = deltaFixture();
  const readFileSync = ((p: unknown, ...rest: unknown[]) => {
    const path = String(p);
    if (path.endsWith('public/data/index.json')) return JSON.stringify(fx.index);
    if (path.endsWith('config/history-route-aliases.json')) return JSON.stringify(fx.aliases);
    return (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof actual.readFileSync;
  const writeFileSync = ((p: unknown, content: unknown) => { cap().files[String(p)] = String(content); }) as typeof actual.writeFileSync;
  const mkdirSync = (() => undefined) as unknown as typeof actual.mkdirSync;
  return { ...actual, readFileSync, writeFileSync, mkdirSync, default: { ...actual, readFileSync, writeFileSync, mkdirSync } };
});
vi.mock('../../scripts/build-history-agency-list.js', async () => {
  const { capture: cap } = await import('./historyBuild/harness.js');
  return { writeHistoryAgencyList: () => { cap().resolveDone?.(); return 0; } };
});

describe('filterSnapshotsForPublish / isFlatRouteToSkip', () => {
  const v2 = { refDate: '20140901' };
  const snaps = [{ weekdayHeadwayMin: 20, v2 }, { weekdayHeadwayMin: 20, v2 }, { weekdayHeadwayMin: 20 }, { weekdayHeadwayMin: 20 }];
  it('legacy rule without v2 mode drops equal-to-previous snapshots', () => {
    expect(filterSnapshotsForPublish(snaps, { materializeAllPeriods: false, keepEveryV2Year: false })).toHaveLength(1);
  });
  it('v2 mode keeps every sidecar-backed snapshot and still collapses unchanged old-file ones', () => {
    expect(filterSnapshotsForPublish(snaps, { materializeAllPeriods: false, keepEveryV2Year: true })).toEqual([snaps[0], snaps[1]]);
  });
  it('materialized periods keep everything', () => {
    expect(filterSnapshotsForPublish(snaps, { materializeAllPeriods: true, keepEveryV2Year: false })).toHaveLength(4);
  });
  it('a flat route is skipped unless v2-backed, trip-duration or materialized', () => {
    const flatV1 = [{ weekdayHeadwayMin: 20 }, { weekdayHeadwayMin: 20 }];
    const flatV2 = [{ weekdayHeadwayMin: 20, v2 }, { weekdayHeadwayMin: 20 }];
    const o = { materializeAllPeriods: false, hasTripDuration: false, keepEveryV2Year: true };
    expect(isFlatRouteToSkip(flatV1, o)).toBe(true);
    expect(isFlatRouteToSkip(flatV2, o)).toBe(false);
    expect(isFlatRouteToSkip(flatV2, { ...o, keepEveryV2Year: false })).toBe(true);
    expect(isFlatRouteToSkip(flatV1, { ...o, hasTripDuration: true })).toBe(false);
  });
});

describe('build-history with ATLAS_HISTORY_V2=1: every year a route ran', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.ATLAS_HISTORY_V2; });

  type Snap = { year: number; weekdayHeadwayMin: number; v2?: unknown; label: string };
  type Route = { routeShortName: string; snapshots: Snap[] };

  it('lists routes per year from the sidecars alone, never inventing values', async () => {
    vi.resetModules();
    const cap = resetCapture();
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await cap.done;
    const agency = (JSON.parse(cap.historyConfig!) as Array<{ slug: string; routes: Route[] }>).find(r => r.slug === 'delta')!;
    const keys = (y: number) => routesForYear(agency, y).map(r => r.route.routeShortName).sort();
    const pairs = (k: string) => agency.routes.find(r => r.routeShortName === k)!.snapshots.map(s => [s.year, s.weekdayHeadwayMin]);

    // Same headway 2014-2016: present in all three years (plus the current endpoint).
    expect(pairs('A')).toEqual([[2014, 20], [2015, 20], [2016, 20], [2026, 20]]);
    // Ran 2014 and 2016, absent from the 2015 sidecar: absent in 2015. A flat route is still listed.
    expect(pairs('B')).toEqual([[2014, 30], [2016, 30]]);
    // Limited (C) and blank weekday (D): never listed, nothing invented.
    expect(agency.routes.some(r => r.routeShortName === 'C' || r.routeShortName === 'D')).toBe(false);
    expect(keys(2014)).toEqual(['A', 'B']); // M's 2014 old-file value equals 2013: not expanded
    expect(keys(2015)).toEqual(['A', 'M']);
    expect(keys(2016)).toEqual(['A', 'B', 'M']);
    expect(keys(2017)).toEqual(['M']);
    // v1-only periods are not expanded: M 2012 (first) and 2015 (changed) from old files; 2013, 2014 stay absent.
    expect(pairs('M')).toEqual([[2012, 30], [2015, 20], [2016, 20], [2017, 20]]);
    expect(keys(2013)).toEqual([]);
    expect(yearsAvailable(agency)).toEqual([2012, 2014, 2015, 2016, 2017, 2026]);
    // The sidecar-backed years read as values; the old-file years too (weekday only).
    const a2015 = routesForYear(agency, 2015).find(r => r.route.routeShortName === 'A')!;
    expect(snapshotValue(a2015.snapshot, 'weekday')).toEqual({ kind: 'value', min: 20 });

    // Visibility/report: the limited and blank drops are reported, not silent.
    const report = JSON.parse(cap.files[Object.keys(cap.files).find(f => f.includes('history-build-report.json'))!]) as { drops: Array<{ route: string; reason: string }> };
    expect(report.drops.map(d => `${d.route}:${d.reason}`).sort()).toEqual(['C:no weekday headline', 'C:no weekday headline', 'D:no weekday headline']);
  }, 30_000);
});
