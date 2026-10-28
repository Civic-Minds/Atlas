/** Dev server only: no prerendered HTML there, so build the index from the area configs and summaries. Never in a production build. */
import { buildAgencyIndexData } from '../shared/agencyIndex';
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';
import { DEV_AREA_CONFIGS } from './devAreaConfigs';

export function devAgencyIndexData() {
  return buildAgencyIndexData(agencyPageSummaries(), DEV_AREA_CONFIGS, AGENCY_PAGE_DATA.generatedAt);
}
