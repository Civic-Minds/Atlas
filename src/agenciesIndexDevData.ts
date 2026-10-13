/** Dev server only: no prerendered HTML there, so build the index from the area configs and summaries. Never in a production build. */
import { buildAgencyIndexData } from '../shared/agencyIndex';
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';
import type { AreaConfig } from '../shared/areas';

const areas = import.meta.glob('../config/areas/*.json', { eager: true, import: 'default' }) as Record<string, AreaConfig>;

export function devAgencyIndexData() {
  return buildAgencyIndexData(agencyPageSummaries(), Object.values(areas), AGENCY_PAGE_DATA.generatedAt);
}
