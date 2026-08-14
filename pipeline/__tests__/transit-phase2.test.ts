import { describe, expect, it } from 'vitest';
import { applyAnalysisCriteria } from '../transit-phase2';
import { DEFAULT_CRITERIA } from '../defaults';
import type { RawRouteDepartures } from '../../types/gtfs';

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

  it('still drops a group with fewer than 2 total departures (cannot compute any headway)', () => {
    const results = applyAnalysisCriteria([
      raw({ route: '888', departureTimes: [1500] }),
    ]);
    expect(results.find(x => x.route === '888')).toBeUndefined();
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

  it('does not merge same-headsign shape branches during weekday rollup', () => {
    const results = applyAnalysisCriteria([
      raw({ route: '14', headsign: 'Appleby GO', shapeId: 'branch-a', departureTimes: [540, 600, 660, 720, 780, 840] }),
      raw({ route: '14', headsign: 'Appleby GO', shapeId: 'branch-b', departureTimes: [570, 630, 690, 750, 810, 870] }),
    ]);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.shapeId).sort()).toEqual(['branch-a', 'branch-b']);
    expect(results.every(r => r.medianHeadway === 60)).toBe(true);
  });

  it('uses a representative weekday for subway schedules instead of merging small daily offsets', () => {
    const results = applyAnalysisCriteria(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day, i) => raw({
      route: 'marta-blue',
      day,
      routeType: '1',
      departureTimes: [600 + i, 612 + i, 624 + i, 636 + i, 648 + i, 660 + i],
    })));
    const r = results.find(x => x.route === 'marta-blue');
    expect(r).toBeDefined();
    expect(r!.medianHeadway).toBe(12);
    expect(r!.railLike).toBe(true);
    expect(r!.times).toEqual([600, 612, 624, 636, 648, 660]);
  });
});
