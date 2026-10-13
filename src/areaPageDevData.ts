/** Dev server only: no prerendered HTML there, so build the page data from the area config and summaries. Never in a production build. */
import { AGENCY_PAGE_DATA } from '../shared/agencyPagesData';
import { buildAreaPageData } from '../shared/areaPages';
import type { AreaConfig } from '../shared/areas';

const areas = import.meta.glob('../config/areas/*.json', { eager: true, import: 'default' }) as Record<string, AreaConfig>;

export function devAreaPageData(slug: string | undefined) {
  const area = Object.values(areas).find(a => a.slug === slug && a.page);
  const all = new Map(AGENCY_PAGE_DATA.agencies.map(a => [a.slug, a]));
  return area ? buildAreaPageData(area, all, AGENCY_PAGE_DATA.generatedAt) : null;
}
