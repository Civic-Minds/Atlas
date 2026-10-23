import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadwaySparkline, sparklineBarHeight, slowerDirectionKey } from '../HeadwaySparkline';
import { SPARKLINE_HOURS } from '../../../../shared/config';

describe('HeadwaySparkline', () => {
  it('every hour with trips keeps its colour outside the selected period, faded; none goes grey (CIV-497)', () => {
    const { container } = render(
      <HeadwaySparkline byHour={{ 7: 10, 12: 20, 20: 30 }} period="midday" onPeriodChange={() => {}} />,
    );
    const bars = [...container.querySelectorAll('.rounded-full')].filter(el => (el as HTMLElement).style.background && (el as HTMLElement).style.height);
    expect(bars).toHaveLength(3);
    for (const bar of bars) expect((bar as HTMLElement).style.background).not.toContain('--border-primary');
    const faded = bars.filter(bar => bar.className.includes('opacity-40'));
    expect(faded).toHaveLength(2);
  });

  it('starts the hover highlight below the period label row, so the label sits above it', () => {
    const { container } = render(
      <HeadwaySparkline byHour={{ 12: 20, 18: 25 }} period="midday" onPeriodChange={() => {}} allowExpand />,
    );
    const area = container.querySelector('.cursor-pointer') as HTMLElement;
    area.getBoundingClientRect = () => ({ left: 0, width: 240, top: 0, height: 48, right: 240, bottom: 48, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(area, { clientX: 120 });
    const bands = screen.getAllByTestId('sparkline-hover-band');
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      expect(band).toHaveClass('top-5');
      expect(band).not.toHaveClass('inset-y-0');
    }
  });

  it('draws every full-day period band and the hover band over the same plot height, with no second period label', () => {
    const { container } = render(
      <HeadwaySparkline byHour={{ 6: 30, 12: 20, 18: 25, 21: 20, 24: 45 }} period="all" onPeriodChange={() => {}} expanded />,
    );
    const area = container.querySelector('.cursor-pointer') as HTMLElement;
    const staticBands = Array.from(area.querySelectorAll(':scope > div.opacity-40'));
    expect(staticBands).toHaveLength(6);
    for (const band of staticBands) expect(band).toHaveClass('top-12', 'bottom-0');
    area.getBoundingClientRect = () => ({ left: 0, width: 240, top: 0, height: 48, right: 240, bottom: 48, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(area, { clientX: 120 });
    for (const band of screen.getAllByTestId('sparkline-hover-band')) expect(band).toHaveClass('top-12', 'bottom-0');
    expect(area.querySelectorAll(':scope > span')).toHaveLength(0);
  });

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
    expect(within(dialog).queryByText(/Hover over an hour/)).toBeNull();
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

  it('prints no numbers on the bars in the full-day view', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 35, 9: 23, 14: 40 }}
        onPeriodChange={() => {}}
        allowExpand
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryAllByTestId('sparkline-headway-label')).toHaveLength(0);
    // No floating browser tooltips in the full-day view; the fixed readout under the charts replaces them.
    expect(dialog.querySelectorAll('[title]:not([aria-label])')).toHaveLength(0);
    expect(within(dialog).queryByTestId('sparkline-legend')).toBeNull();
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
    const labels = () => {
      const chart = dialog.querySelector('.relative.z-10.flex')!.parentElement!;
      chart.getBoundingClientRect = () => ({ left: 0, width: 240, top: 0, height: 100, right: 240, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
      return [6, 9].map(hour => {
        fireEvent.mouseMove(chart, { clientX: ((SPARKLINE_HOURS.indexOf(hour) + 0.5) / SPARKLINE_HOURS.length) * 240 });
        return dialog.querySelector('[aria-live="polite"]')!.textContent;
      });
    };
    // Opens on the slower direction.
    expect(within(dialog).getByRole('button', { name: 'Westbound' })).toHaveAttribute('aria-pressed', 'true');
    expect(labels()).toEqual([expect.stringContaining('every 40 min'), expect.stringContaining('every 30 min')]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eastbound' }));
    expect(within(dialog).getByRole('button', { name: 'Eastbound' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Westbound' })).toHaveAttribute('aria-pressed', 'false');
    expect(labels()).toEqual([expect.stringContaining('every 20 min'), expect.stringContaining('every 15 min')]);
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

  it('shows the trip time line and per-hour hover under the full-day chart, and hides it without data', () => {
    render(
      <HeadwaySparkline
        byHour={{ 7: 30, 12: 20, 17: 25 }}
        onPeriodChange={() => {}}
        allowExpand
        title="Route 14"
        directionOptions={[
          { key: 'east', label: 'Eastbound', byHour: { 7: 30, 12: 20, 17: 25, 21: 30 }, tripTime: { byHour: { 7: 38, 12: 41, 17: 52 } } },
          { key: 'west', label: 'Westbound', byHour: { 7: 40, 12: 30, 17: 35 }, tripTime: null },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    // Opens on the slower direction, which has no trip time data.
    expect(within(dialog).queryByTestId('trip-time-strip')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eastbound' }));
    expect(within(dialog).getByText('Trip time')).toBeInTheDocument();
    // CIV-510: the strip sits directly under the frequency chart, the same height, with one row of
    // clock labels under both (none between the charts).
    const tripStrip = within(dialog).getByTestId('trip-time-strip');
    const chartColumn = dialog.querySelector<HTMLElement>('.relative.z-10.flex > div > div')!;
    expect((tripStrip.children[1].children[0] as HTMLElement).style.height).toBe(chartColumn.style.height);
    expect(chartColumn.style.height).toBe('150px');
    const clock = within(dialog).getByText('6:00a');
    expect(tripStrip.compareDocumentPosition(clock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getAllByText('6:00a')).toHaveLength(1);
    const bars = within(dialog).getAllByTestId('trip-time-bar');
    expect(bars).toHaveLength(3);
    // 9 p.m. has trips but no trip time: a faint tick, not a gap that reads as no service.
    expect(within(dialog).getAllByTestId('trip-time-missing')).toHaveLength(1);
    // The hour with the longest trip time (5 p.m.) is the darker bar; the others are lighter.
    expect(bars.map(bar => bar.className.includes('opacity-100'))).toEqual([false, false, true]);
    // Neither chart carries a native title tooltip in the full-day view.
    expect(dialog.querySelectorAll('[title]:not([aria-label])')).toHaveLength(0);
    const slowestColumn = within(dialog).getAllByTestId('trip-time-bar')[2].parentElement!;
    // The strip sits on the chart's own hour columns: one column per chart hour, same row layout.
    const strip = within(dialog).getByTestId('trip-time-strip');
    expect(strip.children[1].children).toHaveLength(dialog.querySelector('.relative.z-10.flex')!.children.length);
    // Hovering a strip bar reports that hour's trip time in the chart's hover line.
    fireEvent.mouseEnter(slowestColumn);
    // One readout under both charts: the hour's frequency line, then its trip time line.
    const readout = dialog.querySelector('[aria-live="polite"]')!;
    expect(Array.from(readout.children).map(line => line.textContent)).toEqual(['5:00p: every 25 min', '5:00p: about 52 min']);
    fireEvent.mouseLeave(strip.children[1]);
    expect(dialog.querySelector('[aria-live="polite"]')!.textContent).toBe('');
    // Hovering an hour in the frequency chart lights the matching trip-time bar a step darker (CIV-505).
    const chart = dialog.querySelector('.relative.z-10.flex')!.parentElement!;
    chart.getBoundingClientRect = () => ({ left: 0, width: 240, top: 0, height: 100, right: 240, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const xFor = (hour: number) => ((SPARKLINE_HOURS.indexOf(hour) + 0.5) / SPARKLINE_HOURS.length) * 240;
    fireEvent.mouseMove(chart, { clientX: xFor(7) });
    expect(bars[0].className).toContain('opacity-75');
    expect(bars[1].className).toContain('opacity-50');
    fireEvent.mouseLeave(chart);
    expect(bars[0].className).toContain('opacity-50');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Westbound' }));
    expect(within(dialog).queryByTestId('trip-time-strip')).not.toBeInTheDocument();
  });
});

describe('HeadwaySparkline branch pieces with one name (CIV-512)', () => {
  it('two branches sharing a name keep two pieces through re-renders, never piling up', () => {
    const twin = (faded?: boolean) => ({ 8: [
      { label: 'Donlands via Laird', headway: 30, color: '#00f', faded },
      { label: 'Donlands via Laird', headway: 30, color: '#f0f' },
    ] });
    const { container, rerender } = render(<HeadwaySparkline byHour={{ 8: 15 }} stackedByHour={twin()} />);
    const pieces = () => container.querySelectorAll('.relative.z-10.flex .rounded-full > div').length;
    expect(pieces()).toBe(2);
    // Like hovering TTC 51's Northbound rows and leaving: another direction's two branches, then back.
    const other = { 8: [
      { label: 'Leslie Station via Laird', headway: 30, color: '#00f' },
      { label: 'Don Mills via Laird', headway: 30, color: '#f0f', faded: true },
    ] };
    for (let i = 0; i < 5; i++) {
      rerender(<HeadwaySparkline byHour={{ 8: 15 }} stackedByHour={other} />);
      rerender(<HeadwaySparkline byHour={{ 8: 15 }} stackedByHour={twin()} />);
    }
    expect(pieces()).toBe(2);
  });
});

describe('HeadwaySparkline fixed scale (CIV-512)', () => {
  it('draws every full-day direction pill on the route\'s one y axis, not each on its own', () => {
    render(
      <HeadwaySparkline
        byHour={{ 7: 10, 8: 10 }}
        onPeriodChange={() => {}}
        allowExpand
        scaleMaxFreq={1 / 5}
        directionOptions={[
          { key: 'east', label: 'Eastbound', byHour: { 7: 10, 8: 10 } },
          { key: 'west', label: 'Westbound', byHour: { 7: 5, 8: 5 } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    const tallest = () => Math.max(...[...dialog.querySelectorAll<HTMLElement>('.relative.z-10.flex .rounded-full')].map(el => parseFloat(el.style.height) || 0));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eastbound' }));
    expect(tallest()).toBe(75); // every 10 on an every-5 axis: half of 150
    fireEvent.click(within(dialog).getByRole('button', { name: 'Westbound' }));
    expect(tallest()).toBe(150);
  });
});

describe('HeadwaySparkline full-day link', () => {
  const directions = [
    { key: 'southbound', label: 'Southbound', byHour: { 6: 30, 12: 20, 18: 25, 24: 45 } },
    { key: 'northbound', label: 'Northbound', byHour: { 6: 15, 12: 10, 18: 12, 24: 20 } },
  ];
  const renderChart = () => render(
    <HeadwaySparkline byHour={{ 6: 30, 12: 20, 18: 25, 24: 45 }} onPeriodChange={() => {}} allowExpand title="Route 14" directionOptions={directions} />,
  );

  it('opens on the linked direction and writes changes back', () => {
    window.history.replaceState(null, '', '/?route=ttc%3A%3A14&fullday=1&fdir=northbound');
    const { unmount } = renderChart();
    const dialog = screen.getByRole('dialog', { name: 'Route 14 full-day schedule' });
    expect(within(dialog).getByRole('button', { name: 'Northbound' })).toHaveAttribute('aria-pressed', 'true');

    // Southbound is the slower direction, so picking it leaves the direction out of the URL.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Southbound' }));
    expect(window.location.search).toBe('?route=ttc%3A%3A14&fullday=1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close schedule' }));
    expect(window.location.search).toBe('?route=ttc%3A%3A14');

    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    expect(window.location.search).toBe('?route=ttc%3A%3A14&fullday=1');
    unmount();
    expect(window.location.search).toBe('?route=ttc%3A%3A14');
    window.history.replaceState(null, '', '/');
  });
});
