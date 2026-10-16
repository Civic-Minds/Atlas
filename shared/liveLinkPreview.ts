import { LATE_TILE_CAPTION, weekOfText } from './liveWording';
import type { AgencySummary } from './liveAgency';

/**
 * The link preview of a Live report page (og:title, og:description): the approved page title, and the week's late share
 * in the Late tile's words with the subtitle's week ("9% of trips left the end of the line more than 5 min late · Week of Oct 8–14").
 */
export function liveLinkPreview(agency: string, route: string | null, summary: AgencySummary | null): { title: string; description: string } {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const dates = summary?.weekly?.thisWeek.dates ?? [];
  const week = dates.length ? weekOfText(dates[0], dates[dates.length - 1]) : '';
  const line = (share: number | null | undefined) => (share == null ? '' : `${pct(share)} ${LATE_TILE_CAPTION}${week ? ` · ${week}` : ''}`);
  if (!route) return { title: `${agency.toUpperCase()} · Live · Atlas`, description: line(summary?.weekly?.thisWeek.late?.share) };
  const row = summary?.routes.find(r => r.route === route);
  return { title: `${row?.titleLabel ?? `${agency.toUpperCase()} ${route}`} · Live · Atlas`, description: line(row?.lateShare) };
}
