import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../lib/maplibreWorker';
import { basemapStyle, showBasemapTheme } from '../../lib/basemap';
import { BasemapCredit } from '../BasemapCredit';
import MapZoomButtons from '../MapZoomButtons';
import LegendItem from '../ui/LegendItem';
import { headwayBandLabel, headwayTierLabel } from '../../../shared/headwayText';

/** A stop's map colour, from its worst wait (CIV-101): the same groups as the route lists, plus outdated and pick-up only. */
export type StopMapGroup = 15 | 30 | 60 | 'longer' | 'outdated' | 'pickup';

export interface StopMapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  group: StopMapGroup;
}

/**
 * Each group's colour and legend wording, in legend order. The four waits step from the map's colour-blind-safe green
 * through orange and vermillion to a dark red, one clear lightness step apart and the same in both themes, so a longer
 * wait always reads darker. Outdated stops are grey; pick-up-only stops are hollow.
 */
export const STOP_MAP_GROUPS: ReadonlyArray<{ group: StopMapGroup; color: string; label: string }> = [
  { group: 15, color: '#009e73', label: headwayTierLabel(15) },
  { group: 30, color: '#e69f00', label: headwayBandLabel(16, 30) },
  { group: 60, color: '#d55e00', label: headwayBandLabel(31, 60) },
  { group: 'longer', color: '#7f1d1d', label: 'Over 60 min or no bus' },
  { group: 'outdated', color: 'var(--status-neutral)', label: 'Outdated schedule' },
  { group: 'pickup', color: 'var(--bg-app)', label: 'Bustang picks up only' },
];

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#9ca3af';
/** A colour for the map's paint: a CSS variable read from the page's theme, else the colour as written. */
const resolve = (color: string) => (color.startsWith('var(') ? css(color.slice(4, -1)) : color);
const isLight = () => document.documentElement.getAttribute('data-theme') !== 'dark';
const COLORADO: maplibregl.LngLatBoundsLike = [[-109.06, 36.99], [-102.04, 41.0]];

/**
 * The Bustang stops on Atlas's basemap (the same CARTO style and theme switch as the Frequent story map, CIV-1168),
 * each a dot coloured by its worst wait. A tap picks a stop; the picked one gets a ring, never a dark fill.
 * Two fingers (or Ctrl and scroll) move the map, so the page still scrolls past it.
 */
export default function BustangStopMap({ points, selectedId, onPick }: { points: StopMapPoint[]; selectedId: string | null; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  // The reader has moved or zoomed the map: a size change no longer reframes Colorado.
  const moved = useRef(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current, style: basemapStyle(isLight()), bounds: COLORADO, fitBoundsOptions: { padding: 16 },
      attributionControl: false, fadeDuration: 0, cooperativeGestures: true, dragRotate: false, touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __bustangMap?: maplibregl.Map }).__bustangMap = map;
    const paint = () => {
      if (!map.isStyleLoaded()) return;
      showBasemapTheme(map, isLight());
      if (map.getLayer('stops')) {
        map.setPaintProperty('stops', 'circle-stroke-color', css('--text-primary'));
        map.setPaintProperty('stop-ring', 'circle-stroke-color', css('--text-primary'));
      }
    };
    map.on('load', () => {
      map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6, 12, 9],
        'circle-stroke-color': css('--text-primary'),
        'circle-stroke-width': ['case', ['==', ['get', 'pickup'], 1], 2, 1],
        'circle-stroke-opacity': ['case', ['==', ['get', 'pickup'], 1], 0.8, 0.35],
      } });
      // The picked stop: a ring around its dot, no fill.
      map.addLayer({ id: 'stop-ring', type: 'circle', source: 'stops', filter: ['==', ['get', 'sel'], 1], paint: {
        'circle-color': 'rgba(0,0,0,0)', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 14],
        'circle-stroke-color': css('--text-primary'), 'circle-stroke-width': 2.5,
      } });
      paint();
      setReady(true);
    });
    const near = (p: maplibregl.Point) => map.queryRenderedFeatures([[p.x - 8, p.y - 8], [p.x + 8, p.y + 8]], { layers: ['stops'] });
    map.on('click', e => {
      const hits = near(e.point);
      const ids = [...new Set(hits.map(h => String(h.properties?.id)))];
      if (ids.length === 1) { pick.current(ids[0]); return; }
      // Several stops under one tap (Denver at statewide zoom): zoom to them rather than guess which one was meant.
      if (ids.length > 1) {
        const coords = hits.map(h => (h.geometry as unknown as { coordinates: [number, number] }).coordinates);
        const lons = coords.map(c => c[0]), lats = coords.map(c => c[1]);
        moved.current = true;
        map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 15, duration: 400 });
      }
    });
    map.on('mousemove', e => {
      const hit = near(e.point)[0];
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
      setTip(hit ? { x: e.point.x, y: e.point.y, text: String(hit.properties?.name ?? '') } : null);
    });
    map.on('mouseout', () => setTip(null));
    const theme = new MutationObserver(paint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // Until the reader moves the map, a size change (the phone layout settling) frames all of Colorado again.
    map.on('movestart', e => { if ((e as { originalEvent?: unknown }).originalEvent) moved.current = true; });
    const resize = new ResizeObserver(() => {
      if (map.isMoving()) return;
      map.resize();
      if (!moved.current) map.fitBounds(COLORADO, { padding: 16, animate: false });
    });
    resize.observe(box.current);
    return () => { theme.disconnect(); resize.disconnect(); setReady(false); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('stops') as maplibregl.GeoJSONSource | undefined;
    if (!map || !source) return;
    const colors = new Map(STOP_MAP_GROUPS.map(g => [g.group, resolve(g.color)]));
    source.setData({
      type: 'FeatureCollection',
      // The picked stop draws last, so it sits on top of a crowded spot (Denver).
      features: [...points].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId)).map(p => ({
        type: 'Feature' as const,
        properties: { id: p.id, name: p.name, color: colors.get(p.group), pickup: p.group === 'pickup' ? 1 : 0, sel: p.id === selectedId ? 1 : 0 },
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      })),
    });
  }, [points, selectedId, ready]);

  // A stop picked from the list is brought into view if the map has been moved off it.
  useEffect(() => {
    const map = mapRef.current;
    const p = points.find(x => x.id === selectedId);
    if (!map || !ready || !p) return;
    if (!map.getBounds().contains([p.lon, p.lat])) map.easeTo({ center: [p.lon, p.lat], duration: 300 });
  }, [selectedId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className="overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)]">
      <div className="relative h-[360px] sm:h-[440px]">
        <div ref={box} className="h-full w-full" role="img" aria-label="Map of Colorado's Bustang stops, each coloured by its longest wait for a local bus. Pick a stop from the list below the map to see the same detail." />
        <div className="absolute bottom-4 right-3 z-10">
          <MapZoomButtons onZoomIn={() => { moved.current = true; mapRef.current?.zoomIn({ duration: 200 }); }} onZoomOut={() => { moved.current = true; mapRef.current?.zoomOut({ duration: 200 }); }} />
        </div>
        {tip && (
          <div className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-[var(--border-primary)] bg-[var(--bg-header)] px-2 py-1 text-xs font-bold" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>
        )}
      </div>
      <figcaption className="border-t border-[var(--border-primary)] px-4 pb-4 pt-3 text-xs text-[var(--text-muted)]">
        <p className="font-bold text-[var(--text-primary)]">Longest wait for a local bus after Bustang arrives</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {STOP_MAP_GROUPS.map(g => (
            <li key={g.group}>
              <LegendItem color={g.color} swatchClassName={g.group === 'pickup' ? 'ring-1 ring-[var(--text-primary)]' : ''}>{g.label}</LegendItem>
            </li>
          ))}
        </ul>
        <BasemapCredit className="mt-3" />
      </figcaption>
    </figure>
  );
}
