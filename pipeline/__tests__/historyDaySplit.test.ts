/**
 * History v2 day-type split: an old route that ran all week continues as one weekday-only and one
 * weekend-only route (Caltrain "Local" -> "Local Weekday" + "Local Weekend"). Synthetic fixtures only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetCapture } from './historyBuild/harness.js';
import {
  aliasesFor, currentRouteShortNamesFor, mergeAliasedRoutes, projectArchiveByDay, projectSidecarByDay,
  weekendOnlyKeysFor, type HistoryAliasEntry,
} from '../historyIdentity.js';
import { buildRouteSnapshots, filterSnapshotsForPublish, isFlatRouteToSkip, newBuildReport, visibilityCheck } from '../historyV2Build.js';
import { parseHistoryAgencyV2, routesForYear, snapshotValue } from '../../shared/historyV2Reader.js';

const j = (v: unknown) => JSON.stringify(v);
const side = (periodKey: string, routes: Record<string, unknown>) =>
  j({ version: 2, slug: 'caltrain', periodKey, refDate: periodKey, routes });

const ALIASES = {
  caltrain: {
    'Local Weekday': [{ key: 'Local', days: 'weekday' }],
    'Local Weekend': [{ key: 'Local', days: 'weekend' }],
    Express: ['Ltd'], // an ordinary whole-route alias in the same agency
  },
} as const;

function fixture() {
  const archive: Record<string, string> = {};
  // 2017: Local runs all week. 2020: Saturday only at weekends (Sunday positively none).
  archive['history-v2/caltrain/20170901.json'] = side('20170901', {
    Local: { name: 'Local', rep: { h: 30 }, sat: { h: 60 }, sun: { h: 90 } },
    Ltd: { name: 'Limited', rep: { h: 40 } },
    X: { name: 'Ordinary weekend-only look-alike', rep: {}, sat: { h: 45 } }, // ordinary route: blank weekday, has a Saturday value
  });
  archive['history-v2/caltrain/20200901.json'] = side('20200901', {
    Local: { name: 'Local', rep: { h: 30 }, sat: { h: 60 }, sun: { none: true } },
    Ltd: { name: 'Limited', rep: { h: 40 } },
  });
  // 2018: an old per-route change file for Local (weekday only: v1 files carry no Saturday or Sunday).
  archive['history/caltrain/Local/20180901.json'] = j({ headway: 35 });
  // Local Weekday and Local Weekend exist from 2025 under their own keys.
  archive['history-v2/caltrain/20250901.json'] = side('20250901', {
    'Local Weekday': { name: 'Local Weekday', rep: { h: 20 }, sat: { none: true }, sun: { none: true } },
    'Local Weekend': { name: 'Local Weekend', rep: {}, sat: { h: 60 }, sun: { h: 60 } },
    Express: { name: 'Express', rep: { h: 40 } },
  });
  const feature = (props: Record<string, unknown>) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-122, 37], [-122, 37.1]] }, properties: { day: 'Weekday', directionId: 0, routeType: 2, ...props } });
  const pub = { 'atlas/caltrain.json': j({ type: 'FeatureCollection', features: [feature({ routeShortName: 'Local Weekday', routeLongName: 'Local Weekday', headway: 20, routeAllDayHeadway: 20 })] }) };
  return { archive, pub, index: { agencies: [{ slug: 'caltrain', name: 'Caltrain', region: 'California', center: [-122, 37] }] }, aliases: ALIASES };
}

vi.mock('../r2.js', async () => {
  const fx = fixture();
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
  const fx = fixture();
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

type Entry = { periodKey: string; v2: { refDate: string; rep: { h?: number }; sat?: unknown; sun?: unknown; flag?: string; name?: string } };
const entry = (periodKey: string, v2: Omit<Entry['v2'], 'refDate'>): Entry => ({ periodKey, v2: { refDate: periodKey, ...v2 } });

describe('mergeAliasedRoutes', () => {
  it('plain aliases behave exactly as before (whole route folded, old key removed, chain order kept)', () => {
    const routes = { '2/302': [1, 2], '2': [3], '51/52': [4], '51/52/351': [5], '51': [6], other: [7] };
    const aliases = { '2': ['2/302'], '51': ['51/52/352', '51/52/351', '51/52'] };
    const r = mergeAliasedRoutes(routes, aliases);
    expect(r).toEqual({ routes: { '2': [3, 1, 2], '51': [6, 5, 4], other: [7] }, merged: 3 });
    // a string-only config never needs a projection
    expect(mergeAliasedRoutes(routes, aliases, projectArchiveByDay).routes).toEqual(r.routes);
  });

  it('no aliases for the agency leaves everything untouched', () => {
    expect(mergeAliasedRoutes({ a: [1] }, undefined)).toEqual({ routes: { a: [1] }, merged: 0 });
  });

  it('splits the old key by day type; old key is gone; input is not mutated', () => {
    const local = [
      entry('20170901', { rep: { h: 30 }, sat: { h: 60 }, sun: { h: 90 }, flag: 'fast', name: 'Local' }),
      entry('20200901', { rep: { h: 30 }, sat: { h: 60 }, sun: { none: true } }),
      entry('20210901', { rep: { h: 30 }, sat: { none: true }, sun: { none: true } }), // weekday-only year
    ];
    const input = { Local: local, 'Local Weekday': [entry('20250901', { rep: { h: 20 } })], Ltd: [entry('20170901', { rep: { h: 40 } })] };
    const before = j(input);
    const slugAliases = ALIASES.caltrain as unknown as Record<string, HistoryAliasEntry[]>;
    const { routes, merged } = mergeAliasedRoutes(input, slugAliases, projectSidecarByDay);
    expect(j(input)).toBe(before);
    expect(merged).toBe(3); // two day-type entries + Ltd
    expect(routes.Local).toBeUndefined();
    expect(routes.Ltd).toBeUndefined();
    expect(routes.Express).toHaveLength(1);

    const wd = routes['Local Weekday'];
    expect(wd.map(e => e.periodKey)).toEqual(['20250901', '20170901', '20200901', '20210901']);
    // weekday day type: Monday-Friday value kept, Saturday and Sunday dropped (blank), flag stays with the weekday value
    expect(wd[1].v2).toEqual({ refDate: '20170901', rep: { h: 30 }, flag: 'fast', name: 'Local' });
    expect(wd[2].v2).toEqual({ refDate: '20200901', rep: { h: 30 } });

    const we = routes['Local Weekend'];
    expect(we.map(e => e.periodKey)).toEqual(['20170901', '20200901']); // 2021 has no weekend value: not carried
    // weekend day types: weekday blank, Saturday and Sunday kept as recorded (a Sunday "none" stays none), no weekday flag
    expect(we[0].v2).toEqual({ refDate: '20170901', rep: {}, sat: { h: 60 }, sun: { h: 90 }, name: 'Local' });
    expect(we[1].v2).toEqual({ refDate: '20200901', rep: {}, sat: { h: 60 }, sun: { none: true } });
  });

  it('old per-route change files (weekday only) go to the weekday route and never the weekend one', () => {
    const change = { periodKey: '20180901', headway: 35 };
    const { routes } = mergeAliasedRoutes({ Local: [change] }, ALIASES.caltrain as unknown as Record<string, HistoryAliasEntry[]>, projectArchiveByDay);
    expect(routes['Local Weekday']).toEqual([change]);
    expect(routes['Local Weekend']).toEqual([]);
  });

  it('alias helpers see the old key under both targets', () => {
    const al = { caltrain: ALIASES.caltrain } as unknown as Parameters<typeof aliasesFor>[0];
    expect(aliasesFor(al, 'caltrain', 'Local Weekend')).toEqual(['Local']);
    expect(aliasesFor(al, 'caltrain', 'Express')).toEqual(['Ltd']);
    const sa = al.caltrain;
    expect(currentRouteShortNamesFor('Local', undefined, sa).sort()).toEqual(['Local Weekday', 'Local Weekend']);
    expect([...weekendOnlyKeysFor(sa)]).toEqual(['Local Weekend']);
    expect(weekendOnlyKeysFor(undefined).size).toBe(0);
  });
});

describe('buildRouteSnapshots: weekend-only guard', () => {
  const cand = (periodKey: string, v2: object) => ({ periodKey, v2: { refDate: periodKey, rep: {}, ...v2 } as never });
  it('an ordinary route with no weekday value is still dropped, even with a Saturday value', () => {
    const report = newBuildReport();
    const out = buildRouteSnapshots('s', 'X', [cand('20170901', { sat: { h: 45 } }), cand('20180901', { rep: { lim: true }, flag: 'limited' })], 2026, report);
    expect(out).toEqual([]);
    expect(report.drops.map(d => d.reason)).toEqual(['no weekday headline', 'no weekday headline']);
  });
  it('a weekend-target route keeps a snapshot with a Saturday or Sunday value and a blank weekday', () => {
    const report = newBuildReport();
    const out = buildRouteSnapshots('s', 'Local Weekend', [
      cand('20170901', { sat: { h: 60 }, sun: { h: 90 } }),
      cand('20180901', { sat: { none: true }, sun: { h: 75 } }),
    ], 2026, report, { weekendOnlyRoute: true });
    expect(out.map(s => s.weekdayHeadwayMin)).toEqual([null, null]);
    expect(out[0].v2).toMatchObject({ rep: {}, sat: { h: 60 }, sun: { h: 90 } });
    expect(report.drops).toEqual([]);
  });
  it('a weekend-target route still drops a snapshot with nothing for Saturday or Sunday', () => {
    const report = newBuildReport();
    const out = buildRouteSnapshots('s', 'Local Weekend', [
      cand('20170901', {}), cand('20180901', { sat: { none: true }, sun: { none: true } }), cand('20190901', { sat: undefined }),
    ], 2026, report, { weekendOnlyRoute: true });
    expect(out).toEqual([]);
    expect(report.drops).toHaveLength(3);
  });
  it('v1 change files are never weekend-only, even on a weekend-target route', () => {
    const report = newBuildReport();
    const out = buildRouteSnapshots('s', 'Local Weekend', [{ periodKey: '20170901', change: {} as never }], 2026, report, { weekendOnlyRoute: true });
    expect(out).toEqual([]);
  });
  it('a normal weekday value is unchanged by the option', () => {
    const a = buildRouteSnapshots('s', 'R', [cand('20170901', { rep: { h: 20 }, sat: { h: 40 } })], 2026, newBuildReport());
    const b = buildRouteSnapshots('s', 'R', [cand('20170901', { rep: { h: 20 }, sat: { h: 40 } })], 2026, newBuildReport(), { weekendOnlyRoute: true });
    expect(a).toEqual(b);
    expect(a[0].weekdayHeadwayMin).toBe(20);
  });
});

describe('blank weekday tolerance in build rules and reader', () => {
  const weekendSnap = { weekdayHeadwayMin: null, v2: { refDate: '20250901' } };
  it('publish filter, flat-route check and visibility check accept a blank weekday', () => {
    const snaps = [weekendSnap, { ...weekendSnap, v2: { refDate: '20260901' } }];
    expect(filterSnapshotsForPublish(snaps, { materializeAllPeriods: false, keepEveryV2Year: true })).toEqual(snaps);
    expect(isFlatRouteToSkip(snaps, { materializeAllPeriods: false, hasTripDuration: false, keepEveryV2Year: true })).toBe(false);
    const hist = { W: [{ label: '2024', year: 2024, weekdayHeadwayMin: null }, { label: '2025', year: 2025, weekdayHeadwayMin: null }, { label: '2026', year: 2026, weekdayHeadwayMin: null }] };
    expect(visibilityCheck('caltrain', hist, [], 2026).spikes).toEqual([]);
  });

  it('the reader accepts a weekend-only snapshot and reads each day type separately', () => {
    const agency = {
      slug: 'caltrain',
      routes: [{
        routeShortName: 'Local Weekend',
        snapshots: [{ label: '2017', year: 2017, weekdayHeadwayMin: null, v2: { refDate: '20170901', key: 'Local Weekend', rep: {}, sat: { h: 60 }, sun: { none: true } } }],
      }],
    };
    const parsed = parseHistoryAgencyV2(agency);
    expect(parsed.ok).toBe(true);
    const snap = routesForYear(agency as never, 2017)[0].snapshot as never;
    expect(snapshotValue(snap, 'weekday')).toEqual({ kind: 'blank' });
    expect(snapshotValue(snap, 'sat')).toEqual({ kind: 'value', min: 60 });
    expect(snapshotValue(snap, 'sun')).toEqual({ kind: 'none' });
  });

  it('a v1 snapshot (no v2) with a blank weekday is still rejected by the reader', () => {
    const bad = { slug: 's', routes: [{ routeShortName: 'R', snapshots: [{ label: '2017', year: 2017, weekdayHeadwayMin: null }] }] };
    expect(parseHistoryAgencyV2(bad).ok).toBe(false);
  });
});

describe('build-history with ATLAS_HISTORY_V2=1: Caltrain Local split', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.ATLAS_HISTORY_V2; });

  type Snap = { year: number; weekdayHeadwayMin: number | null; v2?: { rep: { h?: number }; sat?: unknown; sun?: unknown } };
  type Route = { routeShortName: string; snapshots: Snap[] };

  it('weekday history continues as Local Weekday, weekend history as Local Weekend, nothing dropped', async () => {
    vi.resetModules();
    const cap = resetCapture();
    process.env.ATLAS_HISTORY_V2 = '1';
    process.env.R2_ACCESS_KEY_ID = 'test';
    await import('../build-history.js');
    await cap.done;
    const agency = (JSON.parse(cap.historyConfig!) as Array<{ slug: string; routes: Route[] }>).find(r => r.slug === 'caltrain')!;
    const route = (k: string) => agency.routes.find(r => r.routeShortName === k);
    const names = agency.routes.map(r => r.routeShortName).sort();
    expect(names).toEqual(['Express', 'Local Weekday', 'Local Weekend']); // no "Local", no X

    // Monday-Friday: 2017, 2018 (old change file), 2020, 2025, plus the current endpoint. Saturday/Sunday blank everywhere.
    const wd = route('Local Weekday')!.snapshots;
    expect(wd.map(s => [s.year, s.weekdayHeadwayMin])).toEqual([[2017, 30], [2018, 35], [2020, 30], [2025, 20], [2026, 20]]);
    for (const s of wd.filter(x => x.year < 2025)) { expect(s.v2?.sat).toBeUndefined(); expect(s.v2?.sun).toBeUndefined(); }
    const wd2025 = routesForYear(agency as never, 2025).find(r => r.route.routeShortName === 'Local Weekday')!.snapshot as never;
    // 2025's own sidecar said "none" for Saturday and Sunday; that is the route's own record and is kept as it was
    expect(snapshotValue(wd2025, 'sat')).toEqual({ kind: 'none' });

    // Saturday/Sunday: 2017, 2020, 2025 (from its own key), weekday blank (null in the file, never 0).
    const we = route('Local Weekend')!.snapshots;
    expect(we.map(s => [s.year, s.weekdayHeadwayMin])).toEqual([[2017, null], [2020, null], [2025, null]]);
    const at = (y: number) => routesForYear(agency as never, y).find(r => r.route.routeShortName === 'Local Weekend')?.snapshot as never;
    expect(snapshotValue(at(2017), 'weekday')).toEqual({ kind: 'blank' });
    expect(snapshotValue(at(2017), 'sat')).toEqual({ kind: 'value', min: 60 });
    expect(snapshotValue(at(2017), 'sun')).toEqual({ kind: 'value', min: 90 });
    expect(snapshotValue(at(2020), 'sat')).toEqual({ kind: 'value', min: 60 });
    expect(snapshotValue(at(2020), 'sun')).toEqual({ kind: 'none' });
    expect(snapshotValue(at(2025), 'sun')).toEqual({ kind: 'value', min: 60 });
    expect(routesForYear(agency as never, 2018).map(r => r.route.routeShortName)).toEqual(['Local Weekday']); // the weekday-only change file never reaches the weekend route
    expect(cap.historyConfig).not.toContain('"weekdayHeadwayMin":0');

    // The file validates with the shared reader.
    expect(parseHistoryAgencyV2(agency).ok).toBe(true);

    // The ordinary whole-route alias in the same agency is unchanged: Ltd folded into Express.
    expect(route('Express')!.snapshots.map(s => [s.year, s.weekdayHeadwayMin])).toEqual([[2017, 40], [2020, 40], [2025, 40]]);

    // Ordinary route X (blank weekday, Saturday value) is still dropped and reported.
    const report = JSON.parse(cap.files[Object.keys(cap.files).find(f => f.includes('history-build-report.json'))!]) as { drops: Array<{ route: string; reason: string }> };
    expect(report.drops.map(d => `${d.route}:${d.reason}`)).toEqual(['X:no weekday headline']);
  }, 30_000);
});
