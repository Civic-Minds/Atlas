/**
 * CIV-2068: the internal Analytics page (dev server only). Ryan: "Well GA we have been using though", then picked 1: the
 * page reads Google Analytics (the GA4 Data API) through the local API (local-api/analytics.ts), with a read-only
 * service-account key kept on this Mac, never in the browser bundle. The words are new UI text, all here.
 */

export const ANALYTICS_API_URL = '/api/analytics';
/** The two windows the page shows, in days, ending yesterday (today is still filling in). */
export const ANALYTICS_RANGES = [7, 28] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
/** Rows in the top pages and countries tables. */
export const ANALYTICS_TOP_ROWS = 10;

export interface AnalyticsTotals { visits: number; visitors: number; pageViews: number }
export interface AnalyticsRow { name: string; value: number }
export interface AnalyticsWindow { days: AnalyticsRange; totals: AnalyticsTotals; pages: AnalyticsRow[]; countries: AnalyticsRow[] }
export type AnalyticsResponse = { available: true; windows: AnalyticsWindow[] } | { available: false };

export const ANALYTICS_COPY = {
  title: 'Analytics',
  card: 'Visits, top pages and countries from Google Analytics.',
  intro: 'Visits to the public site from Google Analytics, for the last 7 and 28 days up to yesterday.',
  unavailable: 'Analytics can’t be read: the Google Analytics key isn’t on this Mac, or Google didn’t answer.',
  loading: 'Loading…',
  windowHeading: (days: number) => `Last ${days} days`,
  totals: { visits: 'Visits', visitors: 'Visitors', pageViews: 'Page views' },
  pages: 'Top pages',
  countries: 'Countries',
  page: 'Page',
  country: 'Country',
  views: 'Views',
  visitorsColumn: 'Visitors',
  figure: 'Figure',
  count: 'Count',
} as const;
