import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LineChart from '../LineChart';
import ScatterPlot from '../ScatterPlot';
import { FADED_OPACITY } from '../useActivePart';

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

describe('with a measured width the charts draw their marks', () => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  beforeEach(() => { HTMLElement.prototype.getBoundingClientRect = () => ({ width: 400, height: 200, top: 0, left: 0, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }); });
  afterEach(() => { HTMLElement.prototype.getBoundingClientRect = original; });

  it('scatter: a focused dot says what it is and fades the others', () => {
    render(<ScatterPlot label="Metros" xTitle="People" yTitle="Share" formatX={String} formatY={v => `${v}%`}
      points={[{ key: 'a', label: 'A', x: 1, y: 10, sentence: 'one' }, { key: 'b', label: 'B', x: 2, y: 20, sentence: 'two' }]} />);
    const dot = screen.getByRole('img', { name: 'A: one' });
    fireEvent.focus(dot);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'B: two' })).toHaveAttribute('opacity', String(FADED_OPACITY));
    expect(dot).toHaveAttribute('opacity', '1');
  });

  it('line: a gap breaks the line into two paths', () => {
    const { container } = render(<LineChart label="L" yTitle="Min" formatY={String} points={[
      { x: 1, y: 5, label: '2018', sentence: 'a' }, { x: 2, y: 6, label: '2019', sentence: 'b' }, null,
      { x: 4, y: 7, label: '2021', sentence: 'c' }, { x: 5, y: 8, label: '2022', sentence: 'd' },
    ]} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
