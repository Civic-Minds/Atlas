import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FilterChips } from '../FilterChips';
import { PERIOD_LABELS } from '../../../../shared/config';

const flags = vi.hoisted(() => ({ historyDayPicker: false }));
vi.mock('../../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, get historyDayPicker() { return flags.historyDayPicker; } } };
});
afterEach(() => { flags.historyDayPicker = false; });

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

describe("History's Day chip (CIV-1425)", () => {
  const chipNames = (container: HTMLElement) => within(container).getAllByRole('button').map(b => b.textContent?.trim());

  it('is not shown while the day picker flag is off', () => {
    const { container } = render(<FilterChips {...props} variant="history" />);
    expect(chipNames(container)).not.toContain('Day');
  });

  it('is shown with the flag on, and picks Saturday', () => {
    flags.historyDayPicker = true;
    const setDay = vi.fn();
    const { container } = render(<FilterChips {...props} setDay={setDay} variant="history" />);
    fireEvent.click(within(container).getAllByRole('button').find(b => b.textContent?.trim() === 'Day')!);
    fireEvent.click(within(container).getByRole('button', { name: 'Saturday' }));
    expect(setDay).toHaveBeenCalledWith('Saturday');
  });
});
