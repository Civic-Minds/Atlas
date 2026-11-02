/**
 * CIV-1277: parent agencies, display only. An agency split across feeds (MTA New York's subway, borough buses and
 * railroads; exo's sectors) stays one agency per feed in the data; its parent (config/parent-agencies.json, named by each
 * member's `parentAgency`) gets one page that adds its members up, as SEPTA's and LA Metro's pages do for their merged
 * bus and rail feeds. Every number comes from the members' own summaries.
 */
import { agencyPageData, type AgencyPageData, type AgencyPageSummary } from './agencyPages';
import { agencyGroupData, type AgencyGroupData } from './areaPages';
import { PARENT_AGENCIES, type ParentAgency } from './parentAgencyList';

export { PARENT_AGENCIES, parentAgency, type ParentAgency } from './parentAgencyList';
import { parentMembers, parentSummary } from './parentSummary';
export { parentHome, parentMembers, parentRoutes, parentSummary } from './parentSummary';

export interface ParentAgencyPageData extends AgencyPageData {
  /** The members as the area pages' agency table ("Services"), each with its own routes. */
  services: AgencyGroupData;
}

/**
 * A parent's page: the agency page of its summary, under its own name and path, with its members listed. Members with
 * no regular midday service still count in its numbers and are listed, as on its own agency page (CIV-965).
 */
export function parentAgencyPageData(
  parent: ParentAgency,
  all: readonly AgencyPageSummary[],
  releaseDate: string | null = null,
  area?: Parameters<typeof agencyPageData>[3],
  areaMembers?: readonly AgencyPageSummary[],
): ParentAgencyPageData | null {
  const members = parentMembers(parent, all);
  if (members.length === 0) return null;
  const summary = parentSummary(parent, members);
  const data = agencyPageData(summary, all, releaseDate, area, areaMembers, { title: parent.name, members });
  return { ...data, services: agencyGroupData(members, new Map(all.map(a => [a.slug, a])), releaseDate) };
}

/** Parents with at least one member in this list, in config order. */
export function parentsWithMembers(all: readonly Pick<AgencyPageSummary, 'parentAgency'>[]): ParentAgency[] {
  return PARENT_AGENCIES.filter(p => all.some(a => a.parentAgency === p.slug));
}
