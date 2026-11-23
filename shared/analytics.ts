/**
 * CIV-2068: the internal Analytics page (dev server only). Ryan: "Well GA we have been using though", then picked 1: the
 * page reads Google Analytics (the GA4 Data API) through the local API (local-api/analytics.ts), with a read-only
 * service-account key kept on this Mac, never in the browser bundle. The words are new UI text, all here.
 */

export const ANALYTICS_API_URL = '/api/analytics';
/**
 * The page's periods, in days, ending yesterday (today is still filling in). Ryan, 2026-11-22: "Maybe last 14 and 28?",
 * then "instead of a 7/14/28 day switcher ... what if we just showed all that data without needing a switcher": every
 * chart shows the longer one (ANALYTICS_MAIN_DAYS) and each key figure also gives the shorter one's count.
 */
export const ANALYTICS_RANGES = [14, 28] as const;
export const ANALYTICS_MAIN_DAYS = 28;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
/** Rows in the top pages and countries tables. */
export const ANALYTICS_TOP_ROWS = 10;

export interface AnalyticsTotals {
  visits: number; visitors: number; pageViews: number;
  /** Average visit length in seconds (GA's averageSessionDuration). */
  visitSeconds: number;
}
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
  /** Visitors by state or province (GA's region names), for the tile map. */
  regions: AnalyticsRow[];
  /** Visitors who had been before (GA's newVsReturning "returning"). */
  returning: number;
  /** Atlas's own events (lib/analytics.ts trackEvent) by count, GA's automatic events left out. */
  actions: AnalyticsRow[];
  /** Visitors by city, GA's "(not set)" left out. */
  cities: AnalyticsRow[];
}

/** Events GA sends by itself (page loads, scrolls, sessions); the Actions chart shows only Atlas's own. */
export const GA_AUTOMATIC_EVENTS: readonly string[] = ['page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll', 'click', 'file_download', 'form_start', 'form_submit', 'video_start', 'video_progress', 'video_complete', 'view_search_results'];
/** "filter_changed" as "Filter changed": an event name in words. */
export const actionName = (event: string): string => {
  const words = event.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : event;
};

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
  intro: (days: number) => `Visits to the public site from Google Analytics over the last ${days} days, up to yesterday.`,
  /** A key figure's count for the shorter period. */
  shorter: (days: number, count: string) => `Last ${days} days: ${count}`,
  figuresHeading: 'Overview',
  /** "On this page" labels, one or two words each (Ryan, 2026-11-22: "On this page stuff is supposed to be 1-2 words max"). */
  nav: { overview: 'Overview', daily: 'Visitors', actions: 'Actions', sources: 'Sources', pages: 'Pages', where: 'Locations' },
  actions: 'What Visitors Did',
  action: 'Action',
  times: 'Times',
  cities: 'Top Cities',
  city: 'City',
  /** The returning-visitors card's second line: their share of all visitors. */
  returningShare: (percent: string) => `${percent} of visitors`,
  unavailable: 'Analytics can’t be read: the Google Analytics key isn’t on this Mac, or Google didn’t answer.',
  loading: 'Loading…',
  totals: { visits: 'Visits', visitors: 'Visitors', pageViews: 'Page views', visitSeconds: 'Time per visit', returning: 'Returning visitors' },
  pages: 'Top Pages',
  where: 'Where Visitors Are',
  mapLabel: (days: number) => `Tile map of visitors by US state and Canadian province over the last ${days} days`,
  region: 'State or province',
  /** A tile's screen-reader sentence. */
  regionSentence: (region: string, visitors: string) => `${region}: ${visitors} visitors`,
  otherCountries: 'Outside the US and Canada',
  page: 'Page',
  country: 'Country',
  views: 'Views',
  visitorsColumn: 'Visitors',
  /** "+78% vs prior 28 days" (short enough for one line in a figure card); the percent comes from signedPercentText. */
  change: (percent: string, days: number) => `${percent} vs prior ${days} days`,
  noEarlier: (days: number) => `None in prior ${days} days`,
  daily: 'Visitors per Day',
  dailyAxis: 'Visitors',
  /** The line's hover sentence and screen-reader text for one day. */
  daySentence: (visitors: string) => `${visitors} visitors`,
  dailyLabel: (days: number) => `Line chart of visitors per day over the last ${days} days`,
  sources: 'Where Visitors Came From',
  source: 'Source',
  visitsColumn: 'Visits',
  /** The home page's row in Top Pages: it's the map. */
  homePage: 'Map (/)',
  barsLabel: (heading: string) => `Bar chart: ${heading}`,
  /** The date is shortDate(PAGE_VIEWS_FIXED_ON). */
  pageViewsNote: (date: string) => `Page views before ${date} read high, and so does the Map (/) bar: Google Analytics also counted each map move and filter change as a view of the map.`,
} as const;

/** GA's placeholder names (sources and countries), in words. */
const PLACEHOLDER_NAMES: Record<string, string> = { '(direct)': 'Direct', '(not set)': 'Not known' };
/**
 * Where a visit came from, by name: GA reports the referring site as it saw it ("m.facebook.com", "ig",
 * "teams.public.onecdn.static.microsoft"). Sites with several addresses are named once, so their visits add up in one bar.
 */
const SOURCE_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(www\.)?google(\.|$)/, 'Google'],
  [/^(www\.)?bing(\.|$)/, 'Bing'],
  [/^(duckduckgo|ddg)(\.|$)/, 'DuckDuckGo'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)facebook\.com$|^fb$/, 'Facebook'],
  [/(^|\.)instagram\.com$|^ig$/, 'Instagram'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X'],
  [/(^|\.)bsky\.app$/, 'Bluesky'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)chatgpt\.com$|^openai$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/\.static\.microsoft$|(^|\.)teams\.microsoft\.com$/, 'Microsoft Teams'],
  [/^open\.toronto\.ca$/, 'City of Toronto open data'],
];
/** GA's region names that the tile grid (src/data/regionTileGrid.ts) knows by another name. */
export const GA_REGION_ALIASES: Readonly<Record<string, string>> = { 'Newfoundland and Labrador': 'Newfoundland', 'District of Columbia': 'Washington DC' };
/** The countries the tile map covers, as GA names them; the rest are listed beside it. */
export const TILE_MAP_COUNTRIES: readonly string[] = ['United States', 'Canada'];
/** Rows asked for in the regions report (every state and province with a visit). */
export const ANALYTICS_REGION_ROWS = 100;
/** Rows in the actions chart (Atlas sends about 15 kinds of event). */
export const ANALYTICS_ACTION_ROWS = 20;

/** Longest name a bar's label shows before it's cut short (the full name stays in the bar's sentence and table). */
export const ANALYTICS_LABEL_MAX = 24;

export function sourceName(raw: string): string {
  return PLACEHOLDER_NAMES[raw] ?? SOURCE_NAMES.find(([re]) => re.test(raw))?.[1] ?? raw;
}
export function placeName(raw: string): string {
  return PLACEHOLDER_NAMES[raw] ?? raw;
}
/** Rows renamed, those that now share a name added together, largest first. */
export function renamedRows(rows: readonly AnalyticsRow[], nameOf: (raw: string) => string): AnalyticsRow[] {
  const sums = new Map<string, number>();
  for (const r of rows) sums.set(nameOf(r.name), (sums.get(nameOf(r.name)) ?? 0) + r.value);
  return [...sums].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
/** A bar label cut to ANALYTICS_LABEL_MAX characters with an ellipsis. */
export const shortLabel = (name: string): string => (name.length > ANALYTICS_LABEL_MAX ? `${name.slice(0, ANALYTICS_LABEL_MAX - 1)}…` : name);

