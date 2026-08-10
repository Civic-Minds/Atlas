import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeadwaySparkline } from '../HeadwaySparkline';

describe('HeadwaySparkline', () => {
  it('opens the beta full-day schedule view with all periods', () => {
    render(
      <HeadwaySparkline
        byHour={{ 6: 30, 12: 20, 18: 25, 24: 45 }}
        period="midday"
        onPeriodChange={() => {}}
        allowExpand
        title="Route 14 — Lakeshore"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand schedule' }));

    const dialog = screen.getByRole('dialog', { name: 'Route 14 — Lakeshore full-day schedule' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('AM Peak')).toBeInTheDocument();
    expect(within(dialog).getByText('Midday')).toBeInTheDocument();
    expect(within(dialog).getByText('Overnight')).toBeInTheDocument();
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
});
