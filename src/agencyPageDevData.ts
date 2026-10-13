/** Dev server only: no prerendered HTML there, so read the full summary file. Never in a production build. */
import { agencyPageData } from '../shared/agencyPages';
import { agencyPageSummaries, getAgencyPageSummary } from '../shared/agencyPagesData';

export function devAgencyPageData(slug: string | undefined) {
  const agency = getAgencyPageSummary(slug);
  return agency ? agencyPageData(agency, agencyPageSummaries()) : null;
}
