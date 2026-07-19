import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { getTierColor } from '../../../hooks/useIntervalStats';
import { useLiveVehiclesMapOverlay } from '../../../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';
import { cleanRouteShortName } from '../../../utils/format';
import { liveVehiclesFingerprint } from '../../../utils/liveVehiclesFingerprint';

function vehicleTooltipHtml(v: LiveVehicle): string | null {
  if (!v.routeShortName) return null;
  const delayMin = v.delayMin;
  const label = delayMin === null ? null
    : delayMin <= -1.5 ? `${Math.round(Math.abs(delayMin))}m early`
    : delayMin >= 5.5  ? `${Math.round(delayMin)}m late`
    : 'On time';
  const statusColor: Record<string, string> = {
    on_time: '#38a169', early: '#3182ce', late: '#e53e3e', no_data: '#718096',
  };
  const color = statusColor[v.status] ?? statusColor.no_data;
  return `
    <div style="font-family:'Inter',ui-sans-serif,sans-serif;padding:8px 10px;min-width:130px;line-height:1.4;">
      <div style="font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:0.4px;text-transform:uppercase;">Route ${cleanRouteShortName(v.routeShortName)}</div>
      ${v.headsign ? `<div style="font-size:11px;font-weight:700;color:var(--text-primary);margin-top:2px;">${v.headsign}</div>` : ''}
      ${v.speedKmh != null ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Speed</span><span style="font-size:10px;font-weight:800;color:var(--text-primary);">${v.speedKmh} km/h</span></div>` : ''}
      ${label ? `<div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-primary);padding-top:5px;margin-top:6px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Status</span><span style="font-size:10px;font-weight:800;color:${color};">${label}</span></div>` : ''}
    </div>`;
}

const statusRgb: Record<string, [number, number, number]> = {
  on_time: [56, 161, 105],
  early:   [49, 130, 206],
  late:    [229,  62,  62],
  no_data: [113, 128, 150],
};

/**
 * Live vehicle map layers: deck.gl is dynamically imported only when Live is
 * active so Frequency Map doesn't pay the deck bundle cost up front.
 */
export function useLiveVehiclesLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  deckOverlayRef: React.RefObject<MapboxOverlay | null>,
  mapLoaded: boolean,
) {
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();
  const liveFittedRouteRef = useRef<string | null>(null);
  const lastDeckFpRef = useRef('');
  const deckEnsurePromiseRef = useRef<Promise<MapboxOverlay | null> | null>(null);

  // Lazily attach MapboxOverlay the first time Live has vehicles to show.
  async function ensureDeckOverlay(): Promise<MapboxOverlay | null> {
    if (deckOverlayRef.current) return deckOverlayRef.current;
    if (deckEnsurePromiseRef.current) return deckEnsurePromiseRef.current;
    const map = mapRef.current;
    if (!map) return null;

    deckEnsurePromiseRef.current = (async () => {
      const { MapboxOverlay } = await import('@deck.gl/mapbox');
      if (deckOverlayRef.current) return deckOverlayRef.current;
      if (!mapRef.current) return null;
      const deckOverlay = new MapboxOverlay({
        interleaved: false,
        layers: [],
      });
      mapRef.current.addControl(deckOverlay as unknown as maplibregl.IControl);
      deckOverlayRef.current = deckOverlay;
      if (import.meta.env.DEV) {
        (window as unknown as { __deckOverlay?: MapboxOverlay }).__deckOverlay = deckOverlay;
      }
      return deckOverlay;
    })();

    try {
      return await deckEnsurePromiseRef.current;
    } finally {
      deckEnsurePromiseRef.current = null;
    }
  }

  // Live vehicles — GPU-rendered via Deck.gl (dynamic import)
  useEffect(() => {
    if (!mapLoaded) return;

    // Live closed: clear layers if overlay exists; don't load deck just to clear.
    if (!liveOverlay) {
      lastDeckFpRef.current = '';
      if (deckOverlayRef.current) {
        deckOverlayRef.current.setProps({ layers: [] });
      }
      return;
    }

    const vehicles = (liveOverlay.vehicles ?? []).filter(v => v.lat && v.lon);
    const focusedId = liveOverlay.focusedVehicle?.id ?? null;
    const labelVehicles = liveOverlay.selectedRouteKey ? vehicles : [];
    const fp = `${liveVehiclesFingerprint(vehicles)}|${focusedId ?? ''}|${liveOverlay.selectedRouteKey ?? ''}|${labelVehicles.length}`;
    if (fp === lastDeckFpRef.current && deckOverlayRef.current) return;

    let cancelled = false;
    (async () => {
      const deck = await ensureDeckOverlay();
      if (cancelled || !deck) return;

      const { ScatterplotLayer, TextLayer } = await import('deck.gl');
      if (cancelled) return;

      lastDeckFpRef.current = fp;
      deck.setProps({
        layers: [
          new ScatterplotLayer({
            id: 'vehicles-focus-ring',
            data: vehicles.filter(v => v.id === focusedId),
            getPosition: (v: LiveVehicle) => [v.lon, v.lat],
            getRadius: 11,
            getFillColor: [255, 255, 255, 80],
            stroked: false,
            radiusUnits: 'pixels',
            updateTriggers: { data: focusedId },
          }),
          new ScatterplotLayer({
            id: 'vehicles-dots',
            data: vehicles,
            getPosition: (v: LiveVehicle) => [v.lon, v.lat],
            getRadius: (v: LiveVehicle) => (v.id === focusedId ? 9 : 7),
            getFillColor: (v: LiveVehicle) => statusRgb[v.status] ?? statusRgb.no_data,
            stroked: true,
            getLineColor: [255, 255, 255, 200],
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels',
            radiusUnits: 'pixels',
            pickable: true,
            updateTriggers: {
              getRadius: focusedId,
              getFillColor: fp,
              data: fp,
            },
          }),
          new TextLayer({
            id: 'vehicles-labels',
            data: labelVehicles,
            getPosition: (v: LiveVehicle) => [v.lon, v.lat],
            getText: (v: LiveVehicle) => cleanRouteShortName(v.routeShortName) ?? '',
            getSize: 9,
            getColor: [255, 255, 255, 230],
            fontWeight: 800,
            fontFamily: '"Inter", ui-sans-serif, sans-serif',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            billboard: true,
            updateTriggers: { data: fp },
          }),
        ],
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [liveOverlay, mapLoaded, mapRef, deckOverlayRef]);

  // Deck.gl's canvas sits above MapLibre; keep it inert always.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const syncPointerEvents = () => {
      for (const el of map.getContainer().querySelectorAll<HTMLElement>('canvas')) {
        if (el.classList.contains('maplibregl-canvas')) continue;
        el.style.pointerEvents = 'none';
      }
    };
    syncPointerEvents();
    const obs = new MutationObserver(syncPointerEvents);
    obs.observe(map.getContainer(), { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [mapLoaded, mapRef, liveOverlay]);

  // Vehicle hover tooltip — manual deck picking driven by MapLibre mouse events.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !liveOverlay) return;

    const container = map.getContainer();
    const tip = document.createElement('div');
    tip.className = 'live-vehicle-tip';
    tip.style.cssText = [
      'position:absolute', 'z-index:30', 'pointer-events:none', 'display:none',
      'background:var(--bg-panel)', 'backdrop-filter:blur(12px)', '-webkit-backdrop-filter:blur(12px)',
      'border-radius:1rem', 'box-shadow:0 25px 50px -12px rgba(0,0,0,0.25)',
      'border:1px solid var(--border-primary)', 'color:var(--text-primary)',
    ].join(';');
    container.appendChild(tip);

    let raf = 0;
    const hide = () => {
      tip.style.display = 'none';
      if (map.getCanvas().style.cursor === 'pointer') map.getCanvas().style.cursor = '';
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const deck = deckOverlayRef.current;
        if (!deck) return hide();
        const info = deck.pickObject({ x: e.point.x, y: e.point.y, radius: 16, layerIds: ['vehicles-dots'] });
        const html = info?.object ? vehicleTooltipHtml(info.object as LiveVehicle) : null;
        if (html) {
          tip.innerHTML = html;
          tip.style.left = `${e.point.x + 12}px`;
          tip.style.top = `${e.point.y + 12}px`;
          tip.style.display = 'block';
          map.getCanvas().style.cursor = 'pointer';
        } else {
          hide();
        }
      });
    };
    map.on('mousemove', onMove);
    map.on('mouseout', hide);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      map.off('mousemove', onMove);
      map.off('mouseout', hide);
      tip.remove();
    };
  }, [mapLoaded, mapRef, deckOverlayRef, liveOverlay]);

  // Live route dynamic shape overlay (MapLibre GeoJSON — not deck)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('live-route-shape') as maplibregl.GeoJSONSource;
    if (!source) return;

    const features = liveOverlay?.routeFeatures ?? [];
    const routeKey = liveOverlay?.selectedRouteKey ?? null;

    if (features.length > 0) {
      source.setData({
        type: 'FeatureCollection',
        features: features.map(f => ({
          ...f,
          properties: {
            ...f.properties,
            color: getTierColor((f.properties as { tier?: string | null } | null)?.tier ?? null),
          },
        })),
      });

      if (routeKey && liveFittedRouteRef.current !== routeKey) {
        liveFittedRouteRef.current = routeKey;
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        features.forEach(f => {
          const geom = f.geometry as { type: string; coordinates: number[][] | number[][][] };
          const coords =
            geom.type === 'LineString' ? (geom.coordinates as number[][])
            : geom.type === 'MultiLineString' ? (geom.coordinates as number[][][]).flat()
            : [];
          for (const [lng, lat] of coords) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        });
        if (minLng < maxLng) {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
            padding: { top: 120, bottom: 120, left: 320, right: 80 },
            maxZoom: 14,
          });
        }
      }
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
      if (!routeKey) liveFittedRouteRef.current = null;
    }
  }, [liveOverlay?.routeFeatures, liveOverlay?.selectedRouteKey, mapLoaded, mapRef]);

  // Focus vehicle centering — skip if route shape fit will handle positioning
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !liveOverlay?.focusedVehicle) return;
    if (liveOverlay.routeFeatures && liveOverlay.routeFeatures.length > 0) return;

    const { lat, lon } = liveOverlay.focusedVehicle;
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14) });
  }, [liveOverlay?.focusedVehicle, liveOverlay?.routeFeatures, mapLoaded, mapRef]);

  // Coverage-area fly — live panel requests a jump to an agency's bbox (place list click)
  useEffect(() => {
    const map = mapRef.current;
    const area = liveOverlay?.focusArea;
    if (!map || !mapLoaded || !area) return;
    const [w, s, e, n] = area.bounds;
    const cam = map.cameraForBounds([[w, s], [e, n]], { padding: 64 });
    if (!cam) return;
    map.flyTo({ center: cam.center, zoom: Math.max(cam.zoom ?? 0, area.minZoom ?? 0) });
  }, [liveOverlay?.focusArea, mapLoaded, mapRef]);
}
