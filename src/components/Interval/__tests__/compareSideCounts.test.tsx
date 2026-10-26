import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { canCountRenderedRoutes } from '../../../utils/compareSides';
import { CompareSideBar } from '../CompareControl';

const settings = { day: 'Saturday' as const, period: 'midday' as const, maxHeadway: 20 };
const bar = (counts: { total: number } | null) =>
  <CompareSideBar side="B" settings={settings} onChange={() => {}} counts={counts} />;

describe('Compare side caption count (#1075)', () => {
  it('shows no count while the map is still loading', () => {
    render(bar(null));
    expect(screen.queryByTestId('compare-counts-B')).toBeNull();
    expect(screen.queryByText(/routes?$/)).toBeNull();
  });

  it('shows the real count once loaded, and 0 for a loaded map that draws nothing', () => {
    const { rerender } = render(bar({ total: 12 }));
    expect(screen.getByTestId('compare-counts-B').textContent).toContain('12 routes');
    rerender(bar({ total: 0 }));
    expect(screen.getByTestId('compare-counts-B').textContent).toContain('0 routes');
  });
});

describe('canCountRenderedRoutes', () => {
  it('waits for route layers and a fully loaded map', () => {
    expect(canCountRenderedRoutes({ loaded: () => false }, 3)).toBe(false);
    expect(canCountRenderedRoutes({ loaded: () => true }, 0)).toBe(false);
    expect(canCountRenderedRoutes({ loaded: () => true }, 2)).toBe(true);
  });
});
