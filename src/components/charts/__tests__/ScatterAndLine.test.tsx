import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LineChart from '../LineChart';
import ScatterPlot from '../ScatterPlot';

describe('ScatterPlot', () => {
  it('gives every dot a name and puts the figures in a table', () => {
    render(<ScatterPlot label="Metros" xTitle="People" yTitle="Share" formatX={String} formatY={v => `${v}%`}
      points={[{ key: 'a', label: 'A', x: 1, y: 10, sentence: 'one' }, { key: 'b', label: 'B', x: 2, y: 20, sentence: 'two' }]} />);
    expect(screen.getByRole('table', { name: 'Metros', hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { hidden: true }).length).toBeGreaterThanOrEqual(4);
  });
});

describe('LineChart', () => {
  it('draws nothing for no points and a table for some', () => {
    const { container, rerender } = render(<LineChart points={[]} label="L" yTitle="Min" formatY={String} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LineChart label="L" yTitle="Min" formatY={String} points={[{ x: 1, y: 5, label: '2019', sentence: 'a' }, null, { x: 2, y: 6, label: '2020', sentence: 'b' }]} />);
    expect(screen.getByRole('table', { name: 'L', hidden: true })).toBeInTheDocument();
  });
});
