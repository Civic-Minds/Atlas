import { describe, expect, it } from 'vitest';
import { routeFeaturePassesMapFilter } from '../routeTileFilter';

// CIV-1598: the filter expression is cached by the agency Set. Each new selection must get its own answer.
describe('routeFeaturePassesMapFilter agency cache (CIV-1598)', () => {
  const props = { routeId: '1', agencySlug: 'ttc', day: 'Weekday', tier: '10', headway: 10, headwayByPeriod: { midday: 10 } };
  const input = (agencies: Set<string>) => ({ agencies, modes: new Set<number>(), day: 'Weekday', period: 'all' as const, maxHeadway: Infinity });

  it('a new selection without the agency hides it, and a selection with it shows it again', () => {
    expect(routeFeaturePassesMapFilter(props, input(new Set(['ttc', 'miway'])))).toBe(true);
    expect(routeFeaturePassesMapFilter(props, input(new Set(['miway'])))).toBe(false);
    expect(routeFeaturePassesMapFilter(props, input(new Set(['ttc'])))).toBe(true);
  });

  it('one selection reused across days reads each day', () => {
    const agencies = new Set(['ttc']);
    expect(routeFeaturePassesMapFilter(props, { ...input(agencies), day: 'Weekday' })).toBe(true);
    expect(routeFeaturePassesMapFilter(props, { ...input(agencies), day: 'Saturday' })).toBe(false);
  });

  it('a pass over many features with a 700-agency selection costs about what a one-agency selection does', () => {
    const features = Array.from({ length: 20000 }, (_, i) => ({ ...props, routeId: String(i) }));
    // Best of three, so a busy machine doesn't decide it (#1576: a fixed 250 ms budget failed under a loaded full run).
    const pass = (agencies: Set<string>) => Math.min(...[0, 1, 2].map(() => {
      const start = performance.now();
      for (const f of features) routeFeaturePassesMapFilter(f, input(agencies));
      return performance.now() - start;
    }));
    const one = pass(new Set(['ttc']));
    const many = pass(new Set(Array.from({ length: 700 }, (_, i) => `agency-${i}`).concat('ttc')));
    // Sorting the selection per feature made the 700-agency pass dozens of times slower (over 300 ms for 20,000
    // features); read once per selection, it costs about the same as one agency.
    expect(many).toBeLessThan(one * 5 + 25);
  });
});
