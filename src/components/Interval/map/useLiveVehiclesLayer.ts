import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, TextLayer } from 'deck.gl';
import { getTierColor } from '../../../hooks/useIntervalStats';
import { useLiveVehiclesMapOverlay } from '../../../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';
import { cleanRouteShortName } from '../../../utils/format';
import { escapeHtml } from '../../../lib/escapeHtml';

/** Exported for unit tests — GTFS-RT text must be escaped before innerHTML. */
export function vehicleTooltipHtml(v: LiveVehicle): string | null {
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
  const routeLabel = escapeHtml(cleanRouteShortName(v.routeShortName));
  const headsign = v.headsign ? escapeHtml(v.headsign) : '';
  const speed = v.speedKmh != null ? escapeHtml(String(v.speedKmh)) : null;
  return `
    <div style="font-family:'Inter',ui-sans-serif,sans-serif;padding:8px 10px;min-width:130px;line-height:1.4;">
      <div style="font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:0.4px;text-transform:uppercase;">Route ${routeLabel}</div>
      ${headsign ? `<div style="font-size:11px;font-weight:700;color:var(--text-primary);margin-top:2px;">${headsign}</div>` : ''}
      ${speed != null ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Speed</span><span style="font-size:10px;font-weight:800;color:var(--text-primary);">${speed} km/h</span></div>` : ''}
      ${label ? `<div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-primary);padding-top:5px;margin-top:6px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Status</span><span style="font-size:10px;font-weight:800;color:${color};">${label}</span></div>` : ''}
    </div>`;
}

/** Live vehicle map layers: deck.gl vehicle markers, hover tooltip, route shape, and camera moves. */
export function useLiveVehiclesLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  deckOverlayRef: React.RefObject<MapboxOverlay | null>,
  mapLoaded: boolean,
) {
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();
  const liveFittedRouteRef = useRef<string | null>(null);

  // Live vehicles — GPU-rendered via Deck.gl
  useEffect(() => {
    const deck = deckOverlayRef.current;
    if (!deck || !mapLoaded) return;

    const vehicles = (liveOverlay?.vehicles ?? []).filter(v => v.lat && v.lon);
    const focusedId = liveOverlay?.focusedVehicle?.id ?? null;
    // At city scale, one label per vehicle turns the live overview into a wall
    // of overlapping route numbers. Keep labels for the selected route only;
    // markers and hover tooltips remain available everywhere.
    const labelVehicles = liveOverlay?.selectedRouteKey ? vehicles : [];

    const statusRgb: Record<string, [number, number, number]> = {
      on_time: [56, 161, 105],
      early:   [49, 130, 206],
      late:    [229,  62,  62],
      no_data: [113, 128, 150],
    };

    deck.setProps({
      layers: [
        // Outer ring (focus highlight)
        new ScatterplotLayer({
          id: 'vehicles-focus-ring',
          data: vehicles.filter(v => v.id === focusedId),
          getPosition: (v: typeof vehicles[0]) => [v.lon, v.lat],
          getRadius: 11,
          getFillColor: [255, 255, 255, 80],
          stroked: false,
          radiusUnits: 'pixels',
        }),
        // Vehicle dots — pickable for the manual hover tooltip (pickObject below)
        new ScatterplotLayer({
          id: 'vehicles-dots',
          data: vehicles,
          getPosition: (v: typeof vehicles[0]) => [v.lon, v.lat],
          getRadius: (v: typeof vehicles[0]) => v.id === focusedId ? 9 : 7,
          getFillColor: (v: typeof vehicles[0]) => statusRgb[v.status] ?? statusRgb.no_data,
          stroked: true,
          getLineColor: [255, 255, 255, 200],
          getLineWidth: 1.5,
          lineWidthUnits: 'pixels',
          radiusUnits: 'pixels',
          pickable: true,
        }),
        // Route short name labels
        new TextLayer({
          id: 'vehicles-labels',
          data: labelVehicles,
          getPosition: (v: typeof vehicles[0]) => [v.lon, v.lat],
          getText: (v: typeof vehicles[0]) => cleanRouteShortName(v.routeShortName) ?? '',
          getSize: 9,
          getColor: [255, 255, 255, 230],
          fontWeight: 800,
          fontFamily: '"Inter", ui-sans-serif, sans-serif',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          billboard: true,
        }),
      ],
    });
  }, [liveOverlay, mapLoaded]);

  // Deck.gl's canvas sits above MapLibre; if it ever receives pointer events it
  // swallows map pan/zoom across the whole viewport. Keep it inert always — the
  // tooltip below picks manually through MapLibre's own events instead.
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
  }, [mapLoaded]);

  // Vehicle hover tooltip — manual deck picking driven by MapLibre mouse events,
  // so the deck canvas can stay pointer-events:none (see effect above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

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
        // Generous radius: deck pick radius scales with devicePixelRatio on retina
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
  }, [mapLoaded]);

  // Live route dynamic shape overlay
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
            color: getTierColor((f.properties as any)?.tier ?? null)
          }
        }))
      });

      if (routeKey && liveFittedRouteRef.current !== routeKey) {
        liveFittedRouteRef.current = routeKey;
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        features.forEach(f => {
          const geom = f.geometry as any;
          const coords = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
          coords.forEach(([lng, lat]: [number, number]) => {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          });
        });
        if (minLng < maxLng) {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 120, bottom: 120, left: 320, right: 80 }, maxZoom: 14 });
        }
      }
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
      // Only reset the fit-ref when the route key actually changes/clears, not on every empty render
      if (!routeKey) liveFittedRouteRef.current = null;
    }
  }, [liveOverlay?.routeFeatures, liveOverlay?.selectedRouteKey, mapLoaded]);

  // Focus vehicle centering — skip if route shape fit will handle positioning
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !liveOverlay?.focusedVehicle) return;
    if (liveOverlay.routeFeatures && liveOverlay.routeFeatures.length > 0) return;

    const { lat, lon } = liveOverlay.focusedVehicle;
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14) });
  }, [liveOverlay?.focusedVehicle, liveOverlay?.routeFeatures, mapLoaded]);

  // Coverage-area fly — live panel requests a jump to an agency's bbox (place list click)
  useEffect(() => {
    const map = mapRef.current;
    const area = liveOverlay?.focusArea;
    if (!map || !mapLoaded || !area) return;
    const [w, s, e, n] = area.bounds;
    const cam = map.cameraForBounds([[w, s], [e, n]], { padding: 64 });
    if (!cam) return;
    map.flyTo({ center: cam.center, zoom: Math.max(cam.zoom ?? 0, area.minZoom ?? 0) });
  }, [liveOverlay?.focusArea, mapLoaded]);
}
