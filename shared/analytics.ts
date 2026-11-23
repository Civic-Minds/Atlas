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
/** One day's visitors; `date` is GA's yyyymmdd. */
export interface AnalyticsDay { date: string; visitors: number }
export interface AnalyticsWindow {
  days: AnalyticsRange;
  totals: AnalyticsTotals;
  /** The same figures for the window just before (the 7 or 28 days before it), for the change beside each figure. */
  previous: AnalyticsTotals;
  pages: AnalyticsRow[];
  countries: AnalyticsRow[];
  /** Visits by where they came from (GA's session source). */
  sources: AnalyticsRow[];
  /** Visitors per day across the window, oldest first, a day with no visits as 0. */
  daily: AnalyticsDay[];
}

/**
 * Google Analytics counted every map move and filter change as a view of the home page until this day, when the
 * "page changes based on browser history events" setting was turned off (2026-11-22, #1722's sibling fix for GA). Page
 * views from a window that starts before it read high, so the page says so until the window has moved past it.
 */
export const PAGE_VIEWS_FIXED_ON = '2026-11-22';
export type AnalyticsResponse = { available: true; windows: AnalyticsWindow[] } | { available: false };

export const ANALYTICS_COPY = {
  title: 'Analytics',
  card: 'Visits, top pages and countries from Google Analytics.',
  intro: 'Visits to the public site from Google Analytics, for the last 7 and 28 days up to yesterday.',
  unavailable: 'Analytics can’t be read: the Google Analytics key isn’t on this Mac, or Google didn’t answer.',
  loading: 'Loading…',
  windowHeading: (days: number) => `Last ${days} days`,
  totals: { visits: 'Visits', visitors: 'Visitors', pageViews: 'Page views' },
  pages: 'Top Pages',
  countries: 'Countries',
  page: 'Page',
  country: 'Country',
  views: 'Views',
  visitorsColumn: 'Visitors',
  figure: 'Figure',
  count: 'Count',
  /** "+78% vs the 28 days before"; the percent comes from signedPercentText. */
  change: (percent: string, days: number) => `${percent} vs the ${days} days before`,
  noEarlier: (days: number) => `No visits in the ${days} days before`,
  daily: 'Visitors per Day',
  dailyAxis: 'Visitors',
  /** The line's hover sentence and screen-reader text for one day. */
  daySentence: (visitors: string) => `${visitors} visitors`,
  dailyLabel: (days: number) => `Line chart of visitors per day over the last ${days} days`,
  sources: 'Where Visitors Came From',
  source: 'Source',
  visitsColumn: 'Visits',
  /** GA's placeholder source names, in words. */
  sourceNames: { '(direct)': 'Direct (typed or bookmarked)', '(not set)': 'Not known' } as Record<string, string>,
  barsLabel: (heading: string) => `Bar chart: ${heading}`,
  /** The date is shortDate(PAGE_VIEWS_FIXED_ON). */
  pageViewsNote: (date: string) => `Page views before ${date} read high: Google Analytics also counted each map move and filter change as a view of the home page (/).`,
} as const;
