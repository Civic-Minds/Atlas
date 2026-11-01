/** Dev server only: no prerendered HTML there, so build the page data from the summaries. Never in a production build. */
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';
import { buildRegionPageData, regionPages } from '../shared/regionPages';

export function devRegionPageData(slug: string | undefined) {
  const all = agencyPageSummaries();
  const region = regionPages(all).find(r => r.slug === slug);
  return region ? buildRegionPageData(region, all, AGENCY_PAGE_DATA.generatedAt) : null;
}
