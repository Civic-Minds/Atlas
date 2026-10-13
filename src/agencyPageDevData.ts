/** Dev server only: no prerendered HTML there, so read the full summary file and the area configs (as the prerender does). Never in a production build. */
import { agencyPageData } from '../shared/agencyPages';
import { AGENCY_PAGE_DATA, agencyPageSummaries, getAgencyPageSummary } from '../shared/agencyPagesData';
import type { AreaConfig } from '../shared/areas';

const areas = import.meta.glob('../config/areas/*.json', { eager: true, import: 'default' }) as Record<string, AreaConfig>;

export function devAgencyPageData(slug: string | undefined) {
  const agency = getAgencyPageSummary(slug);
  if (!agency) return null;
  const all = agencyPageSummaries();
  const area = Object.values(areas).find(a => a.page && a.agencies.includes(agency.slug));
  const members = area ? area.agencies.map(s => all.find(x => x.slug === s)).filter((x): x is NonNullable<typeof x> => !!x) : undefined;
  return agencyPageData(agency, all, AGENCY_PAGE_DATA.generatedAt, area ? { slug: area.slug, name: area.name } : undefined, members);
}
