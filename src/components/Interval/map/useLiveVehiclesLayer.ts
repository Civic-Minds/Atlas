import { useEffect, useRef } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { useLiveVehiclesMapOverlay } from '../../../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';
import { cleanRouteShortName } from '../../../utils/format';
import { liveVehiclesFingerprint } from '../../../utils/liveVehiclesFingerprint';
import { useColorVision } from '../../../context/ColorVisionContext';
import { getVehicleRgb } from '../../../utils/colors';
import { vehicleTooltipHtml } from '../../../lib/mapHtml';
import { cardFramePadding, frameRoute } from './routeFraming';
import { LIVE_VEHICLE_PICK_RADIUS_PX, pickLiveVehicles } from './liveVehiclePick';
import { LIVE_CONTEXT_LAYER_IDS } from './mapLayers';
import { focusOpacity } from '../../../utils/routeFocus';
import { getNowDay } from '../../../../shared/dayTypes';

// Kept exported from here for the escape test that imports it.
export { vehicleTooltipHtml };

/**
 * Live vehicle map layers: deck.gl is dynamically imported only when Live is
 * active so Frequency Map doesn't pay the deck bundle cost up front.
 */
export function useLiveVehiclesLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  deckOverlayRef: React.RefObject<MapboxOverlay | null>,
  mapLoaded: boolean,
) {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();
  const lastDeckFpRef = useRef('');
  const cardRefRef = useRef(liveOverlay?.cardRef);
  cardRefRef.current = liveOverlay?.cardRef;
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
    // The shared selection fade: with a route (or one of its directions) picked, every other vehicle steps back.
    const focus = liveOverlay.focus ?? null;
    const alpha = (v: LiveVehicle) => focusOpacity(v, focus);
    const labelVehicles = focus ? vehicles.filter(v => alpha(v) === 1) : [];
    const focusFp = focus ? `${focus.agencySlug}::${focus.routeShortName}::${focus.ids?.join(',') ?? '*'}` : '';
    const fp = `${liveVehiclesFingerprint(vehicles)}|${focusedId ?? ''}|${focusFp}|${labelVehicles.length}|${colorMode}`;
    if (fp === lastDeckFpRef.current && deckOverlayRef.current) return;

    let cancelled = false;
    (async () => {
      const deck = await ensureDeckOverlay();
      if (cancelled || !deck) return;

      const { ScatterplotLayer, TextLayer } = await import('@deck.gl/layers');
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
            getRadius: (v: LiveVehicle) => (v.id === focusedId ? 6 : 4.5),
            getFillColor: (v: LiveVehicle) => [...getVehicleRgb(v.status ?? 'no_data', colorMode), Math.round(255 * alpha(v))] as [number, number, number, number],
            stroked: true,
            getLineColor: (v: LiveVehicle) => [255, 255, 255, Math.round(200 * alpha(v))],
            getLineWidth: 1.25,
            lineWidthUnits: 'pixels',
            radiusUnits: 'pixels',
            pickable: true,
            updateTriggers: {
              getRadius: focusedId,
              getFillColor: fp,
              getLineColor: fp,
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
  }, [liveOverlay, mapLoaded, mapRef, deckOverlayRef, colorMode]);

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
        const html = info?.object ? vehicleTooltipHtml(info.object as LiveVehicle, colorMode) : null;
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
  }, [mapLoaded, mapRef, deckOverlayRef, liveOverlay, colorMode]);

  // Context lines (CIV-326): only the routes that currently have a vehicle in the overlay (so the same
  // filter as the dots), thin and light, under every other route line and the deck dots.
  const contextRoutesKey = liveOverlay
    ? [...new Set((liveOverlay.vehicles ?? []).filter(v => v.agencySlug && v.routeShortName).map(v => `${v.agencySlug}::${v.routeShortName}`))].sort().join('\n')
    : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const keys = contextRoutesKey ? contextRoutesKey.split('\n') : [];
    // Today's shapes only, like the route lines: every day's copy drawn on top of the others stacks a faded line
    // back to full strength.
    const filter = (keys.length > 0
      ? ['all', ['==', ['coalesce', ['get', 'day'], getNowDay()], getNowDay()], ['any', ...keys.map(k => {
        const i = k.indexOf('::');
        return ['all', ['==', ['get', 'agencySlug'], k.slice(0, i)], ['==', ['get', 'routeShortName'], k.slice(i + 2)]];
      })]]
      : ['==', ['get', 'agencySlug'], '']) as maplibregl.FilterSpecification;
    for (const id of LIVE_CONTEXT_LAYER_IDS) {
      if (!map.getLayer(id)) continue;
      map.setFilter(id, filter);
      map.setLayoutProperty(id, 'visibility', keys.length > 0 ? 'visible' : 'none');
    }
  }, [contextRoutesKey, mapLoaded, mapRef]);

  // Vehicle clicked in the sidebar list — one fly-to, never zooming out past street level
  useEffect(() => {
    const map = mapRef.current;
    const fly = liveOverlay?.vehicleFly;
    if (!map || !mapLoaded || !fly) return;
    frameRoute(map, [[fly.lon, fly.lat]], { maxZoom: 15, padding: cardFramePadding(map, cardRefRef.current?.current) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOverlay?.vehicleFly?.ts, mapLoaded, mapRef]);

  // Coverage-area fly — live panel requests a jump to an agency's bbox (place list click)
  useEffect(() => {
    const map = mapRef.current;
    const area = liveOverlay?.focusArea;
    if (!map || !mapLoaded || !area) return;
    const [w, s, e, n] = area.bounds;
    frameRoute(map, [[w, s], [e, n]], { minZoom: area.minZoom ?? 0, padding: cardFramePadding(map, cardRefRef.current?.current) });
  }, [liveOverlay?.focusArea, mapLoaded, mapRef]);

  // Clicks while Live is open: every vehicle dot under the click goes to Live (an empty click clears the pick list).
  const onMapClickRef = useRef(liveOverlay?.onMapClick);
  onMapClickRef.current = liveOverlay?.onMapClick;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const handler = onMapClickRef.current;
      if (!handler) return;
      const vehicles = pickLiveVehicles(deckOverlayRef.current, e.point);
      const mPerPx = (40_075_016 * Math.cos((e.lngLat.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
      handler([e.lngLat.lng, e.lngLat.lat], vehicles, LIVE_VEHICLE_PICK_RADIUS_PX * mPerPx);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [mapLoaded, mapRef, deckOverlayRef]);
}
