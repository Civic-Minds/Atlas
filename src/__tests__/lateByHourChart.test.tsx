import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PeriodBand, { bandLabelFits } from '../components/charts/PeriodBand';
import HourSpark from '../components/charts/HourSpark';
import { LATE_SHARE_LIMITS, lateShareColor } from '../components/Live/lateShare';
import { liveChartHours, periodBandsFor } from '../utils/sparklinePeriods';

describe('lateShareColor', () => {
  it('steps from on time to a little late to late at the strip limits', () => {
    expect(lateShareColor(0)).toBe('var(--strip-delay-0)');
    expect(lateShareColor(LATE_SHARE_LIMITS[0] - 0.01)).toBe('var(--strip-delay-0)');
    expect(lateShareColor(LATE_SHARE_LIMITS[0])).toBe('var(--strip-delay-1)');
    expect(lateShareColor(LATE_SHARE_LIMITS[1] - 0.01)).toBe('var(--strip-delay-1)');
    expect(lateShareColor(LATE_SHARE_LIMITS[1])).toBe('var(--strip-delay-2)');
    expect(lateShareColor(0.9)).toBe('var(--strip-delay-2)');
  });
});

describe('PeriodBand', () => {
  const axis = liveChartHours(() => true);
  it('names a band only when its name fits', () => {
    expect(bandLabelFits('AM peak', 200)).toBe(true);
    expect(bandLabelFits('Evening', 20)).toBe(false);
  });
  it('covers every hour of the axis once, with no overlapping bands', () => {
    const spans = Object.values(periodBandsFor(axis)).flat().sort((a, b) => a.left - b.left);
    for (let i = 1; i < spans.length; i++) expect(spans[i].left).toBeGreaterThanOrEqual(spans[i - 1].left + spans[i - 1].width - 1e-9);
  });
  it('reports the hovered period and always names it', () => {
    const onHover = vi.fn();
    const { container, rerender } = render(<PeriodBand axis={axis} period={null} onHover={onHover} />);
    const mid = container.querySelector('[data-period="midday"]')!;
    fireEvent.pointerEnter(mid);
    expect(onHover).toHaveBeenCalledWith({ hour: null, period: 'midday' });
    rerender(<PeriodBand axis={axis} period="midday" onHover={onHover} />);
    expect(container.querySelector('[data-period="midday"]')!.textContent).toBe('Midday');
  });
});

describe('HourSpark rows', () => {
  const values = [8, 9, 10].map(hour => ({ hour, value: 0.2, n: 100 }));
  it('highlights the same hour in every chart that shares the hover', () => {
    const hover = { hour: 9, period: 'amPeak' };
    const { container } = render(<><HourSpark values={values} scale={{ min: 0, max: 0.3 }} color="red" format={x => `${x}`} ariaLabel="a" unit="departures" valueHeader="Late" hours={[8, 9, 10]} hover={hover} onHover={() => {}} /><HourSpark values={values} scale={{ min: 0, max: 0.3 }} color="red" format={x => `${x}`} ariaLabel="b" unit="departures" valueHeader="Late" hours={[8, 9, 10]} hover={hover} onHover={() => {}} /></>);
    const lit = [...container.querySelectorAll('[data-lit]')].map(e => e.getAttribute('data-hour'));
    expect(lit).toEqual(['9', '9']);
  });
});
