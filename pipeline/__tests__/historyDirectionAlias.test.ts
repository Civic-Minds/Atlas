/**
 * #1285: a line the feed published as one route per direction (BART "Yellow-N" and "Yellow-S") is one
 * route "Yellow" now; History folds the two old keys period by period, each value the worse of the
 * two directions, as the route's value is today. Synthetic fixtures only.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aliasesFromDirectionSplits, currentRouteShortNamesFor, mergeAliasedRoutes, projectArchiveByDay, projectSidecarByDay,
  withGeneratedAliases, worseArchiveChange, worseSidecarEntry, type HistoryAliasEntry, type HistoryRouteAliases,
} from '../historyIdentity.js';

const YELLOW: Record<string, HistoryAliasEntry[]> = {
  Yellow: [{ key: 'Yellow-N', direction: true }, { key: 'Yellow-S', direction: true }],
};
const archive = { periodKey: (c: { periodKey: string }) => c.periodKey, combine: worseArchiveChange };
const sidecar = { periodKey: (e: { periodKey: string }) => e.periodKey, combine: worseSidecarEntry };

describe('direction-split routes in History (#1285)', () => {
  it('old change files: one per period, the worse headway and per-period value of the two directions', () => {
    const { routes, merged } = mergeAliasedRoutes({
      'Yellow-N': [
        { periodKey: '20220901', headway: 15, headwayByPeriod: { amPeak: 15, midday: 15, late: 30, overnight: null } },
        { periodKey: '20240801', headway: 20 },
      ],
      'Yellow-S': [{ periodKey: '20220901', headway: 14, headwayByPeriod: { amPeak: 12, midday: 20, late: 30, overnight: null } }],
      Yellow: [{ periodKey: '20261101', headway: 10 }],
    }, YELLOW, projectArchiveByDay, archive);
    expect(merged).toBe(2);
    expect(Object.keys(routes)).toEqual(['Yellow']);
    expect(routes.Yellow).toEqual([
      { periodKey: '20261101', headway: 10 },
      { periodKey: '20220901', headway: 15, headwayByPeriod: { amPeak: 15, midday: 20, late: 30, overnight: null } },
      // A period only one direction recorded stays as recorded.
      { periodKey: '20240801', headway: 20 },
    ]);
  });

  it('sidecar entries: the worse weekday value, limited if either direction is, worse weekend days', () => {
    const e = (periodKey: string, v2: object) => ({ periodKey, v2: { refDate: periodKey, ...v2 } as never });
    const { routes } = mergeAliasedRoutes({
      'Yellow-N': [e('20220901', { rep: { h: 15, p: { amPeak: 15, midday: 15 } }, sat: { h: 20 }, sun: { h: 30 }, flag: 'fast' })],
      'Yellow-S': [e('20220901', { rep: { h: 20, p: { amPeak: 12, midday: 20 } }, sat: { lim: true }, sun: { h: 20 } })],
    }, YELLOW, projectSidecarByDay, sidecar);
    expect(routes.Yellow.map(x => x.v2)).toEqual([{ refDate: '20220901', rep: { h: 20, p: { amPeak: 15, midday: 20 } }, sat: { lim: true }, sun: { h: 30 } }]);
    const lim = mergeAliasedRoutes({
      'Yellow-N': [e('20230901', { rep: { lim: true } })],
      'Yellow-S': [e('20230901', { rep: { h: 15 } })],
    }, YELLOW, projectSidecarByDay, sidecar);
    expect(lim.routes.Yellow[0].v2).toEqual({ refDate: '20230901', rep: { lim: true } });
  });

  it('a direction with no value in a period leaves the route without one there (blank, null), as today', () => {
    expect(worseSidecarEntry({ v2: { rep: {} } }, { v2: { rep: { h: 10 } } }).v2.rep).toEqual({});
    expect(worseArchiveChange({ headway: 10, headwayByPeriod: { late: null } as never }, { headway: 12, headwayByPeriod: { late: 30 } as never }).headwayByPeriod).toEqual({ late: null });
  });

  it('legitimate: plain renames still concatenate (LA Metro 2/302 -> 2), and a direction alias needs its combine', () => {
    const r = mergeAliasedRoutes({ '2/302': [{ periodKey: 'a', headway: 10 }], 2: [{ periodKey: 'a', headway: 12 }] }, { 2: ['2/302'] }, undefined, archive);
    expect(r.routes['2']).toHaveLength(2);
    expect(() => mergeAliasedRoutes({ 'Yellow-N': [{ periodKey: 'a', headway: 1 }] }, YELLOW)).toThrow(/needs a combine/);
  });

  it('BART\'s six lines and SLO RTA 12 come only from the merge recorded in the artifact (CIV-1275, CIV-1314)', () => {
    // The 2026-11-06 full publish carries directionSplits for bart and slorta, so their hand-written config entries
    // are gone (CIV-1314); the generated aliases below are the same ones.
    const aliases = JSON.parse(readFileSync('config/history-route-aliases.json', 'utf8')) as HistoryRouteAliases;
    expect(aliases.bart).toBeUndefined();
    expect(aliases.slorta).toBeUndefined();
    const bart = aliasesFromDirectionSplits(['Blue', 'Green', 'Grey', 'Orange', 'Red', 'Yellow'].map(base => ({ base, halves: [`${base}-N`, `${base}-S`] })));
    expect(Object.keys(bart).sort()).toEqual(['Blue', 'Green', 'Grey', 'Orange', 'Red', 'Yellow']);
    expect(currentRouteShortNamesFor('Yellow-N', undefined, bart)).toEqual(['Yellow']);
    // The published slorta artifact lists the halves as 12S, 12N; either order names the same route.
    const slorta = aliasesFromDirectionSplits([{ base: '12', halves: ['12S', '12N'] }]);
    expect(currentRouteShortNamesFor('12S', undefined, slorta)).toEqual(['12']);
    expect(currentRouteShortNamesFor('12N', undefined, slorta)).toEqual(['12']);
    const halves = { '12N': [{ periodKey: '20220901', headway: 60 }], '12S': [{ periodKey: '20220901', headway: 55 }] };
    expect(mergeAliasedRoutes(halves, slorta, projectArchiveByDay, archive))
      .toEqual(mergeAliasedRoutes(halves, aliasesFromDirectionSplits([{ base: '12', halves: ['12N', '12S'] }]), projectArchiveByDay, archive));
  });
});

describe('aliases generated from the direction-split merge (CIV-1275)', () => {
  it('each merge recorded in the artifact is the direction alias the config used to hold', () => {
    const generated = aliasesFromDirectionSplits([
      { base: 'Yellow', halves: ['Yellow-N', 'Yellow-S'] },
      { base: '12', halves: ['12N', '12S'] },
    ]);
    expect(generated).toEqual({
      Yellow: [{ key: 'Yellow-N', direction: true }, { key: 'Yellow-S', direction: true }],
      '12': [{ key: '12N', direction: true }, { key: '12S', direction: true }],
    });
    // Folding with the generated entry reads exactly as with the hand-written one.
    const halves = {
      'Yellow-N': [{ periodKey: '20220901', headway: 15 }],
      'Yellow-S': [{ periodKey: '20220901', headway: 14 }],
    };
    expect(mergeAliasedRoutes(halves, generated, projectArchiveByDay, archive)).toEqual(mergeAliasedRoutes(halves, YELLOW, projectArchiveByDay, archive));
  });

  it('a half named like its base, or missing, adds nothing', () => {
    expect(aliasesFromDirectionSplits([{ base: 'Loop', halves: ['Loop', ''] }])).toEqual({});
  });

  it('a config entry for the same key wins; other keys are added', () => {
    const configured = { Yellow: ['Yellow Line'] as HistoryAliasEntry[], '20': ['19'] as HistoryAliasEntry[] };
    const generated = aliasesFromDirectionSplits([{ base: 'Yellow', halves: ['Yellow-N', 'Yellow-S'] }, { base: '12', halves: ['12N', '12S'] }]);
    expect(withGeneratedAliases(configured, generated)).toEqual({
      '12': [{ key: '12N', direction: true }, { key: '12S', direction: true }],
      Yellow: ['Yellow Line'],
      '20': ['19'],
    });
    expect(withGeneratedAliases(undefined, generated)).toEqual(generated);
    expect(withGeneratedAliases(configured, {})).toBe(configured);
  });
});
