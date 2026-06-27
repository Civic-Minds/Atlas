import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import * as L from 'leaflet';
import { routeKey } from '../../hooks/useIntervalStats';
import { getAgencyBounds, getRegionalView, saveView } from '../../utils/regionView';
import type { Agency } from '../../App';
import type { AgencyLayers, ViewportBounds } from '../../hooks/useIntervalStats';

export function MapRefCapturer({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  mapRef.current = map;
  return null;
}

export function MapClickHandler({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}

export function LocateControl({ onLocate }: { onLocate?: (lat: number, lon: number) => void }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (btnRef.current) L.DomEvent.disableClickPropagation(btnRef.current);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.flyTo([coords.latitude, coords.longitude], 14, { duration: 1.2 });
        onLocate?.(coords.latitude, coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000 }
    );
  }, [map, locating, onLocate]);

  return (
    <button
      ref={btnRef}
      onClick={locate}
      aria-label="Go to my location"
      style={{ position: 'absolute', bottom: 24, right: 12, zIndex: 1000 }}
      className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors"
    >
      <LocateFixed className={`w-4 h-4 ${locating ? 'animate-pulse text-[var(--accent)]' : ''}`} />
    </button>
  );
}

export function ResetViewControl({ resetKey, agencies }: { resetKey?: number; agencies: Agency[] }) {
  const map = useMap();
  const prevKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== prevKey.current) {
      prevKey.current = resetKey;
      const bounds = getAgencyBounds(agencies);
      if (bounds) {
        map.flyToBounds(bounds, { padding: [64, 64], maxZoom: 9, duration: 1.8 });
      } else {
        const { center, zoom } = getRegionalView(agencies);
        map.flyTo(center, zoom, { duration: 1.8 });
      }
    }
  }, [map, resetKey, agencies]);
  return null;
}

export function RouteZoomer({ selectedRoute, layers }: { selectedRoute: string | null; layers: AgencyLayers }) {
  const map = useMap();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedRoute || selectedRoute === prev.current) {
      prev.current = selectedRoute;
      return;
    }
    prev.current = selectedRoute;

    const coords: [number, number][] = [];
    Object.values(layers).forEach((fc) => {
      fc.features.forEach((f) => {
        if (f.geometry.type === 'Point') return;
        const p = f.properties as any;
        if (routeKey(p) !== selectedRoute) return;

        const geom = f.geometry as any;
        if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
          coords.push(...(geom.coordinates as [number, number][]));
        } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
          for (const line of geom.coordinates as [number, number][][]) {
            if (Array.isArray(line)) coords.push(...line);
          }
        }
      });
    });

    if (coords.length < 2) return;

    const bounds = L.latLngBounds(coords.map(([lng, lat]) => [lat, lng]));
    if (!bounds.isValid()) return;

    const current = map.getBounds();
    const alreadyVisible =
      current.contains(bounds.getSouthWest()) && current.contains(bounds.getNorthEast());

    if (!alreadyVisible) {
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 14, duration: 0.9 });
    }
  }, [selectedRoute, layers, map]);

  return null;
}

export function ViewPersistor() {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      saveView(c.lat, c.lng, map.getZoom());
    },
  });
  return null;
}

export function GeolocateOnMount({ skip }: { skip: boolean }) {
  const map = useMap();
  const didRun = useRef(false);
  useEffect(() => {
    if (skip || didRun.current || !navigator.geolocation) return;
    didRun.current = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        try { map.flyTo([coords.latitude, coords.longitude], 12, { duration: 1.2 }); } catch { /* map unmounted */ }
      },
      () => {},
      { timeout: 8000 }
    );
  }, [map, skip]);
  return null;
}

export function BoundsReporter({ onBoundsChange, onZoomChange }: {
  onBoundsChange: (b: ViewportBounds) => void;
  onZoomChange: (z: number) => void;
}) {
  const map = useMap();
  const report = useCallback(() => {
    const b = map.getBounds();
    onBoundsChange({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
    onZoomChange(map.getZoom());
  }, [map, onBoundsChange, onZoomChange]);
  useMapEvents({ moveend: report, zoomend: report });
  useEffect(() => { report(); }, [report]);
  return null;
}
