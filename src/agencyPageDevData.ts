/** Dev server only: no prerendered HTML there, so read the full summary file and the area configs (as the prerender does). Never in a production build. */
import { agencyPageData, agencyPagePath } from '../shared/agencyPages';
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';
import { parentAgency, parentAgencyPageData, parentHome, parentMembers } from '../shared/parentAgencies';
import { parentAgencyPagePath } from '../shared/pagePaths';
import { DEV_AREA_CONFIGS } from './devAreaConfigs';

/** The page at /agency/<slug>: a parent agency's (CIV-1277) first, else the agency whose page path it is. */
export function devAgencyPageData(slug: string | undefined) {
  if (!slug) return null;
  const all = agencyPageSummaries();
  const areaFor = (agencySlug: string) => {
    const area = DEV_AREA_CONFIGS.find(a => a.page && a.agencies.includes(agencySlug));
    const members = area ? area.agencies.map(s => all.find(x => x.slug === s)).filter((x): x is NonNullable<typeof x> => !!x) : undefined;
    return [area ? { slug: area.slug, name: area.name, bbox: area.bbox } : undefined, members] as const;
  };
  const parent = parentAgency(slug);
  if (parent) {
    const home = parentHome(parent, parentMembers(parent, all));
    return home ? parentAgencyPageData(parent, all, AGENCY_PAGE_DATA.generatedAt, ...areaFor(home.slug)) : null;
  }
  const agency = all.find(a => agencyPagePath(a.slug) === parentAgencyPagePath(slug));
  return agency ? agencyPageData(agency, all, AGENCY_PAGE_DATA.generatedAt, ...areaFor(agency.slug)) : null;
}
