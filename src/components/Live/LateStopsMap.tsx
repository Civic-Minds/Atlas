import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../lib/maplibreWorker';
import { getMapStyle, registerProtocol, getAtlasPmtilesUrl, getAtlasOverviewPmtilesUrl } from '../../lib/mapStyle';
import { showBasemapTheme } from '../../lib/basemap';
import { BasemapCredit } from '../BasemapCredit';
import MapZoomButtons from '../MapZoomButtons';
import { MAP_CONTROLS_SLOT } from '../../mapOverlayLayout';
import { lateStopDotPaint } from '../Interval/map/stopStyle';
import { contextLinePaint } from '../Interval/map/routeStyle';
import { LIVE_CONTEXT_OPACITY } from '../Interval/map/mapLayers';
import { FloatingMapCard, MapCard, MapHoverTip, type MapCardAt } from './MapCard';
import { type LateStopSpot } from './lateStopsMapModel';

const isLight = () => document.documentElement.getAttribute('data-theme') !== 'dark';
const stopsData = (ss: readonly LateStopSpot[]) => ({ type: 'FeatureCollection' as const, features: ss.map(s => ({ type: 'Feature' as const, properties: { key: s.key, name: s.name }, geometry: { type: 'Point' as const, coordinates: s.lonLat } })) });

/**
 * The stops most often late, on the map (CIV-1405): the regular map's basemap, its stop dots and zoom buttons, and the
 * Live map's grey route lines for `routes` (an agency, or one of its routes). Hovering a stop names it; clicking it opens
 * the Live map card with its figures. The page keeps scrolling over the map: it zooms with the buttons, a pinch or a
 * double click, never the scroll wheel.
 */
export default function LateStopsMap({ spots, routes, label, mapClassName = 'h-80 lg:h-[28rem]', className = '' }: {
  spots: readonly LateStopSpot[];
  /** The routes drawn under the stops: every route of `agency`, or only `route`. */
  routes: { agency: string; route?: string };
  /** What the map shows, for screen readers. */
  label: string;
  /** The map's height (Tailwind classes). */
  mapClassName?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const latest = useRef(spots);
  latest.current = spots;
  const [picked, setPicked] = useState<LateStopSpot | null>(null);
  const [at, setAt] = useState<MapCardAt | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const key = `${spots.map(s => s.key).join('|')}#${routes.agency}/${routes.route ?? ''}`;

  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const place = () => {
      const p = pickedRef.current;
      if (!map || !p) { setAt(null); return; }
      const pt = map.project(p.lonLat);
      setAt({ x: pt.x, y: pt.y, w: map.getContainer().clientWidth, h: map.getContainer().clientHeight });
    };
    registerProtocol().catch(() => undefined).then(() => {
      if (cancelled || !box.current) return;
      const m = new maplibregl.Map({ container: box.current, style: getMapStyle(isLight()), center: [-79.38, 43.65], zoom: 11, attributionControl: false, scrollZoom: false, dragRotate: false, pitchWithRotate: false });
      map = m;
      mapRef.current = m;
      if (import.meta.env.DEV) (window as unknown as { __lateStopsMap?: maplibregl.Map }).__lateStopsMap = m;
      m.touchZoomRotate.disableRotation();
      m.on('load', () => {
        const ss = latest.current;
        const filter = (routes.route
          ? ['all', ['==', ['get', 'agencySlug'], routes.agency], ['==', ['get', 'routeShortName'], routes.route]]
          : ['==', ['get', 'agencySlug'], routes.agency]) as maplibregl.FilterSpecification;
        const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
        m.addSource('atlas-overview-pmtiles', { type: 'vector', url: `pmtiles://${getAtlasOverviewPmtilesUrl()}` });
        m.addSource('atlas-pmtiles', { type: 'vector', url: `pmtiles://${getAtlasPmtilesUrl()}` });
        m.addLayer({ id: 'context-overview', type: 'line', source: 'atlas-overview-pmtiles', 'source-layer': 'routes', maxzoom: 8, filter, layout: line, paint: contextLinePaint(LIVE_CONTEXT_OPACITY) as unknown as maplibregl.LineLayerSpecification['paint'] });
        m.addLayer({ id: 'context-routes', type: 'line', source: 'atlas-pmtiles', 'source-layer': 'routes', minzoom: 8, filter, layout: line, paint: contextLinePaint(LIVE_CONTEXT_OPACITY) as unknown as maplibregl.LineLayerSpecification['paint'] });
        m.addSource('late-stops', { type: 'geojson', data: stopsData(ss) });
        m.addLayer({ id: 'late-stops', type: 'circle', source: 'late-stops', paint: lateStopDotPaint(isLight()) as unknown as maplibregl.CircleLayerSpecification['paint'] });
        if (ss.length) {
          const bounds = ss.reduce((b, s) => b.extend(s.lonLat), new maplibregl.LngLatBounds(ss[0].lonLat, ss[0].lonLat));
          m.resize();
          m.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
        }
      });
      // The dots are small: a stop answers within 8 px of the pointer.
      const hitAt = (p: maplibregl.Point) => m.getLayer('late-stops') ? m.queryRenderedFeatures([[p.x - 8, p.y - 8], [p.x + 8, p.y + 8]], { layers: ['late-stops'] })[0] : undefined;
      m.on('mousemove', e => {
        const hit = hitAt(e.point);
        m.getCanvas().style.cursor = hit ? 'pointer' : '';
        setTip(hit ? { x: e.point.x, y: e.point.y, text: String(hit.properties?.name ?? '') } : null);
      });
      m.on('mouseout', () => setTip(null));
      m.on('click', e => {
        const hit = hitAt(e.point);
        const spot = hit ? latest.current.find(s => s.key === hit.properties?.key) ?? null : null;
        pickedRef.current = spot;
        setPicked(spot);
        place();
      });
      m.on('move', place);
      m.on('resize', place);
      const paintTheme = () => {
        if (!m.isStyleLoaded()) return;
        const light = isLight();
        showBasemapTheme(m, light);
        if (!m.getLayer('late-stops')) return;
        for (const [k, v] of Object.entries(lateStopDotPaint(light))) (m.setPaintProperty as (layer: string, name: string, value: unknown) => void)('late-stops', k, v);
      };
      const theme = new MutationObserver(paintTheme);
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const ro = new ResizeObserver(() => { if (!m.isMoving()) m.resize(); });
      ro.observe(box.current);
      cleanups.push(() => { theme.disconnect(); ro.disconnect(); });
    });
    return () => { cancelled = true; cleanups.forEach(f => f()); map?.remove(); mapRef.current = null; setPicked(null); setAt(null); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className={`m-0 ${className}`}>
      <div className={`${mapClassName} relative isolate w-full overflow-hidden rounded-2xl border border-[var(--border-primary)]`}>
        <div ref={box} role="img" aria-label={label} className="h-full w-full" />
        <div className={`${MAP_CONTROLS_SLOT} z-10 max-sm:hidden`}>
          <MapZoomButtons onZoomIn={() => mapRef.current?.zoomIn({ duration: 200 })} onZoomOut={() => mapRef.current?.zoomOut({ duration: 200 })} />
        </div>
        {at && picked && <FloatingMapCard at={at}><MapCard title={picked.name} lines={picked.lines} /></FloatingMapCard>}
        {tip && !picked && <MapHoverTip {...tip} />}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[var(--text-muted)]">
        <BasemapCredit />
      </figcaption>
    </figure>
  );
}
