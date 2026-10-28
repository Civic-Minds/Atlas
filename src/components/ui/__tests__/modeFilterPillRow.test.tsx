import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModeFilterPillRow from '../ModeFilterPillRow';

const FILTERS = [
  { key: 'mode:1', label: 'Subway', count: 4 },
  { key: 'mode:3', label: 'Bus', count: 12 },
];

describe('ModeFilterPillRow', () => {
  it('picks a mode, and clears it when the selected pill is picked again', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ModeFilterPillRow filters={FILTERS} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Bus/ }));
    expect(onSelect).toHaveBeenLastCalledWith('mode:3');

    rerender(<ModeFilterPillRow filters={FILTERS} selected="mode:3" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Bus/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: /Subway/ }));
    expect(onSelect).toHaveBeenLastCalledWith('mode:1');
  });

  it('shows each count and puts extra pills after the mode pills', () => {
    render(
      <ModeFilterPillRow filters={FILTERS} selected={null} onSelect={() => {}}>
        <button type="button">Extra</button>
      </ModeFilterPillRow>,
    );
    const names = screen.getAllByRole('button').map(b => b.textContent);
    expect(names).toEqual(['Subway 4', 'Bus 12', 'Extra']);
  });
});
