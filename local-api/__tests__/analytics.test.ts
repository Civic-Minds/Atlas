import { describe, expect, it } from 'vitest';
import { dailyOf, moreRequests, readWindow, windowRequests } from '../analytics';
import { actionName, ANALYTICS_LABEL_MAX, ANALYTICS_TOP_ROWS, placeName, renamedRows, shortLabel, sourceName } from '../../shared/analytics';

// CIV-2068: the Analytics page's figures from the GA4 Data API (read-only key on this Mac).
describe('Analytics through the local API', () => {
  it('asks for totals (and the window before), top pages, countries, sources and visitors per day, up to yesterday', () => {
    const reqs = windowRequests(7);
    expect(reqs).toHaveLength(5); // batchRunReports' limit
    const [totals, pages, countries, sources, daily] = reqs;
    expect(totals.dateRanges).toEqual([{ startDate: '7daysAgo', endDate: 'yesterday' }, { startDate: '14daysAgo', endDate: '8daysAgo' }]);
    expect(totals.metrics.map(m => m.name)).toEqual(['sessions', 'activeUsers', 'screenPageViews', 'averageSessionDuration']);
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
        { dimensionValues: [{ value: 'date_range_1' }], metricValues: [{ value: '60' }, { value: '45' }, { value: '300' }, { value: '100.5' }] },
        { dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '120' }, { value: '90' }, { value: '400' }, { value: '250.25' }] },
      ] },
      { rows: [{ dimensionValues: [{ value: '/' }], metricValues: [{ value: '250' }] }] },
      { rows: [{ dimensionValues: [{ value: 'Canada' }], metricValues: [{ value: '70' }] }] },
      { rows: [{ dimensionValues: [{ value: 'google' }], metricValues: [{ value: '30' }] }] },
      { rows: [{ dimensionValues: [{ value: '20261121' }], metricValues: [{ value: '5' }] }] },
    ]);
    expect(w).toEqual({
      days: 28,
      totals: { visits: 120, visitors: 90, pageViews: 400, visitSeconds: 250.25 },
      previous: { visits: 60, visitors: 45, pageViews: 300, visitSeconds: 100.5 },
      pages: [{ name: '/', value: 250 }],
      countries: [{ name: 'Canada', value: 70 }],
      sources: [{ name: 'google', value: 30 }],
      daily: [{ date: '20261121', visitors: 5 }],
      regions: [],
      returning: 0,
      actions: [],
      cities: [],
    });
    const row = (name: string, v: string) => ({ dimensionValues: [{ value: name }], metricValues: [{ value: v }] });
    const more = readWindow(14, [], [
      { rows: [row('Ontario', '40')] },
      { rows: [row('new', '30'), row('returning', '12')] },
      { rows: [row('filter_changed', '696')] },
      { rows: [row('Toronto', '35')] },
    ]);
    expect(more.regions).toEqual([{ name: 'Ontario', value: 40 }]);
    expect(more.returning).toBe(12);
    expect(more.actions).toEqual([{ name: 'filter_changed', value: 696 }]);
    expect(more.cities).toEqual([{ name: 'Toronto', value: 35 }]);
    expect(readWindow(14, []).totals).toEqual({ visits: 0, visitors: 0, pageViews: 0, visitSeconds: 0 });
    expect(readWindow(14, []).previous).toEqual({ visits: 0, visitors: 0, pageViews: 0, visitSeconds: 0 });
  });

  it('asks the second batch for US and Canada regions, new against returning, Atlas’s own events and cities', () => {
    const [regions, returning, actions, cities] = moreRequests(14);
    expect(moreRequests(14)).toHaveLength(4);
    expect(regions.dimensions[0].name).toBe('region');
    expect(regions.dimensionFilter?.filter?.inListFilter.values).toEqual(['United States', 'Canada']);
    expect(regions.dateRanges).toEqual([{ startDate: '14daysAgo', endDate: 'yesterday' }]);
    expect(returning.dimensions[0].name).toBe('newVsReturning');
    expect(actions.dimensions[0].name).toBe('eventName');
    expect(actions.dimensionFilter?.notExpression?.filter.inListFilter?.values).toContain('page_view');
    expect(cities.dimensions[0].name).toBe('city');
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

  it('names sources in words and adds up a site’s several addresses', () => {
    expect(['(direct)', 'google', 'bing', 'ig', 'm.facebook.com', 'teams.public.onecdn.static.microsoft', 'chatgpt.com', 'open.toronto.ca', 'example.org'].map(sourceName))
      .toEqual(['Direct', 'Google', 'Bing', 'Instagram', 'Facebook', 'Microsoft Teams', 'ChatGPT', 'City of Toronto open data', 'example.org']);
    expect(placeName('(not set)')).toBe('Not known');
    expect(renamedRows([{ name: 'google', value: 5 }, { name: 'm.facebook.com', value: 4 }, { name: 'facebook.com', value: 3 }], sourceName))
      .toEqual([{ name: 'Facebook', value: 7 }, { name: 'Google', value: 5 }]);
    expect(shortLabel('x'.repeat(40))).toHaveLength(ANALYTICS_LABEL_MAX);
    expect(shortLabel('/agency/metrostlouis')).toBe('/agency/metrostlouis');
    expect(actionName('filter_changed')).toBe('Filter changed');
  });
});
