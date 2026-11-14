import { useMemo } from 'react';
import { useAgencies } from './useAgencies';
import { agencyNames } from '../utils/agencyName';
import { agencyPageH1 } from '../../shared/agencyPages';

/**
 * The agency's names for Live pages, from the agency registry: `name` is the short name for back links, subtitles and
 * route titles ("TTC", "Capital Metro"), as the map's cards name it; `title` is the page title, the same one the map's
 * agency page uses ("Toronto Transit Commission", agencyPageH1, CIV-1448). Until the registry loads, or for a slug it
 * does not list, both are the slug as written in the address (never upper-cased: CIV-1117).
 */
export function useLiveAgencyNames(slug: string): { name: string; title: string } {
  const { agencies } = useAgencies();
  return useMemo(() => {
    const agency = agencies.find(a => a.slug === slug);
    return agency ? { name: agencyNames(agency).name, title: agencyPageH1(agency) } : { name: slug, title: slug };
  }, [agencies, slug]);
}

/** The agency's short name for a Live page ("TTC"): `useLiveAgencyNames(slug).name`. */
export function useLiveAgencyName(slug: string): string {
  return useLiveAgencyNames(slug).name;
}
