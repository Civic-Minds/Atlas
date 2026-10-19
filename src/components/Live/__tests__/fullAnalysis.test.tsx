import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import ProfileBars from '../../charts/ProfileBars';
import { mergePeriodRows } from '../sections/PerPeriod';
import ExtraWaitSection from '../sections/ExtraWaitSection';

describe('Full analysis, shorter', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  it('merges identical time-of-day answers into one row, and only merges', () => {
    const rows = [
      { key: 'amPeak', label: 'AM peak', text: 'stays about level' }, { key: 'midday', label: 'Midday', text: 'stays about level' },
      { key: 'pmPeak', label: 'PM peak', text: 'builds slowly, no single stretch' }, { key: 'evening', label: 'Evening', text: 'stays about level' },
    ];
    expect(mergePeriodRows(rows).map(r => [r.label, r.text])).toEqual([['AM peak, Midday, Evening', 'stays about level'], ['PM peak', 'builds slowly, no single stretch']]);
    expect(mergePeriodRows([rows[0]])).toEqual([rows[0]]);
  });
  it('labels the tallest bar with a number only, and says the faded-bar rule only when asked', () => {
    const points = [{ label: 'A', y: 0.5, n: 100 }, { label: 'B', y: 1.4, n: 100 }, { label: 'C', y: 2.2, n: 5 }];
    const { container, rerender } = render(<ProfileBars points={points} ariaLabel="x" formatY={y => `${y} min`} unit="gaps" valueHeader="Extra wait" peakLabel fadedNote={false} />);
    const peak = container.querySelector('[data-peak]');
    expect(peak?.textContent).toBe('1.4 min'); // the 5-gap bar is not the peak
    expect(screen.queryByText(/Paler bars/)).toBeNull();
    rerender(<ProfileBars points={points} ariaLabel="x" formatY={y => `${y} min`} unit="gaps" valueHeader="Extra wait" caption="Says it." />);
    expect(screen.getByText(/Says it\. Paler bars rest on fewer than 30 gaps\./)).toBeTruthy();
  });
  it('lists the five longest waits on Full analysis and ten on Explore', () => {
    const stops = Array.from({ length: 12 }, (_, i) => ({ directionId: 0, stopId: `s${i}`, name: `Stop ${i}`, order: i, scheduledGapMin: 5, extraWaitMin: 3 - i * 0.1, gaps: 100 }));
    const v3 = { directionLabels: { '0': 'Westbound' }, extraWait: { all: stops }, bands: { all: { stops: [] } } } as unknown as LiveV3;
    const rowsOf = (c: HTMLElement) => within(c).getByRole('table', { name: /Stops where riders wait longest/ }).querySelectorAll('tbody tr').length;
    const full = render(<ExtraWaitSection v3={v3} band="all" dir={0} detail="full" />);
    expect(rowsOf(full.container)).toBe(5);
    full.unmount();
    const compact = render(<ExtraWaitSection v3={v3} band="all" dir={0} detail="compact" />);
    expect(rowsOf(compact.container)).toBe(10);
  });
});
