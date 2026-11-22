import { describe, expect, it } from 'vitest';
import { readWindow, windowRequests } from '../analytics';
import { ANALYTICS_TOP_ROWS } from '../../shared/analytics';

// CIV-2068: the Analytics page's figures from the GA4 Data API (read-only key on this Mac).
describe('Analytics through the local API', () => {
  it('asks for totals, top pages and countries, up to yesterday', () => {
    const [totals, pages, countries] = windowRequests(7);
    expect(totals.dateRanges).toEqual([{ startDate: '7daysAgo', endDate: 'yesterday' }]);
    expect(totals.metrics.map(m => m.name)).toEqual(['sessions', 'activeUsers', 'screenPageViews']);
    expect(pages.dimensions?.[0].name).toBe('pagePath');
    expect(countries.dimensions?.[0].name).toBe('country');
    expect(pages.limit).toBe(ANALYTICS_TOP_ROWS);
  });

  it('reads the answer in that order', () => {
    const w = readWindow(28, [
      { rows: [{ metricValues: [{ value: '120' }, { value: '90' }, { value: '400' }] }] },
      { rows: [{ dimensionValues: [{ value: '/' }], metricValues: [{ value: '250' }] }] },
      { rows: [{ dimensionValues: [{ value: 'Canada' }], metricValues: [{ value: '70' }] }] },
    ]);
    expect(w).toEqual({ days: 28, totals: { visits: 120, visitors: 90, pageViews: 400 }, pages: [{ name: '/', value: 250 }], countries: [{ name: 'Canada', value: 70 }] });
    expect(readWindow(7, []).totals).toEqual({ visits: 0, visitors: 0, pageViews: 0 });
  });

  it('answers not available without the key on this Mac', async () => {
    process.env.GA4_KEY_FILE = '/nonexistent/key.json';
    const { default: handler } = await import('../analytics');
    expect(await (await handler.fetch()).json()).toEqual({ available: false });
  });
});
