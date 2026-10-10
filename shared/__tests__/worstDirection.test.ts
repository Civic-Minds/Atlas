import { describe, expect, it } from 'vitest';
import { stampWorstDirectionHeadways, type WorstDirectionFeature } from '../worstDirection';

function feat(opts: {
  routeShortName: string;
  day: string;
  directionId: number;
  headway?: number | null;
  headwayByPeriod?: Record<string, number | null>;
  headwayByPeriodSustained?: Record<string, boolean>;
  tier?: string;
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
});
