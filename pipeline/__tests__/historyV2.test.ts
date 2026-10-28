import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeFeedEvidence, positivelyNoService, weekendDay } from '../historyWeekend.js';
import {
  baselineFingerprint, buildSidecar, buildV2Routes, fingerprintChanged, fingerprintOf, localDirSink,
  periodKeyForZip, representativeRep, writeSidecar,
} from '../historyV2.js';
import { buildRouteSnapshots, joinCandidates, newBuildReport, visibilityCheck } from '../historyV2Build.js';
import { mergeAliasedRoutes, currentRouteShortNamesFor } from '../historyIdentity.js';
import { historyFlagFor } from '../../shared/historyV2.js';

const REF = '20240612'; // Wednesday; reference week 10-16 Jun, Saturday the 15th, Sunday the 16th
const cal = (id: string, days: string, start = '20240101', end = '20241231') => {
  const [m, t, w, th, f, sa, su] = days.split('').map(c => c);
  return { service_id: id, monday: m, tuesday: t, wednesday: w, thursday: th, friday: f, saturday: sa, sunday: su, start_date: start, end_date: end };
};
const routes = (...ids: string[]) => ids.map(id => ({ route_id: id, route_short_name: id }));
const trips = (...pairs: Array<[string, string]>) => pairs.map(([route_id, service_id]) => ({ route_id, service_id }));

function evidence(c: ReturnType<typeof cal>[], t: Array<[string, string]>, routeIds: string[], dates: Array<{ service_id: string; date: string; exception_type: string }> = [], ref = REF) {
  return computeFeedEvidence({ calendar: c, calendarDates: dates, trips: trips(...t), routes: routes(...routeIds) }, { referenceDate: ref });
}

describe('weekend logic', () => {
  it('weekday-only feed with an explicit calendar: both weekend days are none', () => {
    const ev = evidence([cal('WK', '1111100')], [['A', 'WK']], ['A']);
    expect(positivelyNoService(ev, 'A', 'Saturday')).toBe(true);
    expect(positivelyNoService(ev, 'A', 'Sunday')).toBe(true);
    expect(weekendDay([], true)).toEqual({ none: true });
  });

  it('route with no weekend while another route runs it is none; the weekend route itself is not', () => {
    const ev = evidence([cal('WK', '1111100'), cal('WE', '0000011')], [['A', 'WK'], ['B', 'WE']], ['A', 'B']);
    expect(positivelyNoService(ev, 'A', 'Saturday')).toBe(true);
    expect(positivelyNoService(ev, 'B', 'Saturday')).toBe(false);
  });

  it('Saturday-only route: has Saturday, no weekday evidence so Sunday stays blank', () => {
    const ev = evidence([cal('SA', '0000010'), cal('WK', '1111100')], [['C', 'SA'], ['A', 'WK']], ['C', 'A']);
    expect(positivelyNoService(ev, 'C', 'Sunday')).toBe(false);
    expect(weekendDay([], false)).toBeUndefined();
    expect(weekendDay([{ routeAllDayHeadway: 30, tier: 'frequent' }], false)).toEqual({ h: 30 });
  });

  it('a type 1 weekend addition keeps the day blank instead of none', () => {
    const ev = evidence([cal('WK', '1111100')], [['A', 'WK']], ['A'], [{ service_id: 'WK', date: '20240615', exception_type: '1' }]);
    expect(positivelyNoService(ev, 'A', 'Saturday')).toBe(false);
    expect(positivelyNoService(ev, 'A', 'Sunday')).toBe(true);
  });

  it('a type 1 weekend addition on another service in the feed blocks the feed-wide none', () => {
    const ev = evidence([cal('WK', '1111100'), cal('X', '0000000')], [['A', 'WK'], ['B', 'X']], ['A', 'B'], [{ service_id: 'X', date: '20240616', exception_type: '1' }]);
    expect(positivelyNoService(ev, 'A', 'Sunday')).toBe(false);
  });

  it('a type 2 removal does not make a flagged Saturday service read as none', () => {
    const ev = evidence([cal('WK', '1111110')], [['A', 'WK']], ['A'], [{ service_id: 'WK', date: '20240615', exception_type: '2' }]);
    expect(positivelyNoService(ev, 'A', 'Saturday')).toBe(false);
  });

  it('expired or non-covering calendar stays blank', () => {
    const ok = evidence([cal('WK', '1111100', '20240101', '20241231')], [['A', 'WK']], ['A']);
    expect(positivelyNoService(ok, 'A', 'Saturday')).toBe(true);
    const expired = evidence([cal('WK', '1111100', '20230101', '20231231')], [['A', 'WK']], ['A']);
    expect(positivelyNoService(expired, 'A', 'Saturday')).toBe(false);
    // window ends the Friday before the reference Saturday
    const ends = evidence([cal('WK', '1111100', '20240101', '20240614')], [['A', 'WK']], ['A']);
    expect(positivelyNoService(ends, 'A', 'Saturday')).toBe(false);
    const empty = evidence([], [['A', 'WK']], ['A']);
    expect(positivelyNoService(empty, 'A', 'Saturday')).toBe(false);
  });

  it('a one-day holiday row flagged for every day does not read as Saturday service', () => {
    const ev = evidence([cal('WK', '1111100'), cal('HOL', '1111111', '20240603', '20240603')], [['A', 'WK'], ['A', 'HOL']], ['A']);
    expect(positivelyNoService(ev, 'A', 'Saturday')).toBe(true);
    // but a one-day row on the reference Saturday itself is real service
    const sat = evidence([cal('WK', '1111100'), cal('ONE', '1111111', '20240615', '20240615')], [['A', 'WK'], ['A', 'ONE']], ['A']);
    expect(positivelyNoService(sat, 'A', 'Saturday')).toBe(false);
  });

  it('keys services by the History key (route_id when the short name is blank)', () => {
    const ev = computeFeedEvidence({
      calendar: [cal('WK', '1111100')], calendarDates: [],
      trips: trips(['r1', 'WK']), routes: [{ route_id: 'r1', route_short_name: '' }],
    }, { referenceDate: REF });
    expect(positivelyNoService(ev, 'r1', 'Sunday')).toBe(true);
  });
});

describe('representative value', () => {
  it('reads the route stamp, not the fastest pattern', () => {
    const { rep } = representativeRep([
      { routeAllDayHeadway: 20, headway: 5, routeFilterHeadwayByPeriod: { amPeak: 15, midday: 20 } },
      { routeAllDayHeadway: 20, headway: 40 },
    ]);
    expect(rep.h).toBe(20);
    expect(rep.p).toEqual({ amPeak: 15, midday: 20 });
  });
  it('sentinel stamp is limited with no number; all-span route is limited', () => {
    expect(representativeRep([{ routeAllDayHeadway: 999999 }]).rep).toEqual({ lim: true });
    expect(representativeRep([{ routeAllDayHeadway: 30, tier: 'span' }]).rep).toEqual({ lim: true });
  });
  it('no stamp is blank, never a minimum', () => {
    expect(representativeRep([{ headway: 10 }, { headway: 5 }]).rep).toEqual({});
  });
  it('period sentinels and nulls are stored as null', () => {
    const { rep } = representativeRep([{ routeAllDayHeadway: 30, routeFilterHeadwayByPeriod: { midday: 999999, amPeak: null, pmPeak: 12 } }]);
    expect(rep.p).toEqual({ midday: null, amPeak: null, pmPeak: 12 });
  });
  it('conflicting stamps keep the worst and are counted', () => {
    const out = representativeRep([{ routeAllDayHeadway: 20 }, { routeAllDayHeadway: 30 }]);
    expect(out.rep.h).toBe(30);
    expect(out.conflict).toBe(true);
  });
  it('flags are stored: fast under 2, slow over 300, limited', () => {
    expect(historyFlagFor({ h: 1.5 })).toBe('fast');
    expect(historyFlagFor({ h: 2 })).toBeUndefined();
    expect(historyFlagFor({ h: 300 })).toBeUndefined();
    expect(historyFlagFor({ h: 301 })).toBe('slow');
    expect(historyFlagFor({ lim: true })).toBe('limited');
    expect(historyFlagFor({})).toBeUndefined();
  });
});

describe('buildV2Routes', () => {
  const f = (p: Record<string, unknown>) => ({ properties: p });
  it('uses the blank-short-name fallback key, long name as display name, and keeps all directions', () => {
    const ev = evidence([cal('WK', '1111100')], [['r9', 'WK']], ['r9']);
    const { routes: out, report } = buildV2Routes([
      f({ day: 'Weekday', directionId: 1, routeShortName: '', routeId: 'r9', routeLongName: 'Lake Line', routeAllDayHeadway: 12 }),
    ], computeFeedEvidence({ calendar: [cal('WK', '1111100')], calendarDates: [], trips: trips(['r9', 'WK']), routes: [{ route_id: 'r9', route_short_name: '' }] }, { referenceDate: REF }) ?? ev);
    expect(out.r9.name).toBe('Lake Line');
    expect(out.r9.rep.h).toBe(12);
    expect(out.r9.sat).toEqual({ none: true });
    expect(report.weekendNone).toBe(2);
  });
  it('limited routes get the limited flag and no number', () => {
    const { routes: out } = buildV2Routes([f({ day: 'Weekday', routeShortName: '7', routeAllDayHeadway: 999999 })]);
    expect(out['7'].rep).toEqual({ lim: true });
    expect(out['7'].flag).toBe('limited');
    expect(out['7'].sat).toBeUndefined();
  });
});

describe('change fingerprint', () => {
  it('an old baseline against a new snapshot is not a change', () => {
    const next = fingerprintOf({ rep: { h: 20 }, sat: { h: 30 } });
    expect(fingerprintChanged(baselineFingerprint({ headway: 5 }), next)).toBe(false);
  });
  it('unknown acts as a wildcard; known differences are changes', () => {
    expect(fingerprintChanged({ wk: 20 }, { wk: 20, sat: 30 })).toBe(false);
    expect(fingerprintChanged({ wk: 20, sat: 'none' }, { wk: 20, sat: 30 })).toBe(true);
    expect(fingerprintChanged({ wk: 20 }, { wk: 15 })).toBe(true);
    expect(fingerprintChanged({ wk: 20, sat: 30 }, { wk: 20 })).toBe(false);
  });
  it('a v2 baseline compares all three headlines', () => {
    expect(fingerprintChanged(baselineFingerprint({ headway: 5, v: 2, wk: 20, sat: 30 }), { wk: 20, sat: 45 })).toBe(true);
  });
});

describe('sidecar sink', () => {
  it('is immutable: same content is a no-op, different content is a conflict', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hv2-'));
    const sink = localDirSink(dir);
    const a = buildSidecar('x', '20240630', REF, { A: { rep: { h: 10 } } });
    expect(await writeSidecar(sink, a)).toBe('written');
    expect(await writeSidecar(sink, a)).toBe('unchanged');
    expect(await writeSidecar(sink, buildSidecar('x', '20240630', REF, { A: { rep: { h: 12 } } }))).toBe('conflict');
    expect(await writeSidecar(localDirSink(dir, { overwrite: true }), buildSidecar('x', '20240630', REF, { A: { rep: { h: 12 } } }))).toBe('written');
  });
  it('picks a period key from the zip stem or feed dates', () => {
    expect(periodKeyForZip('20240630', {})).toBe('20240630');
    expect(periodKeyForZip('gcrta Jun 2 2022', { feedInfoEnd: '20220901' })).toBe('20220901');
  });
});

const v2 = (refDate: string, h: number | undefined, extra: object = {}) => ({ refDate, rep: h == null ? { lim: true as const } : { h }, ...extra });
const build = (cands: ReturnType<typeof joinCandidates>, buildYear = 2026) => {
  const report = newBuildReport();
  return { snaps: buildRouteSnapshots('s', 'A', cands, buildYear, report), report };
};

describe('build-time rules', () => {
  it('drops snapshots after the build year, not only 2027', () => {
    const { snaps, report } = build(joinCandidates([
      { periodKey: '20240630', headway: 10 }, { periodKey: '20270101', headway: 10 },
      { periodKey: '2099', headway: 12, label: 'Dec 2099' }, { periodKey: '20350215', headway: 8, label: 'Feb 2035' },
    ], []));
    expect(snaps.map(s => s.year)).toEqual([2024]);
    expect(report.drops.map(d => d.reason)).toEqual(['after build year', 'after build year', 'after build year']);
  });
  it('a v2 snapshot takes its year from refDate, not the feed end date', () => {
    const { snaps } = build(joinCandidates([], [{ periodKey: '20270101', v2: { ...v2('20260615', 15), rep: { h: 15 } } }]));
    expect(snaps[0].year).toBe(2026);
  });
  it('drops empty and unparseable labels and bad refDates, listing each', () => {
    const { snaps, report } = build(joinCandidates([
      { periodKey: '20240630', headway: 10, label: '   ' },
      { periodKey: '20230630', headway: 10, label: 'someday' },
      { periodKey: '20220630', headway: 10 },
    ], [{ periodKey: '20210630', v2: v2('garbage', 9) }]));
    expect(snaps.map(s => s.year)).toEqual([2022]);
    expect(report.drops.map(d => [d.slug, d.route, d.reason])).toEqual([
      ['s', 'A', 'empty label'], ['s', 'A', 'unparseable label'], ['s', 'A', 'bad refDate'],
    ]);
  });
  it('a bad refDate with a good label is dropped as bad refDate', () => {
    const { report } = build(joinCandidates([{ periodKey: '20210630', headway: 4, label: 'Jun 2021' }], [{ periodKey: '20210630', v2: v2('20211', 9) }]));
    expect(report.drops[0].reason).toBe('bad refDate');
  });
  it('keeps one snapshot per year: latest refDate wins, ties fall back to processedAt', () => {
    const { snaps, report } = build(joinCandidates([], [
      { periodKey: 'a', v2: v2('20240301', 20) }, { periodKey: 'b', v2: v2('20240901', 21) },
    ]));
    expect(snaps).toHaveLength(1);
    expect(snaps[0].weekdayHeadwayMin).toBe(21);
    expect(report.superseded).toBe(1);
    const tie = build(joinCandidates([
      { periodKey: '20240630', headway: 10, processedAt: '2024-07-01' }, { periodKey: '20240630', headway: 12, processedAt: '2024-08-01' },
    ], []));
    expect(tie.snaps).toHaveLength(1);
  });
  it('same-year disagreement over 25% is counted and the later is kept', () => {
    const { snaps, report } = build(joinCandidates([], [
      { periodKey: '20240131', v2: v2('20240115', 10) }, { periodKey: '20241231', v2: v2('20240915', 20) },
    ]));
    expect(snaps[0].weekdayHeadwayMin).toBe(20);
    expect(report.yearDisagreements).toEqual([{ slug: 's', route: 'A', year: 2024 }]);
    const close = build(joinCandidates([], [
      { periodKey: 'a', v2: v2('20240115', 10) }, { periodKey: 'b', v2: v2('20240915', 12) },
    ]));
    expect(close.report.yearDisagreements).toEqual([]);
  });
  it('orders by real date, not month-name strings', () => {
    const { snaps } = build(joinCandidates([], [
      { periodKey: 'p3', v2: v2('20250210', 10) }, { periodKey: 'p1', v2: v2('20230915', 11) }, { periodKey: 'p2', v2: v2('20240105', 12) },
    ]));
    expect(snaps.map(s => s.v2!.refDate)).toEqual(['20230915', '20240105', '20250210']);
    // within one year the later real date wins even though "Sep" sorts after "Feb" alphabetically either way
    const sameYear = build(joinCandidates([], [
      { periodKey: 'x', v2: v2('20240905', 30) }, { periodKey: 'y', v2: v2('20240205', 10) },
    ]));
    expect(sameYear.snaps[0].v2!.refDate).toBe('20240905');
  });
  it('limited v2 snapshots never fall back to the old fastest-pattern value', () => {
    const { snaps, report } = build(joinCandidates([{ periodKey: '20240630', headway: 5 }], [{ periodKey: '20240630', v2: v2('20240612', undefined) }]));
    expect(snaps).toEqual([]);
    expect(report.drops[0].reason).toBe('no weekday headline');
  });
  it('an old snapshot and a new one for the same period join into one v2 snapshot', () => {
    const { snaps, report } = build(joinCandidates([{ periodKey: '20240630', headway: 5, geometry: [[0, 0], [1, 1]] }], [{ periodKey: '20240630', v2: v2('20240612', 15) }]));
    expect(snaps).toHaveLength(1);
    expect(snaps[0].weekdayHeadwayMin).toBe(15);
    expect(report.mixedMethodRoutes).toEqual([]);
  });
  it('counts routes that mix old and v2 values', () => {
    const { report } = build(joinCandidates([{ periodKey: '20200630', headway: 5 }], [{ periodKey: '20240630', v2: v2('20240612', 15) }]));
    expect(report.mixedMethodRoutes).toEqual(['s/A']);
  });
});

describe('aliases', () => {
  it('folds old keys into the canonical key before one-per-year', () => {
    const merged = mergeAliasedRoutes({ HealthLine: [{ y: 2014 }], HL: [{ y: 2020 }], 7: [{ y: 2019 }] }, { HL: ['HealthLine'] });
    expect(merged.merged).toBe(1);
    expect(merged.routes.HL).toEqual([{ y: 2020 }, { y: 2014 }]);
    expect(merged.routes.HealthLine).toBeUndefined();
    expect(merged.routes['7']).toEqual([{ y: 2019 }]);
  });
  it('resolves current names through aliases and the manual list', () => {
    expect(currentRouteShortNamesFor('51-51A', ['X'], { 51: ['51-51A'] })).toEqual(['X', '51']);
  });
});

describe('visibility check (report-only)', () => {
  const sn = (year: number, h: number) => ({ label: `Oct ${year}`, year, weekdayHeadwayMin: h });
  it('lists current routes with no snapshot in the last 5 years', () => {
    const hist = { A: [sn(2015, 10), sn(2024, 10)], B: [sn(2015, 10), sn(2019, 12)] };
    const v = visibilityCheck('s', hist, ['A', 'B', 'C'], 2026);
    expect(v.currentWithoutRecentSnapshot).toEqual(['B', 'C']);
  });
  it('lists old keys with no current match, honouring a resolver', () => {
    const hist = { A: [sn(2020, 10)], '12': [sn(2020, 10)], '12X': [sn(2020, 10)] };
    expect(visibilityCheck('s', hist, ['A'], 2026).oldKeysWithoutCurrentMatch).toEqual(['12', '12X']);
    expect(visibilityCheck('s', hist, ['A'], 2026, k => k !== '12X').oldKeysWithoutCurrentMatch).toEqual(['12X']);
  });
  it('flags a weekday value >= 5x both neighbours only', () => {
    const hist = { A: [sn(2018, 10), sn(2019, 60), sn(2020, 12)], B: [sn(2018, 10), sn(2019, 60), sn(2020, 30)], E: [sn(2018, 10), sn(2019, 60)] };
    const v = visibilityCheck('s', hist, [], 2026);
    expect(v.spikes).toEqual([{ route: 'A', label: 'Oct 2019', year: 2019, value: 60, prev: 10, next: 12 }]);
  });
  it('never changes the input snapshots', () => {
    const hist = { A: [sn(2018, 10), sn(2019, 60), sn(2020, 12)] };
    const before = JSON.stringify(hist);
    visibilityCheck('s', hist, ['A'], 2026);
    expect(JSON.stringify(hist)).toBe(before);
    expect(newBuildReport().visibility).toEqual([]);
  });
});

describe('a change file keyed by its feed end date after this year (CIV-394)', () => {
  // AC Transit 7: the spring timetable's file ends Aug 2026; the current one, read Sep 2026, ends Apr 2027.
  const changes = [
    { periodKey: '20260808', headway: 30, processedAt: '2026-04-20T06:00:00.000Z' },
    { periodKey: '20270424', headway: 15, processedAt: '2026-09-14T06:00:00.000Z' },
  ];

  it('dates it by when it was read, so this year shows the current timetable', () => {
    const report = newBuildReport();
    const snaps = buildRouteSnapshots('actransit', '7', joinCandidates(changes, []), 2026, report);
    expect(snaps.map(s => [s.year, s.label, s.weekdayHeadwayMin])).toEqual([[2026, 'Sep 2026', 15]]);
    expect(report.drops).toEqual([]);
  });

  it('still drops a file with no read date, or one read after this year', () => {
    const report = newBuildReport();
    const snaps = buildRouteSnapshots('actransit', '7', joinCandidates([
      changes[0],
      { periodKey: '20270424', headway: 15 },
      { periodKey: '20280101', headway: 12, processedAt: '2027-02-01T00:00:00.000Z' },
    ], []), 2026, report);
    expect(snaps.map(s => [s.year, s.weekdayHeadwayMin])).toEqual([[2026, 30]]);
    expect(report.drops.map(d => d.reason)).toEqual(['after build year', 'after build year']);
  });

  it('leaves an old feed dated by its end year as before', () => {
    const report = newBuildReport();
    const snaps = buildRouteSnapshots('mbta', '1', joinCandidates([{ periodKey: '20121215', headway: 10, processedAt: '2026-08-01T00:00:00.000Z' }], []), 2026, report);
    expect(snaps.map(s => [s.year, s.label])).toEqual([[2012, 'Dec 2012']]);
  });
});
