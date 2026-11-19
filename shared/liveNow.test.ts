import { describe, expect, it } from 'vitest';
import { gapKind, nowDirections, routeNow, NOW_WINDOW_MIN, type NowDirection, type NowRouteRow, type NowSnapshot } from './liveNow';
import { DEFAULT_CUTOFFS } from './liveCutoffs';
import { LIVE_STALE_SEC } from './rules/live';

// A trunk running east (stops t0–t5, 400 m apart), then two branches: north (n1–n3) and south (s1–s3).
const lat = 43.65;
const M_LAT = 111_320, M_LON = 111_320 * Math.cos((lat * Math.PI) / 180);
const at = (east: number, north = 0) => ({ lat: lat + north / M_LAT, lon: -79.4 + east / M_LON });
const trunk = Array.from({ length: 6 }, (_, i) => ({ stopId: `t${i}`, name: `Trunk ${i}`, ...at(i * 400), scheduledGapMin: 5 }));
const north = [1, 2, 3].map(i => ({ stopId: `n${i}`, name: `North ${i}`, ...at(2000, i * 400), scheduledGapMin: 10 }));
const south = [1, 2, 3].map(i => ({ stopId: `s${i}`, name: `South ${i}`, ...at(2000, -i * 400), scheduledGapMin: 10 }));
const dir0: NowDirection = { directionId: 0, label: 'East', patterns: [[...trunk, ...north], [...trunk, ...south]] };
const NOW = 1_800_000_000;
const SPEED = 400 / 60; // one stop a minute

/** Where a vehicle on a branch is `m` metres from the start. */
function pos(m: number, branch: 'n' | 's') {
  if (m <= 2000) return at(m);
  return at(2000, (branch === 'n' ? 1 : -1) * Math.min(m - 2000, 1200));
}
/** A reading every minute for the half hour; each vehicle starts at t0 at its own time on its branch, then stands at the end. */
function snaps(runs: Array<[id: string, startSec: number, branch: 'n' | 's']>, until = NOW): NowSnapshot[] {
  const out: NowSnapshot[] = [];
  for (let t = NOW - NOW_WINDOW_MIN * 60; t <= until; t += 60) {
    out.push({ capturedAt: t, vehicles: runs.filter(([, s]) => t >= s).map(([id, s, b]) => ({ id, r: '504', tripId: `${id}-trip`, d: 0, ...pos(Math.min((t - s) * SPEED, 3200), b), t })) });
  }
  return out;
}
const run = (r: Array<[string, number, 'n' | 's']>, extra: Partial<Parameters<typeof routeNow>[0]> = {}) => routeNow({ snapshots: snaps(r), routeIds: ['504'], directions: [dir0], nowSec: NOW, ...extra });

describe('a route right now (CIV-1870)', () => {
  it('finds where the last two vehicles passed close together, on the trunk both branches share', () => {
    // N on the north branch and S on the south one, 1 minute apart, through the trunk in the last few minutes.
    const d = run([['N', NOW - 300, 'n'], ['S', NOW - 240, 's']]).directions[0];
    expect(d.bunchedNow).toHaveLength(1);
    expect(d.bunchedNow[0]).toMatchObject({ fromStop: 'Trunk 1', minutes: 1 });
    expect(d.vehiclesNow).toBe(2);
  });

  it('calls a wait gapped against each stop’s own scheduled gap, and keeps stops no vehicle passed apart', () => {
    // One vehicle went through about 25 minutes ago and stands at the end of the north branch; nothing since.
    const d = run([['A', NOW - 1760, 'n']]).directions[0];
    expect(d.standingNow).toBe(1);
    // Trunk (every 5) and north (every 10): 20+ minutes is gapped (the terminal stop is left out).
    expect(d.gappedNow.map(g => [g.fromStop, g.toStop])).toEqual([['Trunk 1', 'North 3']]);
    // The south branch saw nothing in the half hour: not called gapped.
    expect(d.noneSeen.map(g => [g.fromStop, g.toStop])).toEqual([['South 1', 'South 3']]);
    expect(d.longestWait!.minutes).toBeGreaterThan(20);
  });

  it('follows a planner’s own cut-offs', () => {
    expect(run([['A', NOW - 1760, 'n']], { cutoffs: { ...DEFAULT_CUTOFFS, gappedFactor: 6 } }).directions[0].gappedNow).toHaveLength(0);
    expect(run([['N', NOW - 300, 'n'], ['S', NOW - 180, 's']]).directions[0].bunchedNow).toHaveLength(0);
    expect(run([['N', NOW - 300, 'n'], ['S', NOW - 180, 's']], { cutoffs: { ...DEFAULT_CUTOFFS, bunchedWithinMin: 3 } }).directions[0].bunchedNow).toHaveLength(1);
    expect(gapKind(200, 10, { ...DEFAULT_CUTOFFS, bunchedWithinMin: 4 })).toBe('bunched');
  });

  it('has no current figures when the newest reading is too old', () => {
    const r = routeNow({ snapshots: snaps([['A', NOW - 600, 'n']], NOW - LIVE_STALE_SEC - 60), routeIds: ['504'], directions: [dir0], nowSec: NOW });
    expect(r).toMatchObject({ stale: true, directions: [] });
  });

  it('places a vehicle by the stops it passed when the feed gives no direction, and ignores other routes', () => {
    const s = snaps([['A', NOW - 600, 'n'], ['B', NOW - 300, 'n']]).map(x => ({ ...x, vehicles: [...x.vehicles.map(v => ({ ...v, d: null })), { id: 'Z', r: '505', d: 0, ...at(100), t: x.capturedAt }] }));
    const d = routeNow({ snapshots: s, routeIds: ['504'], directions: [dir0], nowSec: NOW }).directions[0];
    expect(d.vehiclesNow).toBe(2);
    expect(d.lastHalfHour!.gaps).toBeGreaterThan(3);
  });

  it('builds each direction’s patterns from the route’s rows, with each stop’s scheduled gap for the period', () => {
    const stops = new Map([...trunk, ...north].map(s => [s.stopId, s]));
    const rows: NowRouteRow[] = [
      { directionId: 0, headsign: 'North', stopOrder: [...trunk, ...north].map(s => s.stopId), stopPeriodHeadways: { t0: { pmPeak: 5 }, n1: { pmPeak: 10 } } },
      { directionId: 0, headsign: 'Short', stopOrder: ['t0', 't1'], stopPeriodHeadways: {} },
    ];
    const [d] = nowDirections(rows, stops, 'pmPeak');
    expect(d.label).toBe('To North');
    expect(d.patterns).toHaveLength(2);
    expect(d.patterns[0].find(s => s.stopId === 'n1')!.scheduledGapMin).toBe(10);
    expect(d.patterns[0].find(s => s.stopId === 't2')!.scheduledGapMin).toBeNull();
  });
});
