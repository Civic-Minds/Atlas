import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runUpload, type Remote } from '../history-v2-upload.js';
import { assertRailOnlyApproved, checkRailOnlySidecar, periodKeysInUse, railOnlyPart } from '../historyV2RailOnly.js';
import { buildRouteSnapshots, joinCandidates, newBuildReport, type ArchiveChange } from '../historyV2Build.js';
import { remapKeysByPeriod, type HistoryPeriodRemaps } from '../historyRouteConfig.js';
import type { PutResult } from '../historyV2.js';
import type { HistoryV2SidecarRoute } from '../../shared/historyV2.js';

// CIV-437: LA Metro rail History is uploaded as rail-only sidecars beside the published bus History.
const RAIL = 'https://gitlab.com/LACMTA/gtfs_rail/raw/master/gtfs_rail.zip';
const ENV_ON = { ATLAS_HISTORY_V2: '1' };
const route = (h: number, name = ''): HistoryV2SidecarRoute => ({ name, rep: { h } } as HistoryV2SidecarRoute);

/** A rail-only sidecar as backfill --rail-only writes it. */
const railSidecar = (refDate: string, keys: string[], extraRoutes: Record<string, HistoryV2SidecarRoute> = {}) => JSON.stringify({
  version: 2, slug: 'lacmta', periodKey: refDate, refDate,
  routes: { ...Object.fromEntries(keys.map(k => [k, route(6, k)])), ...extraRoutes },
  supplementalRoutes: { [RAIL]: keys },
});
const railShapes = (refDate: string, keys: string[]) => JSON.stringify({
  version: 1, slug: 'lacmta', periodKey: refDate, refDate, decimals: 5, toleranceM: 15,
  routes: Object.fromEntries(keys.map(k => [k, { c: [[-118.2, 34], [-118.3, 34.1]] }])),
});
/** The published bus-only sidecars and a bus change file: what must never change. */
const BUS_SIDECAR = JSON.stringify({ version: 2, slug: 'lacmta', periodKey: '20241214', refDate: '20240911', routes: { '2': route(12, 'Sunset'), '720': route(8, 'Wilshire') } });
const PUBLISHED = {
  'history-v2/lacmta/20241214.json': BUS_SIDECAR,
  'history-v2/lacmta/20251213.json': BUS_SIDECAR.replace(/20241214/g, '20251213'),
  'history-v2/lacmta/20261212.json': BUS_SIDECAR.replace(/20241214/g, '20261212'),
  'history-v2-shapes/lacmta/20241214.json': '{"bus":true}',
  'history/lacmta/2/20190615.json': '{"headway":12}',
  'trip-duration/lacmta/2/20190615.json': '{}',
};

class FakeRemote implements Remote {
  store = new Map<string, string>(Object.entries(PUBLISHED));
  puts: string[] = [];
  peek = async (key: string) => this.store.get(key) ?? null;
  list = async (prefix: string) => [...this.store.keys()].filter(k => k.startsWith(prefix));
  sink = {
    put: async (key: string, body: string): Promise<PutResult> => {
      const ex = this.store.get(key);
      if (ex != null) return ex === body ? 'unchanged' : 'conflict';
      this.puts.push(key);
      this.store.set(key, body);
      return 'written';
    },
  };
  overwrite = async () => { throw new Error('a rail-only upload must never overwrite'); };
}

function mkDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'hist-rail-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

const lines: string[] = [];
const log = (l: string) => { lines.push(l); };
const upload = (dir: string, r: FakeRemote, extra: string[] = ['--rail-only', 'CIV-437', '--write']) =>
  runUpload({ log, argv: ['--slug', 'lacmta', '--dir', dir, ...extra], env: ENV_ON, makeRemote: async () => r, railUrls: [RAIL] });

const RAIL_2016 = ['801', '802', '803', '804', '805', '806'];
const RAIL_2024 = ['801', '802', '803', '804', '805', '807'];

describe('railOnlyPart', () => {
  const merged = { '2': route(12), '720': route(8), '801': route(6), '804': route(7), '806': route(12) };
  it('keeps only the routes the build attributes to the rail feed, values untouched, keyed by the rail refDate', () => {
    const part = railOnlyPart(merged, { [RAIL]: ['806', '801', '804'] }, RAIL, '20160907');
    expect(part.periodKey).toBe('20160907');
    expect(part.refDate).toBe('20160907');
    expect(Object.keys(part.routes)).toEqual(['801', '804', '806']);
    expect(part.routes['804']).toBe(merged['804']);
    expect(part.supplementalRoutes).toEqual({ [RAIL]: ['801', '804', '806'] });
  });
  it('refuses a refDate that is not YYYYMMDD and a build with no rail routes', () => {
    expect(() => railOnlyPart(merged, { [RAIL]: ['801'] }, RAIL, '2016-09-07')).toThrow(/YYYYMMDD/);
    expect(() => railOnlyPart(merged, {}, RAIL, '20160907')).toThrow(/no routes/);
  });
});

describe('checkRailOnlySidecar', () => {
  const ok = JSON.parse(railSidecar('20160907', RAIL_2016));
  it('accepts a rail-only sidecar', () => expect(checkRailOnlySidecar(ok, [RAIL])).toBeNull());
  it('refuses a bus route, a missing route, a foreign feed, no supplementalRoutes and a key that is not the refDate', () => {
    expect(checkRailOnlySidecar(JSON.parse(railSidecar('20160907', RAIL_2016, { '2': route(12) })), [RAIL])).toMatch(/not from a supplemental feed \(first: 2\)/);
    expect(checkRailOnlySidecar({ ...ok, routes: { '801': ok.routes['801'] } }, [RAIL])).toMatch(/lacks/);
    expect(checkRailOnlySidecar(ok, ['https://example.com/other.zip'])).toMatch(/not one of this agency's supplemental feeds/);
    expect(checkRailOnlySidecar({ ...ok, supplementalRoutes: undefined }, [RAIL])).toMatch(/no supplementalRoutes/);
    expect(checkRailOnlySidecar({ ...ok, periodKey: '20161001' }, [RAIL])).toMatch(/must be the rail refDate/);
  });
});

describe('periodKeysInUse', () => {
  it('collects every lacmta period key from change, trip-time, sidecar and shapes files only', () => {
    const m = periodKeysInUse([...Object.keys(PUBLISHED), 'history/lacmta/coverage.json', 'history-v2/ttc/20160907.json'], 'lacmta');
    expect([...m.keys()].sort()).toEqual(['20190615', '20241214', '20251213', '20261212']);
    expect(m.get('20190615')).toEqual(['history/lacmta/2/20190615.json', 'trip-duration/lacmta/2/20190615.json']);
  });
});

describe('history:upload --rail-only (CIV-437)', () => {
  const files = () => ({
    'history-v2/lacmta/20160907.json': railSidecar('20160907', RAIL_2016),
    'history-v2-shapes/lacmta/20160907.json': railShapes('20160907', RAIL_2016),
    'history-v2/lacmta/20240904.json': railSidecar('20240904', RAIL_2024),
    'history-v2-shapes/lacmta/20240904.json': railShapes('20240904', RAIL_2024),
  });

  it('writes only new rail keys and leaves every published bus file byte-identical', async () => {
    const r = new FakeRemote();
    lines.length = 0;
    expect(await upload(mkDir(files()), r)).toBe(0);
    expect(r.puts.sort()).toEqual(Object.keys(files()).sort());
    for (const [k, v] of Object.entries(PUBLISHED)) expect(r.store.get(k)).toBe(v);
    // A re-run writes nothing and passes (its own identical files do not count as a clash).
    r.puts.length = 0;
    expect(await upload(mkDir(files()), r)).toBe(0);
    expect(r.puts).toEqual([]);
  });

  it('refuses a sidecar carrying a bus route, or shapes for a route the sidecar lacks, before reading R2', async () => {
    const r = new FakeRemote();
    lines.length = 0;
    expect(await upload(mkDir({ ...files(), 'history-v2/lacmta/20160907.json': railSidecar('20160907', RAIL_2016, { '720': route(8) }) }), r)).toBe(1);
    expect(lines.join('\n')).toMatch(/not from a supplemental feed \(first: 720\)/);
    lines.length = 0;
    expect(await upload(mkDir({ ...files(), 'history-v2-shapes/lacmta/20240904.json': railShapes('20240904', [...RAIL_2024, '2']) }), r)).toBe(1);
    expect(lines.join('\n')).toMatch(/not in the period's rail-only sidecar \(first: 2\)/);
    expect(r.puts).toEqual([]);
  });

  it('refuses a period key any other lacmta archive file uses (a bus change file, a published sidecar)', async () => {
    const r = new FakeRemote();
    lines.length = 0;
    expect(await upload(mkDir({ 'history-v2/lacmta/20190615.json': railSidecar('20190615', RAIL_2016) }), r)).toBe(1);
    expect(lines.join('\n')).toMatch(/20190615: history\/lacmta\/2\/20190615\.json/);
    lines.length = 0;
    // The bus-only 20241214 shapes file holds the key even with no sidecar conflict check in play.
    expect(await upload(mkDir({ 'history-v2-shapes/lacmta/20241214.json': railShapes('20241214', RAIL_2024), 'history-v2/lacmta/20241214.json': railSidecar('20241214', RAIL_2024) }), r)).toBe(1);
    expect(r.puts).toEqual([]);
    for (const [k, v] of Object.entries(PUBLISHED)) expect(r.store.get(k)).toBe(v);
  });

  it('is approved for lacmta only, and never with --replace-approved', async () => {
    expect(() => assertRailOnlyApproved('CIV-437', 'septa')).toThrow(/covers only lacmta/);
    expect(() => assertRailOnlyApproved('CIV-9999', 'lacmta')).toThrow(/no such approval/);
    await expect(runUpload({ log, argv: ['--slug', 'septa', '--dir', mkDir(files()), '--rail-only', 'CIV-437'], env: {}, makeRemote: async () => new FakeRemote(), railUrls: [RAIL] })).rejects.toThrow(/covers only lacmta/);
    await expect(upload(mkDir(files()), new FakeRemote(), ['--rail-only', 'CIV-437', '--replace-approved', 'CIV-1430'])).rejects.toThrow(/cannot be combined|covers only mbta/);
  });

  it('without the flag, rail-only files upload under the normal rules (no listing needed)', async () => {
    const r = new FakeRemote();
    expect(await upload(mkDir(files()), r, ['--write'])).toBe(0);
  });
});

describe('build-level: rail-only sidecars leave bus values identical and add the rail lines', () => {
  type SidecarEntry = { periodKey: string; v2: HistoryV2SidecarRoute & { refDate: string } };
  /** build-history's step 1c: sidecar routes by key, each with its period and refDate. */
  const sidecarRoutes = (bodies: string[]) => {
    const out: Record<string, SidecarEntry[]> = {};
    for (const b of bodies) {
      const sc = JSON.parse(b) as { periodKey: string; refDate: string; routes: Record<string, HistoryV2SidecarRoute> };
      for (const [k, rec] of Object.entries(sc.routes)) (out[k] ??= []).push({ periodKey: sc.periodKey, v2: { ...rec, refDate: sc.refDate } });
    }
    return out;
  };
  const busChanges: Record<string, ArchiveChange[]> = {
    '2': [{ periodKey: '20190615', headway: 12 }, { periodKey: '20210612', headway: 15 }],
    '720': [{ periodKey: '20190615', headway: 6 }],
  };
  const busSidecars = [PUBLISHED['history-v2/lacmta/20241214.json'], PUBLISHED['history-v2/lacmta/20251213.json']];
  const railYears = [2016, 2017, 2018, 2019, 2020, 2021, 2022].map(y => railSidecar(`${y}0907`, RAIL_2016))
    .concat([2023, 2024, 2025].map(y => railSidecar(`${y}0904`, RAIL_2024)));
  const snapshots = (sidecars: string[]) => {
    const sc = sidecarRoutes(sidecars);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(busChanges)) out[k] = buildRouteSnapshots('lacmta', k, joinCandidates(busChanges[k], sc[k] ?? []), 2026, newBuildReport());
    return out;
  };

  it('every bus snapshot is identical with and without the rail-only sidecars', () => {
    expect(JSON.stringify(snapshots([...busSidecars, ...railYears]))).toBe(JSON.stringify(snapshots(busSidecars)));
  });

  it('after the CIV-437 remap the rail lines are present: A B C D E K, and the old Gold Line as L Gold 2016-2022', () => {
    const remaps = JSON.parse(readFileSync('config/history-period-remaps.json', 'utf8')) as HistoryPeriodRemaps;
    const rail = remapKeysByPeriod(sidecarRoutes(railYears), remaps.lacmta, e => e.periodKey).routes;
    const years = (k: string) => rail[k].map(e => Number(e.v2.refDate.slice(0, 4))).sort();
    for (const k of ['801', '802', '803', '805']) expect(years(k)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(years('804')).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]); // Expo 2016-2022 joined to the E Line
    expect(years('L Gold')).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022]);
    expect(years('807')).toEqual([2023, 2024, 2025]);
    expect(rail['806']).toBeUndefined();
  });
});
