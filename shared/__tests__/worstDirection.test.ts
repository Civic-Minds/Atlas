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

  it('does not let a rare short-turn branch gate a direction that has frequent primary service (TTC 63)', () => {
    // Northbound: Cedarvale every 10 (primary), St Clair every ~3h sparse short-turn.
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
});
