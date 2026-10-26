import { useCallback, useEffect, useRef } from 'react';
import { historyRouteFromRouteKey } from '../utils/historyOpen';
import { splitRouteKey } from '../utils/routeKey';

type Layers = Record<string, { features: readonly { properties?: { routeId?: unknown; routeShortName?: unknown } | null }[] }>;

/**
 * A regular map route link (route=agency::routeId) opens that route in History too, read through the
 * agency's loaded map routes (#1028 item 24). History's own links (agency, hroute, rq, rmode) win.
 * The key is read as History opens: the map drops its route param once it leaves the frequency view,
 * and the tab switch drops the URL's params, so `noteHistorySwitch` keeps the map's route at the click.
 * The agency opens at once (its map routes may not be loaded: the map can be elsewhere, and opening
 * the agency brings it there); the route follows once they load.
 */
export function useHistoryRouteLink({ inHistory, layers, openRoute }: {
  inHistory: boolean;
  layers: Layers;
  openRoute: (target: { slug: string; routeShortName: string }) => void;
}) {
  const pendingKeyRef = useRef<string | null>(null);
  const routeAtSwitchRef = useRef<string | null>(null);
  const wasInHistoryRef = useRef(false);

  const noteHistorySwitch = useCallback(() => {
    routeAtSwitchRef.current = new URLSearchParams(window.location.search).get('route');
  }, []);

  useEffect(() => {
    if (inHistory && !wasInHistoryRef.current) {
      const params = new URLSearchParams(window.location.search);
      pendingKeyRef.current = params.get('agency') ? null : (params.get('route') ?? routeAtSwitchRef.current);
      routeAtSwitchRef.current = null;
      const linkedSlug = pendingKeyRef.current ? splitRouteKey(pendingKeyRef.current).agencySlug : '';
      if (linkedSlug) openRoute({ slug: linkedSlug, routeShortName: '' });
    }
    wasInHistoryRef.current = inHistory;
    const key = pendingKeyRef.current;
    if (!inHistory || !key) return;
    const layer = layers[splitRouteKey(key).agencySlug];
    if (!layer) return; // waits for the agency's map data
    pendingKeyRef.current = null;
    const target = historyRouteFromRouteKey(key, layer.features);
    if (target) openRoute(target);
  }, [inHistory, layers, openRoute]);

  return { noteHistorySwitch };
}
