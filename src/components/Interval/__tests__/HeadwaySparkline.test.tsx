import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadwaySparkline } from '../HeadwaySparkline';

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
    expect(within(dialog).getByRole('tab', { name: 'All directions' })).toHaveClass('h-7', 'px-2.5');
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
  it('shows the trip time line and per-hour hover under the full-day chart, and hides it without data', () => {
    const byHour = { 7: 30, 12: 20, 17: 25 };
    const { rerender } = render(
      <HeadwaySparkline
        byHour={byHour}
        onPeriodChange={() => {}}
        allowExpand
        title="Route 14"
        directionOptions={[
          { key: 'all', label: 'All directions', byHour, tripTime: { byHour: { 7: 38, 12: 41, 17: 52 } } },
          { key: 'north', label: 'Northbound', byHour, tripTime: null },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Trip time, slower direction: 38\u201352 min, slowest 5 p.m.')).toBeInTheDocument();
    expect(within(dialog).getAllByTestId('trip-time-bar')).toHaveLength(3);
    expect(dialog.querySelector('[title="5 p.m.: about 52 min"]')).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Northbound' }));
    expect(within(dialog).queryByTestId('trip-time-strip')).not.toBeInTheDocument();
    rerender(<div />);
  });
});
