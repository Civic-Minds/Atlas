import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DotPairs, { DotPairKey } from '../DotPairs';
import { FADED_OPACITY, useActivePart } from '../useActivePart';

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

describe('DotPairs groups (CIV-1577)', () => {
  it('draws a titled group under the first, in order, and skips an empty one', () => {
    const pair = (key: string, first: number) => ({ key, label: key, first, second: 0.5, sentence: key });
    render(<DotPairs label="Coverage" firstHeader="15 min" secondHeader="30 min" groups={[
      { key: 'rest', pairs: [pair('Toronto', 0.4)] },
      { key: 'none', title: 'None at 15', pairs: [pair('Oshawa', 0)] },
      { key: 'empty', title: 'Empty', pairs: [] },
    ]} />);
    expect(screen.getByRole('heading', { name: 'None at 15' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Empty' })).toBeNull();
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Toronto', 'Oshawa']);
  });
});

describe('DotPairKey picks a series (CIV-1577, VISUAL.md legends)', () => {
  function Harness() {
    const series = useActivePart();
    return <>
      <DotPairKey first="15 min" second="30 min" series={series} />
      <DotPairs label="Coverage" firstHeader="15 min" secondHeader="30 min" series={series} groups={groups} />
    </>;
  }

  it('focusing a key item highlights it, fades the other series and announces it', () => {
    render(<Harness />);
    const item = screen.getByRole('listitem', { name: '15 min' });
    fireEvent.focus(item);
    expect(item).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('61%').style.opacity).toBe(String(FADED_OPACITY));
    expect(screen.getByText('26%').style.opacity).toBe('');
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('15 min');
    fireEvent.blur(item);
    expect(screen.getByText('61%').style.opacity).toBe('');
  });
});
