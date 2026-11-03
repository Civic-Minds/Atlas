/**
 * CIV-1277: the parent agencies (config/parent-agencies.json), each an agency split across feeds that shows as one on its
 * own page, the map's agency picker and the agency list. Members name theirs with `parentAgency`. Imports only the list,
 * so the map bundle can group by it.
 */
import parentAgencyList from '../config/parent-agencies.json';

export interface ParentAgency { slug: string; name: string; websiteUrl?: string }
export const PARENT_AGENCIES: readonly ParentAgency[] = parentAgencyList;

export function parentAgency(slug: string | undefined): ParentAgency | undefined {
  return slug ? PARENT_AGENCIES.find(p => p.slug === slug) : undefined;
}
