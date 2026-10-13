import summaries from './data/agency-pages.json';
import type { AgencyPageSummaries, AgencyPageSummary } from './agencyPages';

export const AGENCY_PAGE_DATA = summaries as unknown as AgencyPageSummaries;

const bySlug = new Map(AGENCY_PAGE_DATA.agencies.map(a => [a.slug, a]));

export function getAgencyPageSummary(slug: string | undefined): AgencyPageSummary | undefined {
  return slug ? bySlug.get(slug) : undefined;
}

/** Agencies that get a page: those with weekday midday service in the release. */
export function agencyPageSummaries(): AgencyPageSummary[] {
  return AGENCY_PAGE_DATA.agencies.filter(a => a.routes.some(r => r.midday != null));
}
