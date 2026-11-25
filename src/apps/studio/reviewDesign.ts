import { readUrlParam, STUDIO_REVIEW_URL } from '../../utils/urlSchema';

/**
 * CIV-2182 review only: which proposed Schedules design Studio shows (Fleet's is settled: the right-now design), from `?design=` in the address (the review page at
 * /_review/studio-redesign/ opens each one). Without it, or with an unknown name, the screen is as it is today. Removed
 * once Ryan picks a design.
 */
/** 'page' (Ryan: "Maybe scehedules should be a full page too idk"): Schedules as a full page over the map, not a panel on it. */
export type SchedulesDesign = 'today' | 'period' | 'byPeriod' | 'summary' | 'page';

const param = (): string | null => (typeof window === 'undefined' ? null : readUrlParam(window.location.search, STUDIO_REVIEW_URL.design) ?? null);

export function schedulesDesign(): SchedulesDesign {
  const d = param();
  return d === 'period' || d === 'byPeriod' || d === 'summary' || d === 'page' ? d : 'today';
}
