import { useMemo } from 'react';
import { useAgencies } from './useAgencies';
import { agencyNames } from '../utils/agencyName';
import { agencyPageH1 } from '../../shared/agencyPages';
import { AGENCY_NOT_FOUND, LOADING_LABEL } from '../content/noticeCopy';

/**
 * The agency's names for Live pages, from the agency registry: `name` is the short name for back links, subtitles and
 * route titles ("TTC", "Capital Metro"), as the map's cards name it; `title` is the page title, the same one the map's
 * agency page uses ("Toronto Transit Commission", agencyPageH1, CIV-1448). Until the registry loads, or for a slug it
 * does not list, `name` is the slug as written in the address (never upper-cased: CIV-1117), since it sits inside
 * sentences; `title` stands alone, so it reads "Loading…" while the registry loads and "This agency couldn’t be found."
 * (N30) when the slug isn't in it (CIV-1795).
 */
export function useLiveAgencyNames(slug: string): { name: string; title: string } {
  const { agencies, agenciesLoadState } = useAgencies();
  return useMemo(() => {
    const agency = agencies.find(a => a.slug === slug);
    if (agency) return { name: agencyNames(agency).name, title: agencyPageH1(agency) };
    return { name: slug, title: agenciesLoadState === 'loading' ? LOADING_LABEL : AGENCY_NOT_FOUND };
  }, [agencies, agenciesLoadState, slug]);
}

/** The agency's short name for a Live page ("TTC"): `useLiveAgencyNames(slug).name`. */
export function useLiveAgencyName(slug: string): string {
  return useLiveAgencyNames(slug).name;
}
