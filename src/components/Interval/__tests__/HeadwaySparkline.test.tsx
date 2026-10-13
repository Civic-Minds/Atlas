import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadwaySparkline, sparklineBarHeight, slowerDirectionKey } from '../HeadwaySparkline';

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
          { key: 'southbound', label: 'Southbound', byHour: { 6: 30, 12: 20, 18: 25, 24: 45 } },
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
    expect(within(dialog).queryByRole('button', { name: 'All directions' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Southbound' })).toHaveClass('h-7', 'px-2.5');
    expect(within(dialog).getByRole('button', { name: 'Southbound' })).toHaveAttribute('aria-pressed', 'true');
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
    expect(within(dialog).getByTestId('sparkline-legend')).toHaveTextContent('≤60 min');
  });

  it('switches the full-day chart to the picked direction', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 20, 9: 15 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[
          { key: 'east', label: 'Eastbound', byHour: { 6: 20, 9: 15 } },
          { key: 'west', label: 'Westbound', byHour: { 6: 40, 9: 30 } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    const labels = () => within(dialog).getAllByTestId('sparkline-headway-label').map(el => el.textContent);
    // Opens on the slower direction.
    expect(within(dialog).getByRole('button', { name: 'Westbound' })).toHaveAttribute('aria-pressed', 'true');
    expect(labels()).toEqual(['40', '30']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eastbound' }));
    expect(within(dialog).getByRole('button', { name: 'Eastbound' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Westbound' })).toHaveAttribute('aria-pressed', 'false');
    expect(labels()).toEqual(['20', '15']);
  });

  it('shows no direction pills for a single-direction route', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 20 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[{ key: 'only', label: 'Northbound', byHour: { 6: 20 } }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    expect(within(screen.getByRole('dialog')).queryByRole('group', { name: 'Schedule direction' })).not.toBeInTheDocument();
  });

  it('names the inline series in hour tooltips', () => {
    const { container } = render(<HeadwaySparkline byHour={{ 6: 35 }} seriesLabel="slower direction" />);
    expect(container.querySelector('[title^="6:00a"]')?.getAttribute('title')).toBe('6:00a: every 35 min (slower direction)');
  });

  describe('slowerDirectionKey', () => {
    it('picks the direction with the longer typical headway', () => {
      expect(slowerDirectionKey([
        { key: 'east', byHour: { 7: 17, 8: 16, 9: 13, 10: 13, 11: 14 } },
        { key: 'west', byHour: { 7: 15, 8: 14, 9: 14, 10: 14, 11: 15, 23: 28 } },
      ])).toBe('west');
    });

    it('breaks a median tie on the longer average headway', () => {
      expect(slowerDirectionKey([
        { key: 'east', byHour: { 7: 14, 8: 14, 9: 14 } },
        { key: 'west', byHour: { 7: 14, 8: 14, 9: 14, 23: 28 } },
      ])).toBe('west');
    });

    it('keeps the first direction on a tie and skips directions with no hours', () => {
      expect(slowerDirectionKey([
        { key: 'a', byHour: { 7: 20 } },
        { key: 'b', byHour: { 7: 20 } },
      ])).toBe('a');
      expect(slowerDirectionKey([{ key: 'empty', byHour: {} }, { key: 'b', byHour: { 7: 10 } }])).toBe('b');
      expect(slowerDirectionKey(undefined)).toBeNull();
    });
  });
});
