import { readUrlParam, STUDIO_REVIEW_URL } from '../../utils/urlSchema';

/**
 * CIV-2182 review only: which proposed design a Studio screen shows, from `?design=` in the address (the review page at
 * /_review/studio-redesign/ opens each one). Without it, or with an unknown name, the screen is as it is today. Removed
 * once Ryan picks a design.
 */
export type FleetDesign = 'today' | 'change';
export type SchedulesDesign = 'today' | 'period' | 'byPeriod';

const param = (): string | null => (typeof window === 'undefined' ? null : readUrlParam(window.location.search, STUDIO_REVIEW_URL.design) ?? null);

export function fleetDesign(): FleetDesign {
  return param() === 'change' ? 'change' : 'today';
}

export function schedulesDesign(): SchedulesDesign {
  const d = param();
  return d === 'period' || d === 'byPeriod' ? d : 'today';
}
