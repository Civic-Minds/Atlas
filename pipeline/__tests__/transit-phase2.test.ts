import { describe, expect, it } from 'vitest';
import { applyAnalysisCriteria as applyAnalysisCriteriaToDays, determineTier } from '../transit-phase2';
import { DEFAULT_CRITERIA } from '../defaults';
import { WEEKDAYS, type RawRouteDepartures } from '../../types/gtfs';

// Most cases here describe one weekday timetable as a Monday row. The Weekday rollup needs
// service on its representative weekday (#710), so a Monday-only input stands for the same
// timetable running Mon-Fri. Inputs that list their own days are passed through unchanged.
const applyAnalysisCriteria: typeof applyAnalysisCriteriaToDays = (rows, ...rest) =>
  applyAnalysisCriteriaToDays(
    rows.every(row => row.day === 'Monday') ? rows.flatMap(row => WEEKDAYS.map(day => ({ ...row, day }))) : rows,
    ...rest,
  );

function raw(overrides: Partial<RawRouteDepartures> & { departureTimes: number[] }): RawRouteDepartures {
  const departureTimes = [...overrides.departureTimes].sort((a, b) => a - b);
  return {
    route: '1',
    dir: '0',
    day: 'Monday',
    routeType: '3',
    modeName: 'Bus',
    gaps: [],
    serviceSpan: { start: departureTimes[0], end: departureTimes[departureTimes.length - 1] },
    tripCount: departureTimes.length,
    serviceIds: ['1'],
    warnings: [],
    ...overrides,
    departureTimes,
  };
}

describe('applyAnalysisCriteria', () => {
  const sustainedTenMinuteTimes = (openingGap: number): number[] => [
    420,
    420 + openingGap,
    ...Array.from({ length: 17 }, (_, index) => 420 + openingGap + 10 + index * 10),
  ];

  it('allows one true opening edge up to tier plus ten minutes', () => {
    const results = applyAnalysisCriteria([
      raw({ route: 'edge-opening', departureTimes: sustainedTenMinuteTimes(20) }),
    ]);
    expect(results.find(item => item.route === 'edge-opening')).toMatchObject({ tier: '10', edgeGapAllowance: 'opening' });
  });

  it('does not use an opening edge above the tier-plus-ten ceiling for that tier', () => {
    const results = applyAnalysisCriteria([
      raw({ route: 'edge-too-long', departureTimes: sustainedTenMinuteTimes(21) }),
    ]);
    expect(results.find(item => item.route === 'edge-too-long')).toMatchObject({ edgeGapAllowance: 'opening' });
    expect(results.find(item => item.route === 'edge-too-long')?.tier).not.toBe('10');
  });

  it('does not treat an analysis-window boundary as a true service edge', () => {
    const results = applyAnalysisCriteria([
      raw({ route: 'window-boundary', departureTimes: [400, ...sustainedTenMinuteTimes(20)] }),
    ]);
    expect(results.find(item => item.route === 'window-boundary')).toMatchObject({ edgeGapAllowance: undefined });
  });

  it('allows both genuine service edges when the internal schedule remains sustained', () => {
    const times = sustainedTenMinuteTimes(20);
    times.push(times.at(-1)! + 20);
    const results = applyAnalysisCriteria([
      raw({ route: 'both-edges', departureTimes: times }),
    ]);
    expect(results.find(item => item.route === 'both-edges')).toMatchObject({ tier: '10', edgeGapAllowance: 'both' });
  });

  it('does not use an edge allowance when it would leave only three departures', () => {
    const results = applyAnalysisCriteria([
      raw({ route: 'sparse-edge', departureTimes: [420, 440, 450, 460] }),
    ]);
    expect(results.find(item => item.route === 'sparse-edge')).toMatchObject({
      tier: 'span',
      serviceClass: 'irregular',
      edgeGapAllowance: undefined,
    });
  });

  it('produces a normal daytime result unaffected by the overnight fallback', () => {
    // 08:00–18:00, every 15 -- real sustained daytime coverage (unlike the narrow rush-hour-only
    // burst cases the existing coverage check is meant to catch).
    const results = applyAnalysisCriteria([
      raw({ route: '504', departureTimes: Array.from({ length: 41 }, (_, i) => 480 + i * 15) }),
    ]);
    const r = results.find(x => x.route === '504');
    expect(r).toBeDefined();
    expect(r!.tier).toBe('15');
    expect(r!.warnings ?? []).not.toContain('Overnight-only service (outside daytime analysis window)');
    expect(r!.serviceClass).toBe('regular');
  });

  it('keeps predictable evening service visible as time-limited instead of irregular', () => {
    // NRT-style service: every 60 minutes for five repeated trips, but only during the evening.
    const results = applyAnalysisCriteria([
      raw({ route: '401', dir: '0', departureTimes: [1020, 1080, 1140, 1200, 1260] }),
      raw({ route: '401', dir: '1', departureTimes: [1020, 1080, 1140, 1200, 1260] }),
    ]);
    const routes = results.filter(x => x.route === '401');
    expect(routes).toHaveLength(2);
    expect(routes.every(x => x.tier === '60')).toBe(true);
    expect(routes.every(x => x.serviceClass === 'time-limited')).toBe(true);
  });

  it('classifies separate AM and PM peak blocks as irregular despite spanning the clock', () => {
    const results = applyAnalysisCriteria([
      raw({
        route: '986',
        departureTimes: [
          ...Array.from({ length: 20 }, (_, i) => 362 + i * 6),
          ...Array.from({ length: 20 }, (_, i) => 906 + i * 6),
        ],
      }),
    ]);
    const r = results.find(x => x.route === '986');
    expect(r).toMatchObject({ tier: 'span', serviceClass: 'irregular' });
  });

  it('#313: keeps an entirely overnight route instead of dropping it (TTC Blue Night pattern)', () => {
    // All departures ~1:12–2:12am next-day-encoded (25:12–26:12) -- zero in the 07:00–22:00 window.
    const results = applyAnalysisCriteria([
      raw({ route: '300', departureTimes: [1512, 1527, 1542, 1557, 1572, 1587, 1602, 1617] }), // every 15
    ]);
    const r = results.find(x => x.route === '300');
    expect(r).toBeDefined();
    expect(r!.tier).toBe('15');
    expect(r!.warnings).toContain('Overnight-only service (outside daytime analysis window)');
  });

  it('does not misclassify a tight overnight-only route as span via the daytime coverage check', () => {
    // Real ~10-min service across a 2.5-hour overnight span -- coverage against the (irrelevant)
    // 900-minute daytime window would be ~17%, which would wrongly force 'span' without the
    // fallback's coverage exemption. Span is >90min so the burst check doesn't independently catch it.
    const results = applyAnalysisCriteria([
      raw({ route: '999', departureTimes: Array.from({ length: 16 }, (_, i) => 1500 + i * 10) }),
    ]);
    const r = results.find(x => x.route === '999');
    expect(r!.tier).toBe('10');
  });

  it('draws a pattern with one departure a day as one-off, not dropped (#720, TARC 99)', () => {
    // TARC 99 (UPS West Louisville Shuttle): each of its shapes runs once a day, 04:29 or 22:10.
    const results = applyAnalysisCriteria([
      raw({ route: '888', departureTimes: [1500] }),
      raw({ route: '99', departureTimes: [269] }),
      raw({ route: '99', departureTimes: [1330], shapeId: 'evening' }),
      raw({ route: '99', departureTimes: [600], shapeId: 'midday' }),
    ]);
    for (const r of results.filter(x => x.route === '888' || x.route === '99')) {
      expect(r).toMatchObject({ tier: 'span', serviceClass: 'irregular', tripCount: 1 });
    }
    expect(results.filter(x => x.route === '99')).toHaveLength(3);
    expect(results.find(x => x.route === '888')).toBeDefined();
  });

  it('does not falsely promote two stray overnight trips into a real tier (span burst check still applies)', () => {
    // Two trips 30 minutes apart, isolated overnight -- a real span/burst, not sustained service.
    const results = applyAnalysisCriteria([
      raw({ route: '777', departureTimes: [1500, 1530] }),
    ]);
    const r = results.find(x => x.route === '777');
    expect(r!.tier).toBe('span');
    expect(r!.serviceClass).toBe('irregular');
  });

  it('accepts three repeated departures as the minimum sustained schedule evidence', () => {
    const results = applyAnalysisCriteria([
      raw({ route: '776', departureTimes: [1020, 1080, 1140] }),
    ]);
    const r = results.find(x => x.route === '776');
    expect(r).toMatchObject({ tier: '60', serviceClass: 'time-limited' });
  });

  it('uses the production tier map instead of the legacy fallback percentage', () => {
    const results = applyAnalysisCriteria([
      // A 28-minute gap mid-sample is past 20's grace (no near miss or edge allowance absorbs it), inside 30's.
      raw({ route: 'tier-map', departureTimes: [420, 440, 460, 480, 508, ...Array.from({ length: 6 }, (_, i) => 528 + i * 20)] }),
    ]);
    expect(results.find(item => item.route === 'tier-map')?.tier).toBe('30');
  });

  it('uses one real weekday for rollup statistics instead of merging weekdays into a fake timetable', () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const results = applyAnalysisCriteria(days.map((day, index) => raw({
      route: 'weekday-rollup',
      day,
      departureTimes: Array.from({ length: 17 }, (_, trip) => 480 + index * 5 + trip * 30),
    })));
    const weekday = results.find(item => item.route === 'weekday-rollup' && item.day === 'Weekday');

    expect(weekday).toMatchObject({ tier: '30', medianHeadway: 30, tripCount: 17 });
    expect(weekday?.times).toHaveLength(17);
    expect(weekday?.times[0]).toBe(480);
  });

  it('flags weekday tier variation while retaining the slowest weekday tier', () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const results = applyAnalysisCriteria(days.map((day) => raw({
      route: 'weekday-tier-variation',
      day,
      departureTimes: Array.from({ length: 17 }, (_, trip) => 480 + trip * (day === 'Friday' ? 15 : 30)),
    })));
    const weekday = results.find(item => item.route === 'weekday-tier-variation' && item.day === 'Weekday');

    expect(weekday).toMatchObject({ tier: '30', weekdayTierVariation: true });
  });

  it('keeps full-day departure times in a rail weekday rollup', () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const results = applyAnalysisCriteria(days.map(day => raw({
      route: 'rail-full-day',
      day,
      routeType: '2',
      departureTimes: [480, 600, 840, 1080, 1320],
    })));
    const weekday = results.find(item => item.route === 'rail-full-day' && item.day === 'Weekday');

    expect(weekday?.times).toEqual([480, 600, 840, 1080, 1320]);
  });

  it('correctly falls to infrequent/span rather than a false tight tier when a day bucket mixes two separate overnight blocks (real TTC 300 pattern)', () => {
    // Tail of one night's run (233-263, non-extended) plus the start of the next night's run
    // (1512+, extended) landing in the same calendar-day bucket -- a real GTFS quirk confirmed
    // against TTC's actual feed. The ~20hr gap between them must not average into a plausible-
    // looking tier.
    const results = applyAnalysisCriteria([
      raw({ route: '300', dir: '1', departureTimes: [233, 248, 263, 1512, 1527, 1542, 1557, 1572, 1587, 1602, 1620, 1635, 1650] }),
    ]);
    const r = results.find(x => x.route === '300' && x.dir === '1');
    expect(r).toBeDefined();
    expect(['span', 'infrequent']).toContain(r!.tier);
  });
});

describe('tier-specific internal near-miss allowances', () => {
  it('allows one 10-minute near miss when ten percent permits it', () => {
    const gaps = [15, ...Array(9).fill(10)];
    expect(determineTier(gaps, gaps.length + 1, gaps.reduce((a, b) => a + b, 0), [10], 5, 0, 0.15, 0.05, {
      10: 0.10,
    })).toBe('10');
  });

  it('counts a qualifying edge allowance against the same near-miss budget', () => {
    const gaps = [15, ...Array(9).fill(10)];
    const span = gaps.reduce((a, b) => a + b, 0);
    expect(determineTier(gaps, gaps.length + 1, span, [10], 5, 0, 0.15, 0.05, {
      10: 0.10,
    }, 1)).toBe('span');
  });

  it('allows one near miss on a whole-day sample where five percent rounds below one, none on a short one', () => {
    // GRACE_FLOOR_MIN_GAPS: an hourly line over a 12-hour window (12 gaps) allowed no gap inside
    // the grace, so one 61-minute gap failed it (wmata P72 Saturday). Ten gaps carry one near
    // miss; seven do not.
    const gaps = [25, ...Array(9).fill(20)];
    expect(determineTier(gaps, gaps.length + 1, gaps.reduce((a, b) => a + b, 0), [20], 5, 0, 0.15, 0.05, {
      20: 0.05,
    })).toBe('20');
    const short = [25, ...Array(6).fill(20)];
    expect(determineTier(short, short.length + 1, short.reduce((a, b) => a + b, 0), [20], 5, 0, 0.15, 0.05, {
      20: 0.05,
    })).toBe('span');
    const hourly = [61, ...Array(11).fill(60)];
    expect(determineTier(hourly, hourly.length + 1, hourly.reduce((a, b) => a + b, 0), [60], 5, 0, 0.15, 0.05, {
      60: 0.05,
    })).toBe('60');
    expect(determineTier([61, 62, ...Array(10).fill(60)], 13, 722, [60], 5, 0, 0.15, 0.05, { 60: 0.05 })).toBe('span');
  });

  it('caps a large period at three internal near misses', () => {
    const gaps = [65, 65, 65, 65, ...Array(56).fill(60)];
    expect(determineTier(gaps, gaps.length + 1, gaps.reduce((a, b) => a + b, 0), [60], 5, 0, 0.15, 0.05, {
      60: 0.05,
    })).toBe('span');
  });
});

describe('partial-weekday routes (#710)', () => {
  it('gives a route that runs on only 2 of 5 weekdays the tier infrequent with no timetable', () => {
    const results = applyAnalysisCriteriaToDays((['Thursday', 'Friday'] as const).map(day => raw({
      route: 'thu-fri', day, departureTimes: Array.from({ length: 14 }, (_, i) => 1065 + i * 27),
    })));
    const weekday = results.find(item => item.route === 'thu-fri' && item.day === 'Weekday');
    expect(weekday).toMatchObject({ tier: 'infrequent', partialWeekday: true, times: [] });
  });

  it('keeps a frequency tier for a route on 3 of 5 weekdays (Wed-Fri) and 4 of 5 (no Monday)', () => {
    for (const days of [['Wednesday', 'Thursday', 'Friday'], ['Tuesday', 'Wednesday', 'Thursday', 'Friday']] as const) {
      const results = applyAnalysisCriteriaToDays(days.map(day => raw({
        route: 'part-week', day, departureTimes: Array.from({ length: 30 }, (_, i) => 420 + i * 15),
      })));
      const weekday = results.find(item => item.route === 'part-week' && item.day === 'Weekday');
      expect(weekday?.tier, days.join()).toBe('15');
      expect(weekday?.partialWeekday, days.join()).toBeUndefined();
    }
  });
});

describe('partial-weekday decision is per route direction (#710)', () => {
  it('does not mark a route partial when each weekday runs on its own shape', () => {
    const results = applyAnalysisCriteriaToDays(WEEKDAYS.map((day, index) => raw({
      route: 'shape-per-day', day, shapeId: `shape-${index}`, departureTimes: Array.from({ length: 30 }, (_, i) => 420 + i * 30),
    })));
    const weekday = results.filter(item => item.route === 'shape-per-day' && item.day === 'Weekday');
    expect(weekday.length).toBe(5);
    for (const item of weekday) {
      expect(item.partialWeekday).toBeUndefined();
      expect(item.tier).toBe('30');
    }
  });

  it('uses the route-direction weekday count when it is supplied', () => {
    const rows = (['Tuesday', 'Wednesday'] as const).map(day => raw({ route: 'cd-added', day, departureTimes: Array.from({ length: 30 }, (_, i) => 420 + i * 12) }));
    const partial = applyAnalysisCriteriaToDays(rows).find(item => item.day === 'Weekday');
    const full = applyAnalysisCriteriaToDays(rows, undefined, undefined, new Map([['cd-added::0', 5]])).find(item => item.day === 'Weekday');
    expect(partial?.partialWeekday).toBe(true);
    expect(full?.partialWeekday).toBeUndefined();
    expect(full?.tier).toBe('15');
  });
});

