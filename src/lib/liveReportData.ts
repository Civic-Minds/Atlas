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

/** What the report pages say outside dev when their data fails to load (wording approved by Ryan, 2026-10-16). */
export const LIVE_REPORT_UNAVAILABLE = "This report isn't available right now.";

/** Setup instructions ("npm run live", "npm run live:analyze") are for dev only; outside dev the approved line stands in. */
export const devOnly = (devText: string): string => (fromR2 ? LIVE_REPORT_UNAVAILABLE : devText);

/** Drops the trailing "Rebuild it with npm run live:analyze..." sentence outside dev, keeping what the text says about the data. */
export const withoutDevHint = (text: string): string => (fromR2 ? text.replace(/\s+Rebuild(?:ing)? (?:it|them|the analysis) with .*$/s, '') : text);

/** Page titles (approved): "504 King · Live · Atlas" and "TTC · Live · Atlas". */
export const liveReportTitle = (name: string) => `${name} · Live · Atlas`;

/** Dev only: ?date=YYYY-MM-DD picks the day the local Yesterday view shows, for review against older archive days. */
const devDate = () => { const d = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('date'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `&date=${d}` : ''; };

export function liveYesterdayDataUrl(agency: string, route: string | null): string {
  return fromR2
    ? `${R2_PUBLIC_URL}/atlas/live/${encodeURIComponent(agency)}/yesterday/${route ? encodeURIComponent(route) : 'agency'}.json`
    : `/api/live-yesterday?agency=${encodeURIComponent(agency)}${route ? `&route=${encodeURIComponent(route)}` : ''}${devDate()}`;
}

export function liveGapsDataUrl(agency: string, route: string): string {
  return fromR2
    ? `${R2_PUBLIC_URL}/atlas/live/${encodeURIComponent(agency)}/${encodeURIComponent(route)}-gaps.json`
    : `/api/live-gaps?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}`;
}

/** R2 answers a missing file with an error page, not JSON: read that as "no such route", the API's own answer. */
export const liveDataMissing = (r: Response) => fromR2 && !r.ok;
