// The map's own default view, [lat, lon], so MapLibre's [lon, lat] swaps it (CIV-1812).
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../../shared/rules/limits';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapZoomButtons from '../MapZoomButtons';
import { MAP_CONTROLS_SLOT, Z_PANEL } from '../../styles';
import { getMapStyle } from '../../lib/mapStyle';
import PageMapLayer from '../Interval/map/PageMapLayer';
import type { PageMapOverlay } from '../../context/PageMapOverlay';

export type { MapPick, MapLine, MapLayer } from '../../context/PageMapOverlay';

interface Props extends PageMapOverlay {
  className?: string;
  /** The map's accessible name. */
  ariaLabel?: string;
}

/**
 * The Live tool page's own map, on the Atlas basemap. What it draws, how picks work and how it frames are PageMapLayer's,
 * the same drawing Studio's pages put on the main map (CIV-1828); this only makes the map and its zoom buttons.
 */
export default function MapAppMap({ className = '', ariaLabel = 'Map of the route, coloured by the chosen measure', ...overlay }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState<maplibregl.Map | null>(null);
  const [light] = useState(() => document.documentElement.getAttribute('data-theme') !== 'dark');

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({ container: box.current, style: getMapStyle(light), center: [DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]], zoom: DEFAULT_MAP_ZOOM, attributionControl: false });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __routeMap?: maplibregl.Map }).__routeMap = map;
    map.on('load', () => setLoaded(map));
    const ro = new ResizeObserver(() => { if (!map.isMoving()) map.resize(); });
    ro.observe(box.current);
    return () => { ro.disconnect(); setLoaded(null); map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`.trim()}>
      <div ref={box} className="h-full w-full" role="img" aria-label={ariaLabel} />
      {/* Phones zoom by pinching, so the + and − buttons show only from sm up, as on the regular map. */}
      <div className={`${MAP_CONTROLS_SLOT} ${Z_PANEL} pointer-events-auto max-sm:hidden`}>
        <MapZoomButtons onZoomIn={() => mapRef.current?.zoomIn({ duration: 200 })} onZoomOut={() => mapRef.current?.zoomOut({ duration: 200 })} />
      </div>
      <PageMapLayer map={loaded} light={light} {...overlay} />
    </div>
  );
}
