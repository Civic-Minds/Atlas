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

describe('Compare grouping (CIV-1367)', () => {
  it('puts the badge once, the summary and the three menus in one named group per map', () => {
    render(bar({ total: 3 }));
    const group = screen.getByRole('group', { name: 'Filters for map B' });
    expect(group.querySelectorAll('span[aria-hidden="true"]').length).toBe(1);
    expect(group.textContent).toContain('3 routes');
    for (const name of ['Frequency', 'Day', 'Time']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    expect(screen.getAllByRole('group').length).toBe(1);
  });

  it('names the shared group and keeps "Both maps" as plain text, not a button', async () => {
    const { FilterChips } = await import('../FilterChips');
    render(
      <FilterChips variant="shared" maxHeadway={20} setMaxHeadway={() => {}} day="Saturday" setDay={() => {}} period="midday" setPeriod={() => {}}
        selectedModes={new Set()} setSelectedModes={() => {}} agencies={[]} selectedAgencies={new Set()} setSelectedAgencies={() => {}} bounds={null} />,
    );
    const group = screen.getByRole('group', { name: 'Filters for both maps' });
    expect(group.textContent).toContain('Both maps');
    expect(screen.queryByRole('button', { name: /Both maps/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Mode/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Agencies/ })).toBeTruthy();
  });
});
