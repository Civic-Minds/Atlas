import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadwaySparkline, sparklineBarHeight } from '../HeadwaySparkline';

describe('HeadwaySparkline', () => {
  it('keeps the active period label clear of the expand control', () => {
    render(
      <HeadwaySparkline
        byHour={{ 12: 20, 18: 25 }}
        period="midday"
        onPeriodChange={() => {}}
        allowExpand
      />,
    );

    expect(screen.getByText('Midday')).toHaveClass('right-7');
  });

  it('opens the beta full-day schedule view with all periods', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 30, 12: 20, 18: 25, 24: 45 }}
        period="midday"
        onPeriodChange={() => {}}
        allowExpand
        title="Route 14 — Lakeshore"
        directionOptions={[
          { key: 'all', label: 'All directions', byHour: { 6: 30, 12: 20, 18: 25, 24: 45 } },
          { key: 'northbound', label: 'Northbound', byHour: { 6: 30, 12: 20, 18: 25, 24: 45 } },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));

    const dialog = screen.getByRole('dialog', { name: 'Route 14 — Lakeshore full-day schedule' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('AM Peak')).toBeInTheDocument();
    expect(within(dialog).getByText('Midday')).toBeInTheDocument();
    expect(within(dialog).getByText('Overnight')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'All directions' })).toHaveClass('h-7', 'px-2.5');
    expect(within(dialog).getByRole('button', { name: 'All directions' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Northbound' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByText('Hover over an hour to inspect its scheduled headway window.')).toBeInTheDocument();
  });

  it('closes the full-day schedule view', () => {
    render(
      <HeadwaySparkline
        byHour={{ 12: 20, 18: 25 }}
        onPeriodChange={() => {}}
        allowExpand
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close schedule' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('sparklineBarHeight', () => {
    const H = 150;
    const maxFreq = 1 / 23;

    it('draws a 35-minute hour proportionally, not as a stub, beside a 23-minute peak', () => {
      expect(sparklineBarHeight(23, maxFreq, H)).toBe(150);
      expect(sparklineBarHeight(35, maxFreq, H)).toBe(Math.round(150 * 23 / 35));
      expect(sparklineBarHeight(35, maxFreq, H)).toBeGreaterThan(90);
    });

    it('is monotonic: more frequent hours are never shorter', () => {
      const headways = [5, 8, 10, 12, 15, 20, 23, 30, 35, 45, 60, 90, 120];
      const freq = 1 / 5;
      const heights = headways.map(h => sparklineBarHeight(h, freq, H));
      for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThanOrEqual(heights[i - 1]);
      expect(heights[0]).toBe(H);
    });

    it('keeps any hour with service visible and draws nothing without service', () => {
      expect(sparklineBarHeight(240, 1 / 5, 28)).toBeGreaterThan(0);
      expect(sparklineBarHeight(null, 1 / 5, 28)).toBe(0);
      expect(sparklineBarHeight(undefined, 1 / 5, 28)).toBe(0);
    });

    it('draws every bar full height when all hours share one headway', () => {
      expect(sparklineBarHeight(20, 1 / 20, 28)).toBe(28);
    });
  });

  it('labels each hour with its headway and explains colour in the full-day view', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 35, 9: 23, 14: 40 }}
        onPeriodChange={() => {}}
        allowExpand
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    const labels = within(dialog).getAllByTestId('sparkline-headway-label').map(el => el.textContent);
    expect(labels).toEqual(['35', '23', '40']);
    expect(within(dialog).getByTestId('sparkline-legend')).toHaveTextContent('minutes between trips');
    expect(within(dialog).getByTestId('sparkline-legend')).toHaveTextContent('≤60m');
  });

  it('switches the full-day chart to the picked direction', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 20, 9: 15 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[
          { key: 'all', label: 'All directions', byHour: { 6: 20, 9: 15 } },
          { key: 'west', label: 'Westbound', byHour: { 6: 40, 9: 30 } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    const labels = () => within(dialog).getAllByTestId('sparkline-headway-label').map(el => el.textContent);
    expect(labels()).toEqual(['20', '15']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Westbound' }));
    expect(within(dialog).getByRole('button', { name: 'Westbound' })).toHaveAttribute('aria-pressed', 'true');
    expect(labels()).toEqual(['40', '30']);
  });
});
