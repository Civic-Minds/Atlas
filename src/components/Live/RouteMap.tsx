import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FloatingMapCard, MapHoverTip, type MapCardAt } from './MapCard';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapZoomButtons from '../MapZoomButtons';
import { getMapStyle } from '../../lib/mapStyle';
import { stopDotPaint } from '../Interval/map/stopStyle';
import { MAP_STEP_LIMITS, mapStep, type MapMeasure, type RouteMapModel } from './routeMapModel';
import type { HeatPoint } from './delayHeatModel';
import { frameRoute } from '../Interval/map/routeFraming';
import { FOCUS_DIM_OPACITY } from '../../utils/routeFocus';

export type MapPick = { kind: 'segment'; fromStopId: string; toStopId: string; route?: string } | { kind: 'stop'; stopId: string };

interface Props {
  model: RouteMapModel;
  measure: MapMeasure;
  /** The picked segment or stop: drawn marked. */
  selected: MapPick | null;
  /** A click on a segment or stop, with where it landed; a click on empty map gives null. */
  onPick: (pick: MapPick | null, at: [number, number] | null) => void;
  /** Where the card is anchored (longitude, latitude), and what it shows. The card follows the map as it moves. */
  anchor?: [number, number] | null;
  card?: ReactNode;
  /** Moves the map to this point (a row picked in the table); a new `k` moves it again. */
  centerOn?: { lonLat: [number, number]; k: number } | null;
  /** On a map of several routes: the route to show strongly while the others fade (a hovered table row). */
  highlightRoute?: string | null;
  /** Changes when the route or direction changes: the map then frames the new route. */
  frameKey: string;
  /** Pixels at each edge the map keeps clear when framing (panels floating over it). */
  padding?: { top: number; bottom: number; left: number; right: number };
  /** Distance of the zoom buttons from the right edge, px: the main map's 12, more where a panel floats over the map's right side. */
  controlsRight?: number | string;
  /** Where delay starts (the CIV-942 prototype): a soft dot per stop, with a sharp centre where no stops are drawn already. */
  heat?: HeatPoint[] | null;
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
export default function RouteMap({ model, measure, selected, onPick, anchor = null, card = null, centerOn = null, highlightRoute = null, frameKey, padding, controlsRight = 12, heat = null, className = '' }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ model, measure, selected, frameKey, padding, heat });
  latest.current = { model, measure, selected, frameKey, padding, heat };
  const framed = useRef<string | null>(null);
  const [at, setAt] = useState<MapCardAt | null>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const place = () => {
    const map = mapRef.current, a = anchorRef.current;
    if (!map || !a) { setAt(null); return; }
    const p = map.project(a);
    setAt({ x: p.x, y: p.y, w: map.getContainer().clientWidth, h: map.getContainer().clientHeight });
  };
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const latestHl = useRef(highlightRoute);
  latestHl.current = highlightRoute;

  const draw = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    // The load handler calls an older draw: everything it frames with is read from the latest props.
    const { model: m, measure: me, selected: sel, frameKey: key, padding: pad, heat: hp } = latest.current;
    const seg = map.getSource('segments') as maplibregl.GeoJSONSource | undefined;
    const stp = map.getSource('stops') as maplibregl.GeoJSONSource | undefined;
    const hs = map.getSource('heat') as maplibregl.GeoJSONSource | undefined;
    if (!seg || !stp || !hs) return;
    hs.setData({
      type: 'FeatureCollection',
      features: (hp ?? []).map(p => ({
        type: 'Feature' as const,
        properties: { added: p.addedMin, name: p.name, color: stepColor('delayStarts', mapStep('delayStarts', p.addedMin)), dot: m.stops.length ? 0 : 1 },
        geometry: { type: 'Point' as const, coordinates: p.lonLat },
      })),
    });
    // Other routes fade by the map's one fade amount; under Delay starts every line is already at half, so they fade by half of it.
    map.setPaintProperty('seg', 'line-opacity', me === 'delayStarts' ? ['case', ['==', ['get', 'dim'], 1], FOCUS_DIM_OPACITY / 2, 0.5] : ['case', ['==', ['get', 'dim'], 1], FOCUS_DIM_OPACITY, 1]);
    seg.setData({
      type: 'FeatureCollection',
      features: m.segments.map(s => ({
        type: 'Feature' as const,
        properties: { from: s.fromStopId, to: s.toStopId, label: s.label ?? '', route: s.route ?? '', off: s.offset ?? 0, dim: latestHl.current && s.route !== latestHl.current ? 1 : 0, color: stepColor(me, s.step), sel: sel?.kind === 'segment' && sel.fromStopId === s.fromStopId && sel.toStopId === s.toStopId ? 1 : 0 },
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
    if (framed.current !== key && (m.stops.length || m.segments.length)) {
      framed.current = key;
      const points = [...m.stops.map(s => s.lonLat), ...m.segments.flatMap(s => s.coordinates)];
      // The map sits in a flex layout whose size can change after the first paint: measure it again before framing.
      map.resize();
      frameRoute(map, points, { padding: pad ?? { top: 72, bottom: 72, left: 72, right: 72 }, maxZoom: 15, duration: 0 });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const light = document.documentElement.getAttribute('data-theme') !== 'dark';
    const map = new maplibregl.Map({ container: box.current, style: getMapStyle(light), center: [-79.38, 43.65], zoom: 11, attributionControl: false });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __routeMap?: maplibregl.Map }).__routeMap = map;
    map.on('load', () => {
      const halo = light ? '#ffffff' : '#111827';
      map.addSource('segments', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'seg-halo', type: 'line', source: 'segments', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': halo, 'line-offset': ['get', 'off'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 12] } });
      map.addLayer({ id: 'seg', type: 'line', source: 'segments', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-offset': ['get', 'off'], 'line-opacity': ['case', ['==', ['get', 'dim'], 1], FOCUS_DIM_OPACITY, 1], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 8] } });
      map.addLayer({ id: 'seg-sel', type: 'line', source: 'segments', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 15], 'line-opacity': 0.35 } });
      // The heat: one soft dot per stop in its own step colour, bigger the more it adds (never summed with its neighbours,
      // so the colour is always the stop's own figure and matches the key). Hottest drawn on top.
      const [, top] = MAP_STEP_LIMITS.delayStarts;
      map.addSource('heat', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const size = (z: number) => ['interpolate', ['linear'], ['get', 'added'], 0, 2 + z * 0.3, top, 6 + z, top * 4, 9 + z * 1.5];
      map.addLayer({ id: 'heat', type: 'circle', source: 'heat', layout: { 'circle-sort-key': ['get', 'added'] }, paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, size(2), 15, size(8)] as unknown as maplibregl.ExpressionSpecification,
        'circle-blur': ['case', ['>=', ['get', 'added'], 0.25], 0.6, 0],
        'circle-opacity': ['case', ['>=', ['get', 'added'], 0.25], 0.85, 0.7],
      } });
      map.addLayer({ id: 'heat-dot', type: 'circle', source: 'heat', filter: ['all', ['==', ['get', 'dot'], 1], ['>=', ['get', 'added'], 0.25]], layout: { 'circle-sort-key': ['get', 'added'] }, paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 5], 'circle-stroke-color': halo, 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'stp', type: 'circle', source: 'stops', paint: stopDotPaint(light) as unknown as maplibregl.CircleLayerSpecification['paint'] });
      map.addLayer({ id: 'stp-sel', type: 'circle', source: 'stops', filter: ['==', ['get', 'sel'], 1], paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 15, 11], 'circle-stroke-color': light ? '#111827' : '#ffffff', 'circle-stroke-width': 2 } });
      ready.current = true;
      draw();
    });
    map.on('click', e => {
      const hit = (layers: string[]) => map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers });
      const stop = hit(['stp'])[0];
      if (stop) { pick.current({ kind: 'stop', stopId: String(stop.properties?.id) }, (stop.geometry as unknown as { coordinates: [number, number] }).coordinates); return; }
      const seg = hit(['seg'])[0];
      if (seg) pick.current({ kind: 'segment', fromStopId: String(seg.properties?.from), toStopId: String(seg.properties?.to), route: seg.properties?.route ? String(seg.properties.route) : undefined }, [e.lngLat.lng, e.lngLat.lat]);
      else pick.current(null, null);
    });
    map.on('mousemove', e => {
      const hit = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['stp', 'heat-dot', 'heat', 'seg'] })[0];
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
      const text = hit ? String(hit.properties?.name ?? hit.properties?.label ?? '') : '';
      setTip(text ? { x: e.point.x, y: e.point.y, text } : null);
    });
    map.on('mouseout', () => setTip(null));
    map.on('move', place);
    map.on('resize', place);
        const ro = new ResizeObserver(() => { if (!map.isMoving()) map.resize(); });
    ro.observe(box.current);
    return () => { ro.disconnect(); ready.current = false; map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(draw, [model, measure, selected, frameKey, heat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(place, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw, [highlightRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (centerOn && mapRef.current) mapRef.current.easeTo({ center: centerOn.lonLat, duration: 300 }); }, [centerOn?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`.trim()}>
      <div ref={box} className="h-full w-full" role="img" aria-label="Map of the route, coloured by the chosen measure" />
      {/* Phones zoom by pinching, so the + and − buttons show only from sm up, as on the regular map. */}
      <div className="pointer-events-auto absolute bottom-6 z-20 max-sm:hidden" style={{ right: controlsRight }}>
        <MapZoomButtons onZoomIn={() => mapRef.current?.zoomIn({ duration: 200 })} onZoomOut={() => mapRef.current?.zoomOut({ duration: 200 })} />
      </div>
      {at && card && <FloatingMapCard at={at} padding={padding}>{card}</FloatingMapCard>}
      {tip && !card && <MapHoverTip {...tip} />}
    </div>
  );
}
