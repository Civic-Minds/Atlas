import { describe, expect, it } from 'vitest';
import {
  selectDirectionCoveragePool,
  selectDirectionPeriodPool,
  stampWorstDirectionHeadways,
  type WorstDirectionFeature,
} from '../worstDirection';

function feat(opts: {
  routeShortName: string;
  day: string;
  directionId: number;
  headway?: number | null;
  headwayByPeriod?: Record<string, number | null>;
  headwayByPeriodSustained?: Record<string, boolean>;
  tier?: string;
  periodCoverageHeadway?: Record<string, number | null>;
}): WorstDirectionFeature {
  return {
    properties: {
      routeShortName: opts.routeShortName,
      day: opts.day,
      directionId: opts.directionId,
      headway: opts.headway ?? null,
      ...(opts.headwayByPeriod ? { headwayByPeriod: opts.headwayByPeriod } : {}),
      ...(opts.headwayByPeriodSustained
        ? { headwayByPeriodSustained: opts.headwayByPeriodSustained }
        : {}),
      ...(opts.tier !== undefined ? { tier: opts.tier } : {}),
      ...(opts.periodCoverageHeadway ? { periodCoverageHeadway: opts.periodCoverageHeadway } : {}),
    },
  };
}

describe('stampWorstDirectionHeadways', () => {
  it('uses worst direction within the same day only', () => {
    const features = [
      feat({ routeShortName: '15', day: 'Weekday', directionId: 0, headway: 60 }),
      feat({ routeShortName: '15', day: 'Weekday', directionId: 1, headway: 45 }),
      feat({ routeShortName: '15', day: 'Saturday', directionId: 0, headway: 90 }),
      feat({ routeShortName: '15', day: 'Saturday', directionId: 1, headway: 90 }),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadway).toBe(60);
    expect(features[1].properties.worstDirectionHeadway).toBe(60);
    expect(features[2].properties.worstDirectionHeadway).toBe(90);
    expect(features[3].properties.worstDirectionHeadway).toBe(90);
  });

  it('stamps worst period headways per day', () => {
    const features = [
      feat({
        routeShortName: '15',
        day: 'Weekday',
        directionId: 0,
        headway: 60,
        headwayByPeriod: { midday: 60 },
      }),
      feat({
        routeShortName: '15',
        day: 'Weekday',
        directionId: 1,
        headway: 45,
        headwayByPeriod: { midday: 45 },
      }),
      feat({
        routeShortName: '15',
        day: 'Saturday',
        directionId: 0,
        headway: 90,
        headwayByPeriod: { midday: 90 },
      }),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 60 });
    expect(features[2].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 90 });
  });

  it('does not let a peak short-turn with no real midday service gate the route (TTC 63)', () => {
    // Northbound: Cedarvale every 10 (primary), St Clair peak short-turn thin at midday.
    // Southbound: Liberty Village every 10.
    const features = [
      feat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 0,
        headway: 10,
        tier: '10',
        headwayByPeriod: { midday: 10 },
        headwayByPeriodSustained: { midday: true },
      }),
      feat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 1,
        headway: 10,
        tier: '10',
        headwayByPeriod: { midday: 10 },
        headwayByPeriodSustained: { midday: true },
      }),
      feat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 1,
        headway: 175,
        tier: 'infrequent',
        headwayByPeriod: { midday: 175 },
        headwayByPeriodSustained: { midday: false },
      }),
      feat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 1,
        headway: null,
        tier: 'span',
      }),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadway).toBe(10);
    expect(features[1].properties.worstDirectionHeadway).toBe(10);
    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 10 });
    // St Clair still carries its own branch stats; only route-level worst is corrected.
    expect(features[2].properties.headwayByPeriod?.midday).toBe(175);
    expect(features[2].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 10 });
  });

  it('uses the slower real destination when both run all midday (TTC 507 dual terminus)', () => {
    // Long Branch every 8 + Marine Parade every 25 — both sustained midday.
    // Whole-route filter must use 25 (outer cadence), not 8 from the denser short end.
    const features = [
      feat({
        routeShortName: '507',
        day: 'Weekday',
        directionId: 0,
        headway: 8,
        tier: '10',
        headwayByPeriod: { midday: 8 },
        headwayByPeriodSustained: { midday: true },
      }),
      feat({
        routeShortName: '507',
        day: 'Weekday',
        directionId: 0,
        headway: 25,
        tier: '30',
        headwayByPeriod: { midday: 25 },
        headwayByPeriodSustained: { midday: true },
      }),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadway).toBe(25);
    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 25 });
    expect(features[1].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 25 });
  });

  it('still fails a route when the opposing direction is genuinely worse (Kingston-style)', () => {
    const features = [
      feat({
        routeShortName: '701',
        day: 'Weekday',
        directionId: 0,
        headway: 15,
        tier: '15',
        headwayByPeriod: { midday: 10 },
        headwayByPeriodSustained: { midday: true },
      }),
      feat({
        routeShortName: '701',
        day: 'Weekday',
        directionId: 1,
        headway: 30,
        tier: '30',
        headwayByPeriod: { midday: 45 },
        headwayByPeriodSustained: { midday: true },
      }),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadway).toBe(30);
    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 45 });
  });

  it('stamps the worst full-window wait, including a late-start direction', () => {
    const features = [
      { properties: { routeShortName: '201', day: 'Weekday', directionId: 0, periodCoverageHeadway: { overnight: 10 } } },
      { properties: { routeShortName: '201', day: 'Weekday', directionId: 1, periodCoverageHeadway: { overnight: 150 } } },
    ] as WorstDirectionFeature[];
    stampWorstDirectionHeadways(features);
    expect(features[0].properties.worstDirectionPeriodCoverageHeadway?.overnight).toBe(150);
    expect(features[1].properties.worstDirectionPeriodCoverageHeadway?.overnight).toBe(150);
  });

  it('stamps routes that publish no short name by route id (rail lines like MBTA Red, Metro-North)', () => {
    const red = (directionId: number, midday: number, routeId = 'Red') => ({
      properties: { routeShortName: '', routeId, day: 'Weekday', directionId, headway: midday, headwayByPeriod: { midday } },
    }) as WorstDirectionFeature;
    const features = [red(0, 9), red(1, 14), red(0, 30, 'Blue'), red(1, 5, 'Blue')];
    stampWorstDirectionHeadways(features);
    expect(features[0].properties.worstDirectionHeadwayByPeriod?.midday).toBe(14);
    expect(features[1].properties.worstDirectionHeadwayByPeriod?.midday).toBe(14);
    expect(features[2].properties.worstDirectionHeadwayByPeriod?.midday).toBe(30);
    expect(features[3].properties.worstDirectionHeadway).toBe(30);
  });
  it('drops an occasional extension when the direction has a steady main pattern', () => {
    const features = [
      feat({ routeShortName: 'X', day: 'Weekday', directionId: 0, tier: '10', headway: 5, headwayByPeriod: { amPeak: 5 }, headwayByPeriodSustained: { amPeak: true } }),
      feat({ routeShortName: 'X', day: 'Weekday', directionId: 0, tier: 'infrequent', headway: 40, headwayByPeriod: { amPeak: 23 }, headwayByPeriodSustained: { amPeak: true } }),
      feat({ routeShortName: 'X', day: 'Weekday', directionId: 1, tier: '10', headway: 4, headwayByPeriod: { amPeak: 4 }, headwayByPeriodSustained: { amPeak: true } }),
    ];
    stampWorstDirectionHeadways(features);
    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ amPeak: 5 });
  });

  it('never lets a direction vanish: a non-steady main pattern keeps the extension in the check', () => {
    // TransLink 99 shape (#602): eastbound main pattern non-steady, only the extension is steady.
    const features = [
      feat({ routeShortName: 'Y', day: 'Weekday', directionId: 0, tier: '10', headway: 3, headwayByPeriod: { amPeak: 4 }, headwayByPeriodSustained: { amPeak: false } }),
      feat({ routeShortName: 'Y', day: 'Weekday', directionId: 0, tier: 'infrequent', headway: 9, headwayByPeriod: { amPeak: 23 }, headwayByPeriodSustained: { amPeak: true } }),
      feat({ routeShortName: 'Y', day: 'Weekday', directionId: 1, tier: '10', headway: 3, headwayByPeriod: { amPeak: 3 }, headwayByPeriodSustained: { amPeak: true } }),
    ];
    stampWorstDirectionHeadways(features);
    expect(features[2].properties.worstDirectionHeadwayByPeriod).toEqual({ amPeak: 23 });
  });

  describe('period coverage uses the same pool as the period headway (#658)', () => {
    const route = (directionId: number, o: Omit<Parameters<typeof feat>[0], 'routeShortName' | 'day' | 'directionId'>) =>
      feat({ routeShortName: 'C', day: 'Weekday', directionId, ...o });

    it('a rare variant that does not run in the period no longer sets the coverage (TTC 506 High Park)', () => {
      const features = [
        route(0, { tier: '15', headwayByPeriod: { midday: 10 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 13 } }),
        route(1, { tier: '10', headwayByPeriod: { midday: 10 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 10 } }),
        // 7 overnight trips: no midday headway, one huge midday gap.
        route(1, { tier: 'infrequent', headwayByPeriod: { midday: null }, periodCoverageHeadway: { midday: 345 } }),
      ];
      stampWorstDirectionHeadways(features);
      for (const f of features) {
        expect(f.properties.worstDirectionPeriodCoverageHeadway?.midday).toBe(13);
        expect(f.properties.worstDirectionHeadwayByPeriod?.midday).toBe(10);
      }
    });

    it('an infrequent sibling is set aside for coverage when a steady regular pattern runs (TTC 100 via Linkwood)', () => {
      const features = [
        route(0, { tier: '10', headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 12 } }),
        route(1, { tier: '15', headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 12 } }),
        route(1, { tier: 'infrequent', headwayByPeriod: { midday: 15 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 286 } }),
      ];
      stampWorstDirectionHeadways(features);
      expect(features[0].properties.worstDirectionPeriodCoverageHeadway?.midday).toBe(12);
    });

    it('a direction whose patterns are all minor still counts, and its gap still fails the route', () => {
      // Every pattern in direction 1 is infrequent and unsteady: nothing is set aside, the
      // direction keeps its own worst coverage and the route cannot pass on direction 0 alone.
      const features = [
        route(0, { tier: '10', headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 10 } }),
        route(1, { tier: 'infrequent', headwayByPeriod: { midday: 14 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 329 } }),
        route(1, { tier: 'infrequent', headwayByPeriod: { midday: 30 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 120 } }),
      ];
      stampWorstDirectionHeadways(features);
      expect(features[0].properties.worstDirectionPeriodCoverageHeadway?.midday).toBe(329);
    });

    it('a direction that runs nothing in the period falls back to every sibling (late start still fails)', () => {
      const features = [
        route(0, { tier: '10', headwayByPeriod: { overnight: 20 }, headwayByPeriodSustained: { overnight: true }, periodCoverageHeadway: { overnight: 25 } }),
        route(1, { tier: '30', headwayByPeriod: { overnight: null }, periodCoverageHeadway: { overnight: 150 } }),
        route(1, { tier: 'span', periodCoverageHeadway: { overnight: 200 } }),
      ];
      stampWorstDirectionHeadways(features);
      expect(features[0].properties.worstDirectionPeriodCoverageHeadway?.overnight).toBe(200);
    });

    it('with no steady pattern, a direction is judged by the patterns that run, regular first (NYCT B17)', () => {
      const features = [
        route(0, { tier: '30', headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 12 } }),
        route(1, { tier: '20', headwayByPeriod: { midday: 9 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 26 } }),
        route(1, { tier: 'infrequent', headwayByPeriod: { midday: 167 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 309 } }),
        route(1, { tier: 'span', periodCoverageHeadway: { midday: 336 } }),
      ];
      stampWorstDirectionHeadways(features);
      expect(features[0].properties.worstDirectionPeriodCoverageHeadway?.midday).toBe(26);
    });

    it('keeps a span pattern out of the pool when a real pattern runs (TTC 84 Pioneer Village via Oakdale)', () => {
      const features = [
        route(0, { tier: '60', headwayByPeriod: { amPeak: 6 }, headwayByPeriodSustained: { amPeak: true }, periodCoverageHeadway: { amPeak: 16 } }),
        route(1, { tier: '30', headwayByPeriod: { amPeak: 12 }, headwayByPeriodSustained: { amPeak: true }, periodCoverageHeadway: { amPeak: 14 } }),
        route(1, { tier: 'span', headwayByPeriod: { amPeak: 25 }, headwayByPeriodSustained: { amPeak: true }, periodCoverageHeadway: { amPeak: 62 } }),
      ];
      stampWorstDirectionHeadways(features);
      expect(features[0].properties.worstDirectionPeriodCoverageHeadway?.amPeak).toBe(16);
      expect(features[0].properties.worstDirectionHeadwayByPeriod?.amPeak).toBe(12);
    });

    it('the headway pool and the coverage pool are the same patterns whenever one is steady', () => {
      const candidates = [
        { id: 'main', tier: '10', sustained: true },
        { id: 'extension', tier: 'infrequent', sustained: true },
        { id: 'ghost', tier: '10', sustained: false },
      ];
      expect(selectDirectionPeriodPool(candidates).map(c => c.id)).toEqual(['main']);
      expect(selectDirectionCoveragePool(candidates).map(c => c.id)).toEqual(['main']);
      const onlyExtension = [candidates[1], candidates[2]];
      expect(selectDirectionPeriodPool(onlyExtension).map(c => c.id)).toEqual(['extension']);
      expect(selectDirectionCoveragePool(onlyExtension).map(c => c.id)).toEqual(['extension']);
      // No steady pattern: the headway pool is empty, coverage still keeps the direction.
      expect(selectDirectionPeriodPool([candidates[2]])).toEqual([]);
      expect(selectDirectionCoveragePool([candidates[2]]).map(c => c.id)).toEqual(['ghost']);
    });
  });
});
