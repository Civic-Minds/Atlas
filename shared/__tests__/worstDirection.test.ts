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

describe('all-day worst-direction headline sets aside occasional patterns (#749)', () => {
  const ALL = ['amPeak', 'midday', 'pmPeak', 'evening'];
  // Full-window waits for the periods a pattern runs in; the value is not read by this rule.
  const cov = (...periods: string[]) => Object.fromEntries(periods.map(pk => [pk, 60]));
  const pat = (dir: number, hw: number, o: Partial<Parameters<typeof feat>[0]> = {}) =>
    feat({ routeShortName: 'R', day: 'Weekday', directionId: dir, headway: hw, tier: 'infrequent', ...o });
  const steadyMain = (dir: number, hw: number, o: Partial<Parameters<typeof feat>[0]> = {}) =>
    pat(dir, hw, { headwayByPeriod: { amPeak: hw, midday: hw, pmPeak: hw, evening: hw }, periodCoverageHeadway: cov(...ALL), ...o });
  const wdh = (features: WorstDirectionFeature[]) => {
    stampWorstDirectionHeadways(features);
    return new Set(features.map(f => f.properties.worstDirectionHeadway));
  };

  it('TTC 102 Weekday: a 3-trip short turn in 2 periods does not set 657', () => {
    expect(wdh([
      steadyMain(0, 12, { headwayByPeriod: { amPeak: 6, midday: 5, pmPeak: 13, evening: 7, late: 5 }, headwayByPeriodSustained: { late: false }, periodCoverageHeadway: cov(...ALL, 'late', 'overnight') }),
      pat(0, 657, { headwayByPeriod: {}, periodCoverageHeadway: cov('midday', 'evening') }),
      steadyMain(1, 16, { tier: '20' }),
      steadyMain(1, 30, { tier: '60' }),
    ])).toEqual(new Set([30]));
  });

  it('TriMet 12 Weekday: 1-trip patterns in both directions do not set 1141', () => {
    expect(wdh([
      pat(0, 1141, { headwayByPeriod: {}, periodCoverageHeadway: cov('amPeak') }),
      steadyMain(0, 15),
      pat(1, 1138, { periodCoverageHeadway: cov('pmPeak') }),
      steadyMain(1, 15),
    ])).toEqual(new Set([15]));
  });

  it('Dayton 07 Sunday: a variant whose only period value is unsustained does not set 131', () => {
    expect(wdh([
      feat({ routeShortName: 'R', day: 'Sunday', directionId: 0, headway: 131, tier: 'infrequent', headwayByPeriod: { midday: 131 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: cov('midday') }),
      feat({ routeShortName: 'R', day: 'Sunday', directionId: 0, headway: 38, tier: 'infrequent', headwayByPeriod: { amPeak: 38, midday: 38, pmPeak: 38 }, periodCoverageHeadway: cov(...ALL) }),
      feat({ routeShortName: 'R', day: 'Sunday', directionId: 1, headway: 38, tier: 'infrequent', headwayByPeriod: { amPeak: 38, midday: 38, pmPeak: 38 }, periodCoverageHeadway: cov(...ALL) }),
    ])).toEqual(new Set([38]));
  });

  it('keeps a real slow all-day destination that is steady nowhere (every 4 h vs a peak-only every 15)', () => {
    // Five trips every 4 hours leave under three departures in every period, so the pattern is
    // steady nowhere, but it runs in every period: midday riders really wait 4 hours.
    expect(wdh([
      pat(0, 240, { headwayByPeriod: {}, periodCoverageHeadway: cov(...ALL) }),
      pat(0, 15, { headwayByPeriod: { amPeak: 15, pmPeak: 15 }, periodCoverageHeadway: cov('amPeak', 'pmPeak') }),
      steadyMain(1, 20),
    ])).toEqual(new Set([240]));
  });

  it('Dayton 17: West Loop every 114 in every daytime period keeps the bar over East Loop 87', () => {
    expect(wdh([
      pat(1, 114, { headwayByPeriod: {}, periodCoverageHeadway: cov(...ALL) }),
      pat(1, 87, { headwayByPeriod: { midday: 87 }, periodCoverageHeadway: cov(...ALL) }),
      pat(1, 460, { headwayByPeriod: {}, periodCoverageHeadway: cov('amPeak', 'pmPeak') }),
      steadyMain(0, 57),
    ])).toEqual(new Set([114]));
  });

  it('keeps a genuinely sparse route whose only pattern is steady in no period', () => {
    expect(wdh([
      pat(0, 300, { headwayByPeriod: {}, periodCoverageHeadway: cov('amPeak', 'pmPeak') }),
      pat(1, 290, { periodCoverageHeadway: cov('amPeak', 'pmPeak') }),
    ])).toEqual(new Set([300]));
  });

  it('keeps a direction whose patterns are all unsteady in the check (never vanishes)', () => {
    expect(wdh([
      steadyMain(0, 20),
      pat(1, 240, { headwayByPeriod: {}, periodCoverageHeadway: cov('midday') }),
      pat(1, 180, { headwayByPeriod: { midday: 180 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: cov('midday') }),
    ])).toEqual(new Set([240]));
  });

  it('keeps the slower of two steady branches (each genuinely every 30 vs 20)', () => {
    expect(wdh([
      steadyMain(0, 20, { tier: '30' }),
      steadyMain(0, 30, { tier: '30' }),
      steadyMain(1, 20, { tier: '30' }),
      steadyMain(1, 30, { tier: '30' }),
    ])).toEqual(new Set([30]));
  });

  it('TransLink 100 Weekday: never raises the headline when the regular main pattern is unsteady everywhere', () => {
    const allUnsustained = { amPeak: false, midday: false, pmPeak: false, evening: false, late: false };
    expect(wdh([
      pat(0, 62, { headwayByPeriod: { amPeak: 41, midday: 62 }, periodCoverageHeadway: cov(...ALL) }),
      pat(0, 14, { tier: '30', headwayByPeriod: { amPeak: 8, midday: 14 }, headwayByPeriodSustained: allUnsustained, periodCoverageHeadway: cov(...ALL) }),
      steadyMain(1, 9, { tier: '20' }),
    ])).toEqual(new Set([14]));
  });

  it('CARTA 16 Saturday: a variant steady in some period still counts, and tiers are untouched', () => {
    const features = [
      pat(0, 100, { headwayByPeriod: { midday: 100 }, periodCoverageHeadway: cov('midday') }),
      pat(0, 40, { headwayByPeriod: { amPeak: 40, midday: 40 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: cov(...ALL) }),
      steadyMain(1, 40, { tier: '60' }),
    ];
    expect(wdh(features)).toEqual(new Set([100]));
    expect(features.map(f => f.properties.tier)).toEqual(['infrequent', 'infrequent', '60']);
  });
});

describe('#899: the all-day midday cap from each direction\'s midday wait', () => {
  const allDay = { amPeak: 20, midday: 20, pmPeak: 20, evening: 30, late: null, overnight: null };
  const peak = { amPeak: 10, midday: null, pmPeak: 10, evening: null, late: null, overnight: null };
  // One feature per direction; directionMiddayWait is the pipeline's direction-level value.
  const route = (waits: [number | null | undefined, number | null | undefined], otherMidday: Record<string, number | null> = peak) => {
    const features = [
      feat({ routeShortName: '1', day: 'Weekday', directionId: 0, headway: 20, tier: '20', headwayByPeriod: allDay, periodCoverageHeadway: allDay }),
      feat({ routeShortName: '1', day: 'Weekday', directionId: 1, headway: 10, tier: '10', headwayByPeriod: otherMidday, periodCoverageHeadway: otherMidday }),
    ];
    waits.forEach((w, i) => { if (w !== undefined) features[i].properties.directionMiddayWait = w; });
    stampWorstDirectionHeadways(features);
    return features.map(f => f.properties.worstDirectionMiddayCap);
  };

  it('a direction with no midday service beside one with it fails every all-day threshold', () => {
    // No midday departure at all, an AM run ending at 09:10 (wait 350), a stray 12:00 trip (180).
    for (const w of [null, 350, 180]) expect(route([20, w])).toEqual([999999, 999999]);
  });

  it('a direction with some midday service but no midday headway reading caps the route at its wait', () => {
    expect(route([20, 100])).toEqual([100, 100]);
  });

  it('no cap when both directions have midday service, the waiting direction has a midday headway, or for older artifacts', () => {
    expect(route([20, 20], allDay)).toEqual([undefined, undefined]);
    // An hourly direction with one 64-minute midday gap runs at midday.
    expect(route([60, 64], allDay)).toEqual([undefined, undefined]);
    // A 125-minute wait on a direction with a midday headway reading (GO 94: 09:35, 11:40, then
    // hourly) is judged by the coverage rules as before.
    expect(route([20, 125], { amPeak: 60, midday: 60, pmPeak: 30, evening: null, late: null, overnight: null })).toEqual([undefined, undefined]);
    // No direction-level wait on a sibling (an older artifact, or a synthesized direction): no cap.
    expect(route([20, undefined])).toEqual([undefined, undefined]);
  });

  it('a midday reading from an AM run that ends at 09:40 does not count (MBTA 354)', () => {
    expect(route([20, 320], { amPeak: 20, midday: 30, pmPeak: 30, evening: null, late: null, overnight: null })).toEqual([999999, 999999]);
  });

  it('one direction alone gets no cap', () => {
    const one = [feat({ routeShortName: '2', day: 'Weekday', directionId: 0, headway: 10, tier: '10', headwayByPeriod: peak, periodCoverageHeadway: peak })];
    one[0].properties.directionMiddayWait = null;
    stampWorstDirectionHeadways(one);
    expect(one[0].properties.worstDirectionMiddayCap).toBeUndefined();
  });
});
