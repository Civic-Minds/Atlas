import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { FilterChips, type ConnectionsBarControls } from '../FilterChips';

const props = {
  maxHeadway: Infinity, setMaxHeadway: () => {}, selectedModes: new Set<number>(), setSelectedModes: () => {},
  day: 'Weekday' as const, setDay: () => {}, period: 'midday' as const, setPeriod: () => {},
  agencies: [], selectedAgencies: new Set<string>(), setSelectedAgencies: () => {}, bounds: null,
};
const bar = (over: Partial<ConnectionsBarControls> = {}): ConnectionsBarControls => ({
  wait: 15, setWait: () => {}, distance: 400, setDistance: () => {}, distances: [200, 400, 600],
  side: 'after', setSide: () => {},
  trips: [['Colorado Springs Downtown Station to Denver', [{ id: 'a', label: '5 AM' }, { id: 'b', label: '5:55 AM' }]]],
  tripId: 'b', setTripId: () => {}, ...over,
});

describe('connections top bar (CIV-1353)', () => {
  it('shows Day, the wait, the walk, the side and the picked departure in place of the filters', () => {
    const { container } = render(<FilterChips {...props} connectionsBar={bar()} />);
    const labels = within(container).getAllByRole('button').map(b => b.textContent?.trim());
    expect(labels).toEqual(['Day', '15 min', '30 min', '60 min', '200 m', '400 m', '600 m', 'Arriving', 'Leaving', '5:55 AM']);
    expect(within(container).queryByText('Frequency')).toBeNull();
  });

  it('picks a departure from the dropdown', () => {
    const setTripId = vi.fn();
    const { container } = render(<FilterChips {...props} connectionsBar={bar({ setTripId })} />);
    fireEvent.click(within(container).getByText('5:55 AM'));
    expect(within(container).getByText('Colorado Springs Downtown Station to Denver')).toBeTruthy();
    fireEvent.click(within(container).getByText('5 AM'));
    expect(setTripId).toHaveBeenCalledWith('a');
  });

  it('has no departure dropdown until a route with connection data is picked', () => {
    const { container } = render(<FilterChips {...props} connectionsBar={bar({ trips: [], tripId: null })} />);
    expect(within(container).getAllByRole('button').map(b => b.textContent?.trim()).at(-1)).toBe('Leaving');
  });
});
