import type * as maplibregl from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { useLiveVehiclesLayer } from './useLiveVehiclesLayer';

interface LiveVehiclesLayerProps {
  mapRef: React.RefObject<maplibregl.Map | null>;
  deckOverlayRef: React.RefObject<MapboxOverlay | null>;
  mapLoaded: boolean;
}

/** Lazily mounted so the frequency map does not load the Live/Deck.gl graph up front. */
export default function LiveVehiclesLayer({ mapRef, deckOverlayRef, mapLoaded }: LiveVehiclesLayerProps) {
  useLiveVehiclesLayer(mapRef, deckOverlayRef, mapLoaded);
  return null;
}
