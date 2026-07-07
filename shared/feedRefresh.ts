/** Weekday of weekly GTFS refresh (0=Sun … 6=Sat). Keep in sync with `.github/workflows/refresh-feeds.yml`. */
export const FEED_REFRESH_WEEKDAY = 1; // Monday

/** Calendar days until the next feed refresh day (0 = today). */
export function daysUntilFeedRefresh(from = new Date(), weekday = FEED_REFRESH_WEEKDAY): number {
  return (weekday - from.getDay() + 7) % 7;
}

export function feedRefreshCountdownLabel(from = new Date()): string {
  const days = daysUntilFeedRefresh(from);
  if (days === 0) return "We'll check for updates again today.";
  if (days === 1) return "We'll check for updates again tomorrow.";
  return `We'll check for updates again in ${days} days.`;
}
