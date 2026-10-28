/** Dev server only: no prerendered HTML there, so read the full summary file and the area configs (as the prerender does). Never in a production build. */
import { agencyPageData } from '../shared/agencyPages';
import { AGENCY_PAGE_DATA, agencyPageSummaries, getAgencyPageSummary } from '../shared/agencyPagesData';
import { DEV_AREA_CONFIGS } from './devAreaConfigs';

export function devAgencyPageData(slug: string | undefined) {
  const agency = getAgencyPageSummary(slug);
  if (!agency) return null;
  const all = agencyPageSummaries();
  const area = DEV_AREA_CONFIGS.find(a => a.page && a.agencies.includes(agency.slug));
  const members = area ? area.agencies.map(s => all.find(x => x.slug === s)).filter((x): x is NonNullable<typeof x> => !!x) : undefined;
  return agencyPageData(agency, all, AGENCY_PAGE_DATA.generatedAt, area ? { slug: area.slug, name: area.name, bbox: area.bbox } : undefined, members);
}
