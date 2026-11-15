import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DotPairs from '../DotPairs';

const groups = [{ key: 'ca', pairs: [
  { key: 'national', label: 'Canada', first: 0.2627, second: 0.6053, sentence: 'Canada: 26%, 61%', reference: true },
  { key: 'oshawa', label: 'Oshawa', first: 0, second: 0.6324, sentence: 'Oshawa: 0%, 63%' },
] }];

describe('DotPairs (CIV-1577)', () => {
  it('draws one named button per row, with both shares as percents', () => {
    render(<DotPairs groups={groups} label="Coverage" details="t1 t2" firstHeader="15 min" secondHeader="30 min" />);
    expect(screen.getByRole('group', { name: 'Coverage' })).toHaveAttribute('aria-details', 't1 t2');
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Canada: 26%, 61%', 'Oshawa: 0%, 63%']);
    // A 0% share still gets its row and its dot at the left edge: that is the point of the chart.
    const oshawa = screen.getByRole('button', { name: 'Oshawa: 0%, 63%' });
    expect(oshawa).toHaveTextContent('0%');
    expect(oshawa).toHaveTextContent('63%');
  });

  it('focusing a row highlights its name, like the other charts', () => {
    render(<DotPairs groups={groups} label="Coverage" firstHeader="15 min" secondHeader="30 min" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Oshawa: 0%, 63%' }));
    expect(screen.getByText('Oshawa')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Canada')).not.toHaveAttribute('data-active');
  });
});
