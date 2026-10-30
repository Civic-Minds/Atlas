import { useEffect, useMemo, useState } from 'react';
import type { ViewportBounds } from './useIntervalStats';
import type { SearchRoutesFile, SearchStopsFile } from '../../shared/searchIndex';
import { loadSearchRoutes, loadSearchStops } from '../lib/searchIndex';
import { searchIndexRouteResults, searchIndexStopResults, type RouteSearchResult, type StopSearchResult } from '../utils/searchResults';

/**
 * Route and stop matches from the every-agency search index (CIV-1048), limited to the agencies
 * the app lists. `pending` is true while the files for the current query are still loading.
 */
export function useIndexSearch(
  query: string,
  bounds: ViewportBounds | null,
  agencyNames: ReadonlyMap<string, string>,
): { routes: RouteSearchResult[]; stops: StopSearchResult[]; pending: boolean } {
  const q = query.trim();
  const [routesFile, setRoutesFile] = useState<SearchRoutesFile | null | undefined>(undefined);
  const [stops, setStops] = useState<{ query: string; file: SearchStopsFile | null } | null>(null);

  // One letter matches too much to be worth the routes file; it loads from the second.
  useEffect(() => {
    if (q.length < 2 || routesFile !== undefined) return;
    let live = true;
    loadSearchRoutes().then(file => { if (live) setRoutesFile(file); });
    return () => { live = false; };
  }, [q, routesFile]);

  useEffect(() => {
    if (!q) return;
    let live = true;
    loadSearchStops(q).then(file => { if (live) setStops({ query: q, file }); });
    return () => { live = false; };
  }, [q]);

  const nameOf = useMemo(() => (slug: string) => agencyNames.get(slug) ?? null, [agencyNames]);
  const routes = useMemo(
    () => (q && routesFile ? searchIndexRouteResults(routesFile, q, bounds, nameOf) : []),
    [q, routesFile, bounds, nameOf],
  );
  const stopFile = stops?.query === q ? stops.file : null;
  const stopResults = useMemo(
    () => (q && stopFile ? searchIndexStopResults(stopFile, q, bounds, nameOf) : []),
    [q, stopFile, bounds, nameOf],
  );
  const pending = !!q && ((q.length >= 2 && routesFile === undefined) || stops?.query !== q);
  return { routes, stops: stopResults, pending };
}
