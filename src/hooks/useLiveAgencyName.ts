import { useMemo } from 'react';
import { useAgencies } from './useAgencies';
import { agencyNames } from '../utils/agencyName';

/**
 * The agency's short name for a Live page title and back link ("TTC", "Capital Metro"), from the agency
 * registry, as the map's cards name it. Until the registry loads, or for a slug it does not list, the slug
 * as written in the address (never upper-cased: CIV-1117).
 */
export function useLiveAgencyName(slug: string): string {
  const { agencies } = useAgencies();
  return useMemo(() => {
    const agency = agencies.find(a => a.slug === slug);
    return agency ? agencyNames(agency).name : slug;
  }, [agencies, slug]);
}
