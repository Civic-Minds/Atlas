import { LATE_TILE_CAPTION, weekOfText } from './liveWording';
import type { AgencySummary } from './liveAgency';
import { percentText } from './numberText';
import { tabTitle } from './pageNames';

/**
 * CIV-1796: a Live report page's tab title, in the one tab format every other page uses (tabTitle): "Live: 504 King |
 * Transit Atlas", "Live: TTC | Transit Atlas". Was "504 King · Live · Atlas".
 */
export const liveTabTitle = (name: string): string => tabTitle('Live', name);

/**
 * The link preview of a Live report page (og:title, og:description): the approved page title, and the week's late share
 * in the Late tile's words with the subtitle's week ("9% of trips left the end of the line more than 5½ min late · Week of Oct 8–14").
 */
export function liveLinkPreview(/** The agency's short name ("MiWay"), never the address in capitals (CIV-1160 question 7). */ agencyName: string, route: string | null, summary: AgencySummary | null): { title: string; description: string } {
  const dates = summary?.weekly?.thisWeek.dates ?? [];
  const week = dates.length ? weekOfText(dates[0], dates[dates.length - 1]) : '';
  const line = (share: number | null | undefined) => (share == null ? '' : `${percentText(share)} ${LATE_TILE_CAPTION}${week ? ` · ${week}` : ''}`);
  if (!route) return { title: liveTabTitle(agencyName), description: line(summary?.weekly?.thisWeek.late?.share) };
  const row = summary?.routes.find(r => r.route === route);
  return { title: liveTabTitle(row?.titleLabel ?? `${agencyName} ${route}`), description: line(row?.lateShare) };
}
