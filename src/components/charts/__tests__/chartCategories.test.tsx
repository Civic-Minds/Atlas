import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CategorySpark from '../CategorySpark';
import RankedBars from '../RankedBars';
import SplitBar from '../SplitBar';
import { withCount } from '../chartCategories';

// Ryan, 2026-11-02: the research charts show only categories with a count, unless a chart says why it keeps the empty ones.
const parts = [10, 0, 5].map((value, i) => ({ key: i, label: `P${i}`, value, fill: 'grey', sentence: `Part ${i}: ${value}` }));

describe('research charts drop empty categories by default', () => {
  it('withCount drops zeros, and keeps them only when asked', () => {
    expect(withCount(parts).map(p => p.key)).toEqual([0, 2]);
    expect(withCount(parts, true).map(p => p.key)).toEqual([0, 1, 2]);
  });

  it('RankedBars draws no empty bar, unless keepEmpty', () => {
    const { unmount } = render(<RankedBars bars={parts} max={10} label="Bars" />);
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Part 0: 10', 'Part 2: 5']);
    unmount();
    render(<RankedBars bars={parts} max={10} label="Bars" keepEmpty />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('CategorySpark drops an empty column, unless keepEmpty keeps its place on the axis', () => {
    const { unmount } = render(<CategorySpark columns={parts} label="Columns" ticks={[0, 10]} />);
    expect(screen.queryByText('P1')).toBeNull();
    unmount();
    render(<CategorySpark columns={parts} label="Columns" ticks={[0, 10]} keepEmpty />);
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  it('SplitBar draws no empty part or legend item', () => {
    render(<SplitBar label="Split" segments={parts.map(p => ({ ...p, legend: p.label }))} />);
    expect(screen.queryByText('P1')).toBeNull();
    expect(screen.getByText('P2')).toBeInTheDocument();
  });
});
