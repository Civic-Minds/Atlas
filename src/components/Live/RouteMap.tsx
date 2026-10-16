import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from '../../lib/mapStyle';
import type { MapMeasure, RouteMapModel } from './routeMapModel';

export type MapPick = { kind: 'segment'; fromStopId: string; toStopId: string } | { kind: 'stop'; stopId: string };

interface Props {
  model: RouteMapModel;
  measure: MapMeasure;
  /** The picked segment or stop: drawn marked. */
  selected: MapPick | null;
  onPick: (pick: MapPick) => void;
  /** Changes when the route or direction changes: the map then frames the new route. */
  frameKey: string;
  className?: string;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#9ca3af';
/** The colour of a step: delay colours for the time-based measures, the bunching purples for bunching, grey when not measured. */
function stepColor(measure: MapMeasure, step: 0 | 1 | 2 | null): string {
  if (step == null) return css('--strip-delay-0');
  return css(`--strip-${measure === 'bunching' ? 'bunching' : 'delay'}-${step}`);
}

/**
 * The route on the Atlas basemap: each segment between stops drawn along its line and coloured by the chosen measure,
 * with a dot at each stop in the same colour. Segments and stops can be clicked; the picked one is marked. A segment or
 * stop with no value is drawn grey. Frames the route whenever `frameKey` changes.
 */
export default function RouteMap({ model, measure, selected, onPick, frameKey, className = '' }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ model, measure, selected });
  latest.current = { model, measure, selected };
  const framed = useRef<string | null>(null);

  const draw = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const { model: m, measure: me, selected: sel } = latest.current;
    const seg = map.getSource('segments') as maplibregl.GeoJSONSource | undefined;
    const stp = map.getSource('stops') as maplibregl.GeoJSONSource | undefined;
    if (!seg || !stp) return;
    seg.setData({
      type: 'FeatureCollection',
      features: m.segments.map(s => ({
        type: 'Feature' as const,
        properties: { from: s.fromStopId, to: s.toStopId, color: stepColor(me, s.step), sel: sel?.kind === 'segment' && sel.fromStopId === s.fromStopId && sel.toStopId === s.toStopId ? 1 : 0 },
        geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      })),
    });
    stp.setData({
      type: 'FeatureCollection',
      features: m.stops.map(s => ({
        type: 'Feature' as const,
        properties: { id: s.stopId, name: s.name, color: stepColor(me, s.step), sel: sel?.kind === 'stop' && sel.stopId === s.stopId ? 1 : 0 },
        geometry: { type: 'Point' as const, coordinates: s.lonLat },
      })),
    });
    if (framed.current !== frameKey && m.stops.length) {
      framed.current = frameKey;
      const b = new maplibregl.LngLatBounds();
      m.stops.forEach(s => b.extend(s.lonLat));
      m.segments.forEach(s => s.coordinates.forEach(c => b.extend(c)));
      map.fitBounds(b, { padding: { top: 56, bottom: 56, left: 56, right: 56 }, maxZoom: 15, duration: 0 });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const light = document.documentElement.getAttribute('data-theme') !== 'dark';
    const map = new maplibregl.Map({ container: box.current, style: getMapStyle(light), center: [-79.38, 43.65], zoom: 11, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    map.on('load', () => {
      const halo = light ? '#ffffff' : '#111827';
      map.addSource('segments', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'seg-halo', type: 'line', source: 'segments', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': halo, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 12] } });
      map.addLayer({ id: 'seg', type: 'line', source: 'segments', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 8] } });
      map.addLayer({ id: 'seg-sel', type: 'line', source: 'segments', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 15], 'line-opacity': 0.35 } });
      map.addLayer({ id: 'stp', type: 'circle', source: 'stops', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 6], 'circle-stroke-color': halo, 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'stp-sel', type: 'circle', source: 'stops', filter: ['==', ['get', 'sel'], 1], paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 15, 11], 'circle-stroke-color': light ? '#111827' : '#ffffff', 'circle-stroke-width': 2 } });
      ready.current = true;
      draw();
    });
    map.on('click', e => {
      const hit = (layers: string[]) => map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers });
      const stop = hit(['stp'])[0];
      if (stop) { pick.current({ kind: 'stop', stopId: String(stop.properties?.id) }); return; }
      const seg = hit(['seg'])[0];
      if (seg) pick.current({ kind: 'segment', fromStopId: String(seg.properties?.from), toStopId: String(seg.properties?.to) });
    });
    map.on('mousemove', e => {
      const over = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['stp', 'seg'] }).length > 0;
      map.getCanvas().style.cursor = over ? 'pointer' : '';
    });
    return () => { ready.current = false; map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(draw, [model, measure, selected, frameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className={`h-full w-full ${className}`.trim()} role="img" aria-label="Map of the route, coloured by the chosen measure" />;
}
