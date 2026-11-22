import { FALLBACK_GREY, MAP_HALO } from '../../../../shared/rules/colours';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { FloatingMapCard, MapHoverTip, type MapCardAt } from '../../Live/MapCard';
import { stopDotPaint } from './stopStyle';
import { SELECTED_ROUTE_GLOW_WIDTH_PX, SELECTED_ROUTE_HALO_WIDTH_PX, SELECTED_ROUTE_WIDTH_PX, focusedRouteLineWidth } from './routeStyle';
import { MAP_STEP_LIMITS, mapStep, type MapMeasure, type RouteMapModel } from '../../Live/routeMapModel';
import { frameRoute, routeFramePadding } from './routeFraming';
import { FOCUS_DIM_OPACITY } from '../../../utils/routeFocus';
import { usePageMapOverlay, type PageMapOverlay } from '../../../context/PageMapOverlay';

/**
 * A page's drawing on a map it doesn't own (CIV-1828, moved from the Live tool's MapAppMap): with a `segments` layer,
 * each segment between stops drawn along its line and coloured by the chosen measure, with a dot at each stop in the
 * same colour; segments and stops can be clicked and the picked one is marked; one with no value is drawn grey. With a
 * `lines` layer: each line in its own colour, dashed where asked; a line can be clicked. Frames what it draws whenever
 * `frameKey` changes. Its sources and layers carry `prefix` so they never meet the map's own; they are removed when the
 * page closes. Renders the floating card and the hover name; its parent is the map's own box (positioned, map-sized).
 */

const EMPTY_MODEL: RouteMapModel = { directionId: 0, segments: [], stops: [] };

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || FALLBACK_GREY;
/** A line's colour: a `var(--token)` is read from the page, anything else is used as given. */
const lineColor = (c: string) => { const m = c.match(/^var\((--[^)]+)\)$/); return m ? css(m[1]) : c; };
/** The colour of a step: delay colours for the time-based measures, the bunching purples for bunching, grey when not measured. */
function stepColor(measure: MapMeasure, step: 0 | 1 | 2 | null): string {
  if (step == null) return css('--strip-delay-0');
  return css(`--strip-${measure === 'bunching' ? 'bunching' : 'delay'}-${step}`);
}

/** The ring round the picked stop. */
const pickedStopRing = (light: boolean) => (light ? '#111827' : '#ffffff');

const SOURCES = ['lines', 'segments', 'stops', 'heat'] as const;
const LAYERS = ['line', 'line-dash', 'line-sel', 'seg-halo', 'seg', 'seg-sel', 'heat', 'heat-dot', 'stp', 'stp-sel'] as const;

interface Props extends PageMapOverlay {
  /** The map to draw on, once its style has loaded; null until then. */
  map: maplibregl.Map | null;
  /** The basemap's theme: the halos and stop dots follow it. */
  light: boolean;
  /** Put before every source and layer id ('page-' on the main map). */
  prefix?: string;
}

export default function PageMapLayer({ map, light, prefix = '', layer, selected, onPick, anchor = null, card = null, centerOn = null, highlightRoute = null, frameKey, padding, frameCard, framedMemory, holdFrame = false }: Props) {
  const id = (name: string) => `${prefix}${name}`;
  const model = layer.kind === 'segments' ? layer.model : EMPTY_MODEL;
  const measure: MapMeasure = layer.kind === 'segments' ? layer.measure : 'late';
  const heat = layer.kind === 'segments' ? layer.heat ?? null : null;
  const lines = layer.kind === 'lines' ? layer.lines : null;
  const frameTo = layer.kind === 'lines' ? layer.frameTo ?? null : null;
  const [ready, setReady] = useState(false);
  // Handlers in refs: a new callback each render would otherwise re-register the map's listeners every time.
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ model, measure, selected, frameKey, padding, heat, lines, holdFrame, frameTo });
  latest.current = { model, measure, selected, frameKey, padding, heat, lines, holdFrame, frameTo };
  const ownFramed = useRef<string | null>(null);
  const framed = framedMemory ?? ownFramed;
  const [at, setAt] = useState<MapCardAt | null>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const place = () => {
    const a = anchorRef.current;
    if (!map || !a) { setAt(null); return; }
    const p = map.project(a);
    setAt({ x: p.x, y: p.y, w: map.getContainer().clientWidth, h: map.getContainer().clientHeight });
  };
  const placeRef = useRef(place);
  placeRef.current = place;
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const latestHl = useRef(highlightRoute);
  latestHl.current = highlightRoute;

  const draw = () => {
    if (!map || !ready) return;
    // Everything it frames with is read from the latest props.
    const { model: m, measure: me, selected: sel, frameKey: key, padding: pad, heat: hp, lines: ln, holdFrame: hold, frameTo: ft } = latest.current;
    const seg = map.getSource(id('segments')) as maplibregl.GeoJSONSource | undefined;
    const stp = map.getSource(id('stops')) as maplibregl.GeoJSONSource | undefined;
    const hs = map.getSource(id('heat')) as maplibregl.GeoJSONSource | undefined;
    const ls = map.getSource(id('lines')) as maplibregl.GeoJSONSource | undefined;
    if (!seg || !stp || !hs || !ls) return;
    ls.setData({
      type: 'FeatureCollection',
      features: (ln ?? []).map(l => ({
        type: 'Feature' as const,
        properties: { id: l.id, label: l.label ?? '', route: l.route ?? '', color: lineColor(l.color), hl: latestHl.current && l.route === latestHl.current ? 1 : 0, op: (l.opacity ?? 1) * (latestHl.current && l.route !== latestHl.current ? FOCUS_DIM_OPACITY : 1), dashed: l.dashed ? 1 : 0, sel: sel?.kind === 'line' && sel.id === l.id ? 1 : 0 },
        geometry: { type: 'LineString' as const, coordinates: l.coordinates },
      })),
    });
    hs.setData({
      type: 'FeatureCollection',
      features: (hp ?? []).map(p => ({
        type: 'Feature' as const,
        properties: { added: p.addedMin, name: p.name, color: stepColor('delayStarts', mapStep('delayStarts', p.addedMin)), dot: m.stops.length ? 0 : 1 },
        geometry: { type: 'Point' as const, coordinates: p.lonLat },
      })),
    });
    // Other routes fade by the map's one fade amount; under Delay starts every line is already at half, so they fade by half of it.
    map.setPaintProperty(id('seg'), 'line-opacity', me === 'delayStarts' ? ['case', ['==', ['get', 'dim'], 1], FOCUS_DIM_OPACITY / 2, 0.5] : ['case', ['==', ['get', 'dim'], 1], FOCUS_DIM_OPACITY, 1]);
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
    if (!hold && framed.current !== key && (m.stops.length || m.segments.length || ln?.length || ft?.length)) {
      framed.current = key;
      // A lines map with a highlighted route (Studio's picked route, CIV-1731) frames that route's lines alone.
      const hl = latestHl.current;
      const framedLines = ln && hl && ln.some(l => l.route === hl) ? ln.filter(l => l.route === hl) : ln;
      const drawn = [...m.stops.map(s => s.lonLat), ...m.segments.flatMap(s => s.coordinates), ...(framedLines ?? []).flatMap(l => l.coordinates)];
      const points = drawn.length ? drawn : [...(ft ?? [])];
      // The map can sit in a layout whose size changes after the first paint: measure it again before framing.
      map.resize();
      // No padding: the main map's own route framing, clear of the page's sidebar card where it really is.
      const card = frameCard?.current?.getBoundingClientRect();
      frameRoute(map, points, { maxZoom: 15, duration: 0, padding: pad ?? routeFramePadding(map, 'left', { card }) });
    }
  };

  // The sources and layers, added once the map is there and removed when the page closes.
  useEffect(() => {
    if (!map) return;
    const halo = light ? MAP_HALO.light : MAP_HALO.dark;
    const empty = { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } };
    // Static route lines (a `lines` layer), under everything else.
    map.addSource(id('lines'), empty);
    // CIV-2057 (Ryan: "Why do the lines still look so thick here"): the main map's widths, its route lines' for the network and
    // its selected route's for the picked one (focusedRouteLineWidth), with no halo, as the main map draws them.
    const lineWidth = focusedRouteLineWidth(['==', ['get', 'hl'], 1]) as unknown as maplibregl.ExpressionSpecification;
    map.addLayer({ id: id('line'), type: 'line', source: id('lines'), filter: ['==', ['get', 'dashed'], 0], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': lineWidth, 'line-opacity': ['get', 'op'] } });
    map.addLayer({ id: id('line-dash'), type: 'line', source: id('lines'), filter: ['==', ['get', 'dashed'], 1], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': lineWidth, 'line-opacity': ['get', 'op'], 'line-dasharray': [1.5, 1.5] } });
    map.addLayer({ id: id('line-sel'), type: 'line', source: id('lines'), filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': SELECTED_ROUTE_GLOW_WIDTH_PX, 'line-opacity': 0.35 } });
    map.addSource(id('segments'), empty);
    map.addSource(id('stops'), empty);
    // #1661: segments are the main map's picked-route width (they were 3 to 8 px, with a 5 to 12 px halo), so
    // Studio Live's lines match regular Live's; the halo adds 1 px each side.
    map.addLayer({ id: id('seg-halo'), type: 'line', source: id('segments'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': halo, 'line-offset': ['get', 'off'], 'line-width': SELECTED_ROUTE_HALO_WIDTH_PX } });
    map.addLayer({ id: id('seg'), type: 'line', source: id('segments'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-offset': ['get', 'off'], 'line-opacity': ['case', ['==', ['get', 'dim'], 1], FOCUS_DIM_OPACITY, 1], 'line-width': SELECTED_ROUTE_WIDTH_PX } });
    map.addLayer({ id: id('seg-sel'), type: 'line', source: id('segments'), filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': SELECTED_ROUTE_GLOW_WIDTH_PX, 'line-opacity': 0.35 } });
    // The heat: one soft dot per stop in its own step colour, bigger the more it adds (never summed with its neighbours,
    // so the colour is always the stop's own figure and matches the key). Hottest drawn on top.
    const [, top] = MAP_STEP_LIMITS.delayStarts;
    map.addSource(id('heat'), empty);
    const size = (z: number) => ['interpolate', ['linear'], ['get', 'added'], 0, 2 + z * 0.3, top, 6 + z, top * 4, 9 + z * 1.5];
    map.addLayer({ id: id('heat'), type: 'circle', source: id('heat'), layout: { 'circle-sort-key': ['get', 'added'] }, paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, size(2), 15, size(8)] as unknown as maplibregl.ExpressionSpecification,
      'circle-blur': ['case', ['>=', ['get', 'added'], 0.25], 0.6, 0],
      'circle-opacity': ['case', ['>=', ['get', 'added'], 0.25], 0.85, 0.7],
    } });
    map.addLayer({ id: id('heat-dot'), type: 'circle', source: id('heat'), filter: ['all', ['==', ['get', 'dot'], 1], ['>=', ['get', 'added'], 0.25]], layout: { 'circle-sort-key': ['get', 'added'] }, paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 5], 'circle-stroke-color': halo, 'circle-stroke-width': 1 } });
    map.addLayer({ id: id('stp'), type: 'circle', source: id('stops'), paint: stopDotPaint(light) as unknown as maplibregl.CircleLayerSpecification['paint'] });
    map.addLayer({ id: id('stp-sel'), type: 'circle', source: id('stops'), filter: ['==', ['get', 'sel'], 1], paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 15, 11], 'circle-stroke-color': pickedStopRing(light), 'circle-stroke-width': 2 } });
    setReady(true);

    const near = (e: maplibregl.MapMouseEvent, layers: string[]) => map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: layers.map(id) });
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const stop = near(e, ['stp'])[0];
      if (stop) { pick.current({ kind: 'stop', stopId: String(stop.properties?.id) }, (stop.geometry as unknown as { coordinates: [number, number] }).coordinates); return; }
      const seg = near(e, ['seg'])[0];
      if (seg) { pick.current({ kind: 'segment', fromStopId: String(seg.properties?.from), toStopId: String(seg.properties?.to), route: seg.properties?.route ? String(seg.properties.route) : undefined }, [e.lngLat.lng, e.lngLat.lat]); return; }
      const line = near(e, ['line', 'line-dash'])[0];
      if (line) pick.current({ kind: 'line', id: String(line.properties?.id), route: line.properties?.route ? String(line.properties.route) : undefined }, [e.lngLat.lng, e.lngLat.lat]);
      else pick.current(null, null);
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const hit = near(e, ['stp', 'heat-dot', 'heat', 'seg', 'line', 'line-dash'])[0];
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
      const text = hit ? String(hit.properties?.name ?? hit.properties?.label ?? '') : '';
      setTip(text ? { x: e.point.x, y: e.point.y, text } : null);
    };
    const onOut = () => setTip(null);
    const onPlace = () => placeRef.current();
    map.on('click', onClick);
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    map.on('move', onPlace);
    map.on('resize', onPlace);
    return () => {
      setReady(false);
      ownFramed.current = null;
      map.off('click', onClick);
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
      map.off('move', onPlace);
      map.off('resize', onPlace);
      // The map may already be gone (a page's own map removed with it).
      try {
        map.getCanvas().style.cursor = '';
        for (const l of [...LAYERS].reverse()) if (map.getLayer(id(l))) map.removeLayer(id(l));
        for (const s of SOURCES) if (map.getSource(id(s))) map.removeSource(id(s));
      } catch { /* removed with its map */ }
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // The basemap's theme changes without a new style: the halos and stop dots follow it.
  useEffect(() => {
    if (!map || !ready) return;
    const halo = light ? MAP_HALO.light : MAP_HALO.dark;
    map.setPaintProperty(id('seg-halo'), 'line-color', halo);
    map.setPaintProperty(id('heat-dot'), 'circle-stroke-color', halo);
    map.setPaintProperty(id('stp-sel'), 'circle-stroke-color', pickedStopRing(light));
    for (const [k, v] of Object.entries(stopDotPaint(light))) map.setPaintProperty(id('stp'), k as Parameters<maplibregl.Map['setPaintProperty']>[1], v as unknown as maplibregl.ExpressionSpecification);
  }, [map, ready, light]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(draw, [map, ready, model, measure, selected, frameKey, heat, lines, holdFrame, frameTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(place, [map, anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw, [highlightRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (centerOn && map) map.easeTo({ center: centerOn.lonLat, duration: 300 }); }, [centerOn?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {at && card && <FloatingMapCard at={at} padding={padding}>{card}</FloatingMapCard>}
      {tip && !card && <MapHoverTip {...tip} />}
    </>
  );
}

/** The page overlay's drawing on the main map (MapCanvas): whatever page has set one (usePageMapOverlay), else nothing. */
export function PageMapOverlayLayer({ map, light }: { map: maplibregl.Map | null; light: boolean }) {
  const { overlay } = usePageMapOverlay();
  return overlay ? <PageMapLayer map={map} light={light} prefix={PAGE_LAYER_PREFIX} {...overlay} /> : null;
}

/** The main map's page layers' id prefix, apart from the map's own ids. */
export const PAGE_LAYER_PREFIX = 'page-';
