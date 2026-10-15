import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ViewportBounds } from '../../../hooks/useIntervalStats';
import { saveView } from '../../../utils/regionView';
import { syncUrlParams } from '../../../utils/syncUrlParams';

/**
 * After every move: the zoom state, the saved view and the URL's lat/lon/z (main map only), and
 * the new bounds for agency loading.
 */
export function useViewSync(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  { setZoom, secondaryRef, onBoundsChangeRef, setBoundsAndZoom }: {
    setZoom: (zoom: number) => void;
    secondaryRef: React.RefObject<boolean>;
    onBoundsChangeRef: React.RefObject<(b: ViewportBounds, zoom?: number) => void>;
    setBoundsAndZoom: (bounds: ViewportBounds, zoom: number) => void;
  },
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onMove = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      setZoom(z);
      // The compare-mode second map follows the first one; only the first owns the URL view.
      if (!secondaryRef.current) {
        saveView(c.lat, c.lng, z);
        // Shared merge reads window.location at call time so concurrent writers
        // (day/route/filters) and React Router path switches don't clobber params.
        syncUrlParams({
          lat: c.lat.toFixed(5),
          lon: c.lng.toFixed(5),
          z: z.toFixed(2),
        });
      }
      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChangeRef.current(bounds, z);
      setBoundsAndZoom(bounds, z);
    };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [mapLoaded]);
}
