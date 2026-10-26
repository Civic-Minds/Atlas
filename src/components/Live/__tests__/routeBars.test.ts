import { describe, expect, it } from 'vitest';
import { routeBars } from '../tool/OverviewList';

const rows = (...v: (number | null)[]) => v.map(x => ({ f: x == null ? null : { value: x } }));

describe('routeBars', () => {
  it('measures each bar against the worst route, coloured by the map step', () => {
    expect(routeBars(rows(0.24, 0.12, 0.06), 'late')).toEqual([
      { width: 1, color: 'var(--strip-delay-2)' },
      { width: 0.5, color: 'var(--strip-delay-1)' },
      { width: 0.25, color: 'var(--strip-delay-0)' },
    ]);
  });
  it('uses the bunching colours for bunching', () => {
    expect(routeBars(rows(0.3), 'bunching')[0]!.color).toBe('var(--strip-bunching-2)');
  });
  it('draws run time in one neutral colour, and no bar for a route with no figure or a run time faster than the timetable', () => {
    expect(routeBars(rows(2, -3, null), 'runTime')).toEqual([{ width: 1, color: 'var(--text-secondary)' }, null, null]);
    expect(routeBars(rows(-1, -4), 'runTime')).toEqual([null, null]);
  });
});
