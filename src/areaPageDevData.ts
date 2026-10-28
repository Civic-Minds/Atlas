/** Dev server only: no prerendered HTML there, so build the page data from the area config and summaries. Never in a production build. */
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';
import { buildAreaPageData } from '../shared/areaPages';
import { DEV_AREA_CONFIGS } from './devAreaConfigs';

export function devAreaPageData(slug: string | undefined) {
  const area = DEV_AREA_CONFIGS.find(a => a.slug === slug && a.page);
  const all = new Map(agencyPageSummaries().map(a => [a.slug, a]));
  return area ? buildAreaPageData(area, all, AGENCY_PAGE_DATA.generatedAt) : null;
}
