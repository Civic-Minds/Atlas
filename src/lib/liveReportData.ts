import { R2_PUBLIC_URL } from '../../shared/config';

/**
 * Where the Live report pages read their data. Dev: the local API (local-api/, served by `npm run live`). Production and
 * beta builds: the published analysis JSON on R2 (scripts/live-publish.ts writes atlas/live/<agency>/<route>.json and
 * agency.json), so the pages work without any Live endpoint deployed.
 */
const fromR2 = !import.meta.env.DEV;

export function liveDashboardDataUrl(agency: string, route: string): string {
  return fromR2
    ? `${R2_PUBLIC_URL}/atlas/live/${encodeURIComponent(agency)}/${encodeURIComponent(route)}.json`
    : `/api/live-dashboard?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}`;
}

export function liveAgencyDataUrl(agency: string): string {
  return fromR2 ? `${R2_PUBLIC_URL}/atlas/live/${encodeURIComponent(agency)}/agency.json` : `/api/live-agency?agency=${encodeURIComponent(agency)}`;
}

/** R2 answers a missing file with an error page, not JSON: read that as "no such route", the API's own answer. */
export const liveDataMissing = (r: Response) => fromR2 && !r.ok;
