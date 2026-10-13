import summaries from './data/agency-pages.json';
import type { AgencyPageSummaries, AgencyPageSummary } from './agencyPages';
import { BETA_BUILD } from './config';

export const AGENCY_PAGE_DATA = summaries as unknown as AgencyPageSummaries;

/** The same visibility rule as the map: beta-only agencies exist on beta, preview and dev builds, never on public. */
const visible = (a: AgencyPageSummary) => !a.betaOnly || BETA_BUILD;
const VISIBLE_AGENCIES = AGENCY_PAGE_DATA.agencies.filter(visible);
const bySlug = new Map(VISIBLE_AGENCIES.map(a => [a.slug, a]));

export function getAgencyPageSummary(slug: string | undefined): AgencyPageSummary | undefined {
  return slug ? bySlug.get(slug) : undefined;
}

/** Agencies that get a page: those with weekday midday service in the release that this build may show. */
export function agencyPageSummaries(): AgencyPageSummary[] {
  return VISIBLE_AGENCIES.filter(a => a.routes.some(r => r.midday != null));
}
