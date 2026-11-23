import { describe, expect, it } from 'vitest';
import { dailyOf, readWindow, windowRequests } from '../analytics';
import { ANALYTICS_TOP_ROWS } from '../../shared/analytics';

// CIV-2068: the Analytics page's figures from the GA4 Data API (read-only key on this Mac).
describe('Analytics through the local API', () => {
  it('asks for totals (and the window before), top pages, countries, sources and visitors per day, up to yesterday', () => {
    const reqs = windowRequests(7);
    expect(reqs).toHaveLength(5); // batchRunReports' limit
    const [totals, pages, countries, sources, daily] = reqs;
    expect(totals.dateRanges).toEqual([{ startDate: '7daysAgo', endDate: 'yesterday' }, { startDate: '14daysAgo', endDate: '8daysAgo' }]);
    expect(totals.metrics.map(m => m.name)).toEqual(['sessions', 'activeUsers', 'screenPageViews']);
    expect(pages.dimensions?.[0].name).toBe('pagePath');
    expect(countries.dimensions?.[0].name).toBe('country');
    expect(sources.dimensions?.[0].name).toBe('sessionSource');
    expect(daily.dimensions?.[0].name).toBe('date');
    expect(daily.dateRanges).toEqual([{ startDate: '7daysAgo', endDate: 'yesterday' }]);
    expect(pages.limit).toBe(ANALYTICS_TOP_ROWS);
    expect(windowRequests(28)[0].dateRanges[1]).toEqual({ startDate: '56daysAgo', endDate: '29daysAgo' });
  });

  it('reads the answer in that order, matching each total to its date range whatever order GA sends them', () => {
    const w = readWindow(28, [
      { rows: [
        { dimensionValues: [{ value: 'date_range_1' }], metricValues: [{ value: '60' }, { value: '45' }, { value: '300' }] },
        { dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '120' }, { value: '90' }, { value: '400' }] },
      ] },
      { rows: [{ dimensionValues: [{ value: '/' }], metricValues: [{ value: '250' }] }] },
      { rows: [{ dimensionValues: [{ value: 'Canada' }], metricValues: [{ value: '70' }] }] },
      { rows: [{ dimensionValues: [{ value: 'google' }], metricValues: [{ value: '30' }] }] },
      { rows: [{ dimensionValues: [{ value: '20261121' }], metricValues: [{ value: '5' }] }] },
    ]);
    expect(w).toEqual({
      days: 28,
      totals: { visits: 120, visitors: 90, pageViews: 400 },
      previous: { visits: 60, visitors: 45, pageViews: 300 },
      pages: [{ name: '/', value: 250 }],
      countries: [{ name: 'Canada', value: 70 }],
      sources: [{ name: 'google', value: 30 }],
      daily: [{ date: '20261121', visitors: 5 }],
    });
    expect(readWindow(7, []).totals).toEqual({ visits: 0, visitors: 0, pageViews: 0 });
    expect(readWindow(7, []).previous).toEqual({ visits: 0, visitors: 0, pageViews: 0 });
  });

  it('fills a day GA leaves out (no visits) with 0, across a month end', () => {
    const row = (date: string, v: string) => ({ dimensionValues: [{ value: date }], metricValues: [{ value: v }] });
    expect(dailyOf({ rows: [row('20261101', '3'), row('20261029', '4'), row('20261031', '2')] })).toEqual([
      { date: '20261029', visitors: 4 }, { date: '20261030', visitors: 0 }, { date: '20261031', visitors: 2 }, { date: '20261101', visitors: 3 },
    ]);
    expect(dailyOf(undefined)).toEqual([]);
  });

  it('answers not available without the key on this Mac', async () => {
    process.env.GA4_KEY_FILE = '/nonexistent/key.json';
    const { default: handler } = await import('../analytics');
    expect(await (await handler.fetch()).json()).toEqual({ available: false });
  });
});
