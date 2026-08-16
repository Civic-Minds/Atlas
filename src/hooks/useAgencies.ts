import { useCallback, useEffect, useState } from 'react';
import type { Agency } from '../App';
import { BETA_BUILD, getAgencyArtifactUrls } from '../../shared/config';

export type AgenciesLoadState = 'loading' | 'ready' | 'error';

/** Loads and enriches the agency registry (public/data/index.json). Shared by App and any
 * standalone page (e.g. Diagnostics) that needs the same agency list without the rest of
 * App's state (live vehicles, history, feed-refresh banner, etc). */
export function useAgencies() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agenciesLoadState, setAgenciesLoadState] = useState<AgenciesLoadState>('loading');

  const load = useCallback(() => {
    setAgenciesLoadState('loading');
    fetch('/data/index.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { agencies: Agency[] }) => {
        const enriched = data.agencies
          .filter((a: Agency) => !a.staged && (!a.hiddenInProduction || import.meta.env.DEV || (BETA_BUILD && a.betaOnly)))
          .map((a: Agency) => {
            if (!a.url) {
              const arts = getAgencyArtifactUrls(a.slug);
              return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
            }
            return a;
          });
        setAgencies(enriched);
        setAgenciesLoadState('ready');
      })
      .catch(() => setAgenciesLoadState('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { agencies, agenciesLoadState, retry: load };
}
