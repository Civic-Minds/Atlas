import { useCallback, useEffect, useState } from 'react';
import type { Agency } from '../App';
import { getAgencyArtifactUrls, getAgencyCatalogUrl, ATLAS_MODE } from '../../shared/config';
import { isAgencyVisibleInBrowser } from '../../shared/agencyVisibility';
import { markAtlasOnce } from '../lib/performance';

export type AgenciesLoadState = 'loading' | 'ready' | 'error';

/** Fill in R2 artifact URLs for catalog entries that don't carry their own. */
export function withArtifactUrls(a: Agency): Agency {
  if (a.url) return a;
  const arts = getAgencyArtifactUrls(a.slug, { betaOnly: a.betaOnly });
  return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
}

/** The agency catalog as the browser shows it: the agencies visible in this build, with their artifact URLs. */
export async function loadAgencyCatalog(): Promise<Agency[]> {
  const r = await fetch(getAgencyCatalogUrl());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json() as { agencies: Agency[] };
  return data.agencies
    .filter((a: Agency) => isAgencyVisibleInBrowser(a, { mode: ATLAS_MODE }))
    .map(withArtifactUrls);
}

/** Loads and enriches the agency registry (public/data/index.json). Shared by App and any
 * standalone page (e.g. Diagnostics) that needs the same agency list without the rest of
 * App's state (live vehicles, history, feed-refresh banner, etc). */
export function useAgencies() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agenciesLoadState, setAgenciesLoadState] = useState<AgenciesLoadState>('loading');

  const load = useCallback(() => {
    setAgenciesLoadState('loading');
    loadAgencyCatalog()
      .then(list => {
        setAgencies(list);
        markAtlasOnce('agency-catalog-ready');
        setAgenciesLoadState('ready');
      })
      .catch(() => setAgenciesLoadState('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { agencies, agenciesLoadState, retry: load };
}
