import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FilterChips } from '../FilterChips';
import { PERIOD_LABELS } from '../../../../shared/config';

const props = {
  maxHeadway: Infinity,
  setMaxHeadway: () => {},
  selectedModes: new Set<number>(),
  setSelectedModes: () => {},
  day: 'Weekday' as const,
  setDay: () => {},
  period: 'midday' as const,
  setPeriod: () => {},
  agencies: [],
  selectedAgencies: new Set<string>(),
  setSelectedAgencies: () => {},
  bounds: null,
};

describe("History's Time menu (CIV-1097)", () => {
  it('lists the same periods as the map, with no All day', () => {
    const menuRows = (variant: 'full' | 'history') => {
      const { container, unmount } = render(<FilterChips {...props} variant={variant} />);
      fireEvent.click(within(container).getAllByRole('button').find(b => b.textContent?.trim() === 'Time')!);
      const rows = within(container).getAllByRole('button').filter(b => b.hasAttribute('aria-pressed'))
        .map(b => b.textContent ?? '').filter(t => Object.values(PERIOD_LABELS).some(l => t.startsWith(l)));
      unmount();
      return rows;
    };
    const history = menuRows('history');
    expect(history).toEqual(menuRows('full'));
    expect(history.join(' ')).not.toContain('All day');
    expect(history).toHaveLength(6);
    expect(screen.queryByText('All day')).toBeNull();
  });
});
