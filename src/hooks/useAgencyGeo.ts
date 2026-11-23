import { useEffect, useState } from 'react';
import { useAgencies } from './useAgencies';
import { fetchAgencyGeo, getCachedAgencyGeo } from '../lib/agencyGeo';

const GEO_TRIES = 5;
const GEO_RETRY_MS = 15_000;

/**
 * An agency's route shapes, as the main map loads them: the map's copy when it has one, else fetched. A load that fails
 * (a big agency timing out while the map loads it too) is tried again, as the map retries its own. Undefined until loaded.
 * Shared by Studio's Live route panel (CIV-2021) and Studio Live's route colours (CIV-2191).
 */
export function useAgencyGeo(slug: string): GeoJSON.FeatureCollection | undefined {
  const { agencies } = useAgencies();
  const [layer, setLayer] = useState<{ slug: string; fc: GeoJSON.FeatureCollection } | null>(() => {
    const fc = getCachedAgencyGeo(slug);
    return fc ? { slug, fc } : null;
  });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    const agency = agencies.find(a => a.slug === slug);
    if (!agency || layer?.slug === slug) return;
    let live = true;
    let retry: number | undefined;
    fetchAgencyGeo({ slug: agency.slug, name: agency.name, url: agency.url ?? '', betaOnly: agency.betaOnly })
      .then(fc => { if (live) setLayer({ slug, fc }); })
      .catch(() => { if (live && tries < GEO_TRIES) retry = window.setTimeout(() => setTries(t => t + 1), GEO_RETRY_MS); });
    return () => { live = false; window.clearTimeout(retry); };
  }, [slug, agencies, layer?.slug, tries]);
  return layer?.slug === slug ? layer.fc : undefined;
}
