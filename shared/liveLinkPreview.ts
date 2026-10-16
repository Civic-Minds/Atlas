import { dateRangeText } from './liveDashboard';
import type { AgencySummary } from './liveAgency';

/**
 * The link preview of a Live report page (og:title, og:description): the approved page title, and the week's late share
 * in the Late tile's own words with the week's dates ("9% of departures 5.5+ min late · Oct 8–14").
 */
export function liveLinkPreview(agency: string, route: string | null, summary: AgencySummary | null): { title: string; description: string } {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const dates = summary?.weekly?.thisWeek.dates ?? [];
  const week = dates.length ? dateRangeText(dates[0], dates[dates.length - 1]) : '';
  const line = (share: number | null | undefined) => (share == null ? '' : `${pct(share)} of departures 5.5+ min late${week ? ` · ${week}` : ''}`);
  if (!route) return { title: `${agency.toUpperCase()} · Live · Atlas`, description: line(summary?.weekly?.thisWeek.late?.share) };
  const row = summary?.routes.find(r => r.route === route);
  return { title: `${row?.titleLabel ?? `${agency.toUpperCase()} ${route}`} · Live · Atlas`, description: line(row?.lateShare) };
}
