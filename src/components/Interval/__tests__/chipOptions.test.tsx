import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChipOptions } from '../ChipMenu';
import { chipRowClass } from '../../ui/Pill';

// CIV-2003: the main map's Frequency, Day and Time chips moved onto ChipOptions; their rows must stay exactly as they were
// (the shared row class, the current one pressed, the spoken name), so the main map looks and reads the same.
describe('ChipOptions', () => {
  it('draws each choice as the rows the main map\'s chips had', () => {
    const onPick = vi.fn();
    const { container } = render(<div><ChipOptions value="Saturday" onPick={onPick} options={[{ key: 'Weekday', label: 'Weekday' }, { key: 'Saturday', label: 'Saturday', ariaLabel: 'Sat' }]} /></div>);
    const rows = [...container.querySelectorAll('div > button')];
    expect(rows.map(b => [b.className, b.getAttribute('aria-pressed'), b.getAttribute('aria-label'), b.textContent])).toEqual([
      [chipRowClass(false), 'false', null, 'Weekday'],
      [chipRowClass(true), 'true', 'Sat', 'Saturday'],
    ]);
    fireEvent.click(rows[0]);
    expect(onPick).toHaveBeenCalledWith('Weekday');
  });
  it('finds rows by their plain text with the search box', () => {
    render(<ChipOptions value="" onPick={() => {}} search={{ placeholder: 'Find a route', text: o => o.ariaLabel ?? o.key }}
      options={[{ key: '504', label: <b>504</b>, ariaLabel: '504 King' }, { key: '510', label: <b>510</b>, ariaLabel: '510 Spadina' }]} />);
    fireEvent.change(screen.getByPlaceholderText('Find a route'), { target: { value: 'spad' } });
    expect(screen.getAllByRole('button', { pressed: false }).map(b => b.getAttribute('aria-label'))).toEqual(['510 Spadina']);
  });
});
