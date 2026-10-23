import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadwaySparkline, sparklineBarHeight, slowerDirectionKey, headwayAxisTicks } from '../HeadwaySparkline';
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
    // The frequency column is half the dialog wide, so the peaks use the short form.
    expect(within(dialog).getByText('AM')).toBeInTheDocument();
    expect(within(dialog).getByText('Midday')).toBeInTheDocument();
    expect(within(dialog).getByText('Overnight')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'All directions' })).not.toBeInTheDocument();
    // Two directions show at once, so there is no toggle; each is named above its charts.
    expect(within(dialog).queryByRole('group', { name: 'Schedule direction' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Southbound')).toBeInTheDocument();
    expect(within(dialog).getByText('Northbound')).toBeInTheDocument();
    expect(within(dialog).getAllByTestId('full-day-direction')).toHaveLength(2);
    // The period names show once, above the first direction.
    expect(within(dialog).getAllByText('Midday')).toHaveLength(1);
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

  it('switches the full-day chart to the picked direction when there are more than two', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 20, 9: 15 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[
          { key: 'east', label: 'Eastbound', byHour: { 6: 20, 9: 15 } },
          { key: 'west', label: 'Westbound', byHour: { 6: 40, 9: 30 } },
          { key: 'loop', label: 'Loop', byHour: { 6: 25, 9: 25 } },
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

  it('shows both directions at once: 2x2 grid, one shared hour, a screen-reader-only readout (CIV-704)', () => {
    render(
      <HeadwaySparkline
        byHour={{ 7: 30, 12: 20, 17: 25 }}
        onPeriodChange={() => {}}
        allowExpand
        title="Route 14"
        directionOptions={[
          { key: 'east', label: 'Eastbound', byHour: { 7: 30, 12: 20, 17: 25, 21: 30 }, tripTime: { byHour: { 7: 38, 12: 41, 17: 52 } } },
          { key: 'west', label: 'Westbound', byHour: { 7: 40, 12: 30, 17: 35 }, tripTime: { byHour: { 7: 36, 17: 50 } } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    // No toggle: both directions, each with a frequency chart and a trip time chart.
    expect(within(dialog).queryByRole('group', { name: 'Schedule direction' })).not.toBeInTheDocument();
    const blocks = within(dialog).getAllByTestId('full-day-direction');
    expect(blocks).toHaveLength(2);
    const strips = within(dialog).getAllByTestId('trip-time-strip');
    expect(strips).toHaveLength(2);
    // The column is named once (desktop); each strip keeps its own label for the stacked phone layout, hidden from sm up.
    expect(within(dialog).getAllByText('Trip time')).toHaveLength(3);
    // 2x2: frequency charts in the left column, trip time in the right, a direction heading once per row, Westbound over Eastbound.
    const grid = within(dialog).getByTestId('full-day-grid');
    expect(grid).toHaveClass('sm:grid-cols-2');
    expect(within(grid).getAllByText(/^(Eastbound|Westbound)$/)).toHaveLength(2);
    for (const block of blocks) {
      expect(block.className).toContain('contents');
      expect(block.children[0]).toHaveClass('sm:col-span-2');
      expect(block.children[1].querySelector('.relative.z-10.flex')).not.toBeNull();
      expect(block.children[2].querySelector('[data-testid="trip-time-strip"]')).not.toBeNull();
    }
    // Every one of the four charts has its own clock row directly under it.
    expect(within(dialog).getAllByTestId('full-day-clock-labels')).toHaveLength(4);
    for (const block of blocks) {
      expect(block.children[1].lastElementChild).toHaveAttribute('data-testid', 'full-day-clock-labels');
      expect(block.children[2].lastElementChild).toHaveAttribute('data-testid', 'full-day-clock-labels');
    }
    // Four charts at the paired height (96px on desktop).
    const columns = dialog.querySelectorAll<HTMLElement>('.relative.z-10.flex > div > div');
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) expect(column.style.height).toBe('96px');
    for (const strip of strips) expect((strip.querySelector('[data-testid="trip-time-bar"]')!.parentElement as HTMLElement).style.height).toBe('96px');
    // Eastbound 9 p.m. and Westbound noon have trips but no trip time: a faint tick, not a gap that reads as no service.
    expect(within(dialog).getAllByTestId('trip-time-missing')).toHaveLength(2);
    // No native title tooltips in the full-day view.
    expect(dialog.querySelectorAll('[title]:not([aria-label])')).toHaveLength(0);

    const readout = within(dialog).getByTestId('full-day-readout');
    // The readout is screen-reader text only: nothing visible, no space reserved.
    expect(readout).toHaveClass('sr-only');
    expect(readout.className).not.toMatch(/min-h|mt-/);
    expect(readout.textContent).toBe('');
    // Hovering a trip-time bar reports the hour once, then each direction's line.
    const eastBars = within(strips[0]).getAllByTestId('trip-time-bar');
    fireEvent.mouseEnter(eastBars[2].parentElement!);
    expect(Array.from(readout.children).map(line => line.textContent)).toEqual([
      '5:00p',
      'Eastbound: every 25 min; about 52 min',
      'Westbound: every 35 min; about 50 min',
    ]);
    // Each chart shows its own number for that hour above it; a chart with no value there shows nothing.
    const values = within(dialog).getAllByTestId('full-day-chart-value').map(el => el.textContent);
    expect(values).toEqual(['every 25 min', 'about 52 min', 'every 35 min', 'about 50 min']);
    // The same hour is lit in all four charts.
    expect(dialog.querySelectorAll('[data-testid="sparkline-hover-column"]')).toHaveLength(2);
    const lit = (strip: HTMLElement) => within(strip).getAllByTestId('trip-time-bar').filter(bar => bar.className.includes('opacity-75') || bar.className.includes('opacity-100'));
    expect(lit(strips[1])).toHaveLength(1);
    fireEvent.mouseLeave(strips[0].querySelector(".items-end")!);
    expect(readout.textContent).toBe('');
    expect(within(dialog).getAllByTestId('full-day-chart-value').map(el => el.textContent)).toEqual(['', '', '', '']);
    expect(dialog.querySelectorAll('[data-testid="sparkline-hover-column"]')).toHaveLength(0);

    // Hovering the second direction's frequency chart shows its period's band in both directions.
    const chart = blocks[1].querySelector('.relative.z-10.flex')!.parentElement!;
    chart.getBoundingClientRect = () => ({ left: 0, width: 240, top: 0, height: 100, right: 240, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(chart, { clientX: ((SPARKLINE_HOURS.indexOf(7) + 0.5) / SPARKLINE_HOURS.length) * 240 });
    expect(within(dialog).getAllByTestId('sparkline-hover-band').length).toBeGreaterThanOrEqual(2);
    expect(within(blocks[0]).getAllByTestId('sparkline-hover-band').length).toBeGreaterThanOrEqual(1);
    expect(within(blocks[1]).getAllByTestId('sparkline-hover-band').length).toBeGreaterThanOrEqual(1);
    expect(Array.from(readout.children).map(line => line.textContent)).toEqual([
      '7:00a',
      'Eastbound: every 30 min; about 38 min',
      'Westbound: every 40 min; about 36 min',
    ]);
    fireEvent.mouseLeave(chart);
    expect(within(dialog).queryAllByTestId('sparkline-hover-band')).toHaveLength(0);
  });

  it('gives a single-direction route the same grid: clock row, y axis and hover number under each chart (CIV-704)', () => {
    render(
      <HeadwaySparkline
        byHour={{ 7: 30, 17: 25 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[{ key: 'only', label: 'Northbound', byHour: { 7: 30, 17: 25 }, tripTime: { byHour: { 7: 38, 17: 52 } } }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    // One block, no direction heading (the title already names the route), frequency left and trip time right.
    const [block] = within(dialog).getAllByTestId('full-day-direction');
    expect(within(dialog).getAllByTestId('full-day-direction')).toHaveLength(1);
    expect(block.children).toHaveLength(2);
    expect(block.children[0].querySelector('.relative.z-10.flex')).not.toBeNull();
    expect(block.children[1].querySelector('[data-testid="trip-time-strip"]')).not.toBeNull();
    // A clock row directly under each chart, and a y axis on each.
    for (const cell of Array.from(block.children)) {
      expect(cell.lastElementChild).toHaveAttribute('data-testid', 'full-day-clock-labels');
      expect(within(cell as HTMLElement).getByTestId('full-day-axis')).toBeInTheDocument();
    }
    expect(within(dialog).getAllByTestId('full-day-clock-labels')).toHaveLength(2);
    // Same paired height as the two-direction grid.
    expect(dialog.querySelector<HTMLElement>('.relative.z-10.flex > div > div')!.style.height).toBe('96px');
    // Hovering a trip-time bar: each chart's own number above it, and the screen-reader line.
    fireEvent.mouseEnter(within(dialog).getAllByTestId('trip-time-bar')[1].parentElement!);
    expect(within(dialog).getAllByTestId('full-day-chart-value').map(el => el.textContent)).toEqual(['every 25 min', 'about 52 min']);
    expect(Array.from(within(dialog).getByTestId('full-day-readout').children).map(line => line.textContent)).toEqual(['5:00p', 'every 25 min; about 52 min']);
    expect(dialog.querySelectorAll('[data-testid="sparkline-hover-column"]')).toHaveLength(1);
    fireEvent.mouseLeave(within(dialog).getAllByTestId('trip-time-strip')[0].querySelector('.items-end')!);
    expect(within(dialog).getAllByTestId('full-day-chart-value').map(el => el.textContent)).toEqual(['', '']);
  });

  it('keeps the toggle and one grid block for a route with more than two directions', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 20 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[
          { key: 'a', label: 'A', byHour: { 6: 20 }, tripTime: { byHour: { 6: 30 } } },
          { key: 'b', label: 'B', byHour: { 6: 40 } },
          { key: 'c', label: 'C', byHour: { 6: 25 } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'Schedule direction' })).toBeInTheDocument();
    expect(within(dialog).getAllByTestId('full-day-direction')).toHaveLength(1);
    expect(within(dialog).getAllByTestId('full-day-axis').length).toBeGreaterThan(0);
    // The picked direction (B, the slowest) has no trip time: no strip and no orphan clock row beside it.
    expect(within(dialog).queryAllByTestId('trip-time-strip')).toHaveLength(0);
    expect(within(dialog).getAllByTestId('full-day-clock-labels')).toHaveLength(1);
  });
});

describe('full-day y axis', () => {
  it('places a headway tick at the top of a bar of that headway on the fixed scale', () => {
    // Shortest headway 5 min: an every-5 bar is full height, every-10 is half, every-20 a quarter.
    const ticks = headwayAxisTicks(1 / 5, 96);
    expect(ticks.map(t => t.label)).toEqual(['5 min', '10 min', '20 min']);
    expect(ticks.map(t => t.fraction)).toEqual([1, 0.5, 0.25]);
    expect(sparklineBarHeight(10, 1 / 5, 96)).toBe(96 * 0.5);
    expect(headwayAxisTicks(0, 96)).toEqual([]);
    expect(headwayAxisTicks(1 / 5, 44).length).toBeLessThanOrEqual(2);
    // A phone's 44px chart still gets two ticks when two round headways fit.
    expect(headwayAxisTicks(1 / 10, 44).map(t => t.label)).toHaveLength(2);
  });

  it('draws one axis per chart, shared scales across both directions', () => {
    render(
      <HeadwaySparkline
        byHour={{ 7: 10, 8: 20 }}
        onPeriodChange={() => {}}
        allowExpand
        directionOptions={[
          { key: 'east', label: 'Eastbound', byHour: { 7: 10, 8: 20 }, tripTime: { byHour: { 7: 30, 8: 60 } } },
          { key: 'west', label: 'Westbound', byHour: { 7: 20, 8: 30 }, tripTime: { byHour: { 7: 15, 8: 30 } } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    const axes = within(dialog).getAllByTestId('full-day-axis');
    expect(axes).toHaveLength(4);
    expect(axes[0].textContent).toBe(axes[2].textContent);
    // Trip time: Westbound's 30-minute bar is half the shared 60-minute top, not full height.
    const westBars = within(within(dialog).getAllByTestId('trip-time-strip')[1]).getAllByTestId('trip-time-bar');
    expect(westBars.map(b => b.style.height)).toEqual(['24px', '48px']);
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
  it('draws both full-day directions on the route\'s one y axis, not each on its own', () => {
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
    const tallestIn = (block: Element) => Math.max(...[...block.querySelectorAll<HTMLElement>('.relative.z-10.flex .rounded-full')].map(el => parseFloat(el.style.height) || 0));
    const [east, west] = within(dialog).getAllByTestId('full-day-direction');
    expect(tallestIn(east)).toBe(48); // every 10 on an every-5 axis: half of the 96px chart
    expect(tallestIn(west)).toBe(96);
  });
});

describe('HeadwaySparkline full-day link', () => {
  const directions = [
    { key: 'southbound', label: 'Southbound', byHour: { 6: 30, 12: 20, 18: 25, 24: 45 } },
    { key: 'northbound', label: 'Northbound', byHour: { 6: 15, 12: 10, 18: 12, 24: 20 } },
    { key: 'loop', label: 'Loop', byHour: { 6: 15, 12: 10, 18: 12, 24: 20 } },
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
