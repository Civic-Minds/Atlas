import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeekTable } from '../LiveDashboardView';
import { kpiTiles } from '../utils/liveKpi';
import type { LiveV3 } from '../../shared/liveDashboard';

const dates = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
const wk = (o: object) => ({ days: 4, dates, healthyDates: dates, late: { share: 0.07, n: 900 }, tripTime: { n: 40, scheduledMin: 30, typicalMin: 31.2, overMin: 1 }, extraWait: { minutes: 1.2, gaps: 500 }, bunching: { share: 0.3, gaps: 600, bunched: 0.2, gapped: 0.1 }, delivered: { share: 0.998, seen: 998, notSeen: 2, unknown: 0 }, ...o });
const weekly: NonNullable<LiveV3['weekly']> = { minHealthyDays: 3, health: [], comparable: true,
  thisWeek: wk({ late: { share: 0.12, n: 900 }, bunching: { share: 0.215, gaps: 600, bunched: 0.135, gapped: 0.08 } }), lastWeek: wk({}) };
const spread = { late: [0.01, 0.2, 0.1], tripTime: [20, 40, 30], extraWait: [0.1, 2, 1], bunching: [0.1, 0.5, 0.3], delivered: [0.9, 1, 0.95] };

describe('WeekTable', () => {
  const tiles = kpiTiles(weekly, spread);
  const view = () => render(<WeekTable tiles={tiles} notes={{ late: 'more than 5½ min late' }} caption="Grey = within normal day-to-day change" captionTitle="rule" aside="Excluding Oct 11" asideTitle="gaps" />);

  it('is a real table: measures as row headers, This week and Last week as column headers', () => {
    view();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Measure', 'This week', 'Last week']);
    expect(within(table).getAllByRole('rowheader').map(h => h.textContent)).toEqual(['Late', 'Run time', 'Extra wait', 'Bunching', 'Service delivered']);
  });
  it('puts this week and last week in their own columns, bunching in two parts that add up to the total', () => {
    view();
    const row = (name: string) => within(screen.getByRole('row', { name: new RegExp(`^${name}`) })).getAllByRole('cell').map(c => c.textContent);
    expect(row('Late')).toEqual(['▲12%', '7%']);
    expect(row('Bunching')).toEqual(['▼14% · 8%', '20% · 10%']); // 21.5% rounds to 22%: 14 + 8; it fell from 30%
  });
  it('shows the arrow only where the rounded values differ; equal values say "same as last week" in the row\'s hover', () => {
    const { container } = view();
    expect(container.querySelectorAll('[data-tone]').length).toBe(2); // late and bunching moved; the other three match
    const rows = screen.getAllByRole('row');
    const runTime = rows.find(r => r.textContent?.startsWith('Run time'))!;
    expect(runTime.querySelector('[data-tone]')).toBeNull();
    expect(runTime.getAttribute('title')).toMatch(/same as last week/);
  });
  it('keeps the notes, the colour caption with its rule, and the days left out under the table', () => {
    view();
    expect(screen.getByText('Late: more than 5½ min late')).toBeTruthy();
    expect(screen.getByText('Grey = within normal day-to-day change').getAttribute('title')).toBe('rule');
    expect(screen.getByText('Excluding Oct 11').getAttribute('title')).toBe('gaps');
  });
});
