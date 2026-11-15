import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { CONTEXT_LAYER_URL, FEATURES } from '../../../../shared/config';
import {
  CONTEXT_FILL_OPACITY, CONTEXT_NO_DATA_COLOUR, contextFillColorExpr, contextNoDataFilter, contextValidFilter,
  type ContextMetric, type ContextProps,
} from '../../../utils/contextLayer';

/** The layer needs the flag AND a data URL; with either missing nothing is ever added or fetched. */
export const contextLayerAvailable = (): boolean => FEATURES.contextLayer && Boolean(CONTEXT_LAYER_URL);

export const CONTEXT_SOURCE_ID = 'context-pmtiles';
export const CONTEXT_FILL_LAYER = 'context-fill';
export const CONTEXT_NODATA_LAYER = 'context-nodata';
export const CONTEXT_HATCH_LAYER = 'context-nodata-hatch';
const HATCH_IMAGE = 'context-hatch';
// The first layer after the basemap: everything the context layer must sit under (on-demand zones, route lines, stops, labels).
const BEFORE_LAYER = 'on-demand-service-area-fill';

export interface ContextPopupState { x: number; y: number; props: ContextProps; pinned: boolean }

/** A small diagonal-line tile for the no-data fill. */
function hatchImage(): ImageData {
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = CONTEXT_NO_DATA_COLOUR;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const o of [-size, 0, size]) { ctx.moveTo(o, size); ctx.lineTo(o + size, 0); }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function removeContextLayers(map: maplibregl.Map) {
  for (const id of [CONTEXT_HATCH_LAYER, CONTEXT_NODATA_LAYER, CONTEXT_FILL_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(CONTEXT_SOURCE_ID)) map.removeSource(CONTEXT_SOURCE_ID);
}

/**
 * Population density / median household income fill under the route lines. Fully inert unless the flag and the data
 * URL are both set AND a metric is chosen: the source is added only then (so the file is never requested otherwise)
 * and removed when the layer is switched off.
 */
export function useContextLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  metric: ContextMetric | null,
) {
  const [popup, setPopup] = useState<ContextPopupState | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const active = contextLayerAvailable() ? metric : null;
  const pinnedRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!active) {
      removeContextLayers(map);
      pinnedRef.current = false;
      setPopup(null);
      setYear(null);
      return;
    }
    if (!map.getSource(CONTEXT_SOURCE_ID)) {
      map.addSource(CONTEXT_SOURCE_ID, { type: 'vector', url: `pmtiles://${CONTEXT_LAYER_URL}` });
      if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(), { pixelRatio: 2 });
      const before = map.getLayer(BEFORE_LAYER) ? BEFORE_LAYER : undefined;
      map.addLayer({ id: CONTEXT_FILL_LAYER, type: 'fill', source: CONTEXT_SOURCE_ID, 'source-layer': 'context', paint: { 'fill-opacity': CONTEXT_FILL_OPACITY, 'fill-color': '#000', 'fill-antialias': ['step', ['zoom'], false, 10, true] } }, before);
      map.addLayer({ id: CONTEXT_NODATA_LAYER, type: 'fill', source: CONTEXT_SOURCE_ID, 'source-layer': 'context', paint: { 'fill-color': CONTEXT_NO_DATA_COLOUR, 'fill-opacity': 0.18 } }, before);
      map.addLayer({ id: CONTEXT_HATCH_LAYER, type: 'fill', source: CONTEXT_SOURCE_ID, 'source-layer': 'context', paint: { 'fill-pattern': HATCH_IMAGE, 'fill-opacity': 0.9 } }, before);
    }
    map.setFilter(CONTEXT_FILL_LAYER, contextValidFilter(active) as any);
    map.setPaintProperty(CONTEXT_FILL_LAYER, 'fill-color', contextFillColorExpr(active) as any);
    for (const id of [CONTEXT_NODATA_LAYER, CONTEXT_HATCH_LAYER]) map.setFilter(id, contextNoDataFilter(active) as any);
    setPopup(null);
    pinnedRef.current = false;

    // The legend names the survey years, read from the tiles (the last year of the 5-year window).
    const readYear = () => {
      if (!map.getSource(CONTEXT_SOURCE_ID)) return;
      const f = map.querySourceFeatures(CONTEXT_SOURCE_ID, { sourceLayer: 'context' }).find(x => typeof x.properties?.acs_year === 'number');
      if (f) setYear(f.properties.acs_year as number);
    };
    const onSourceData = (e: maplibregl.MapSourceDataEvent) => { if (e.sourceId === CONTEXT_SOURCE_ID && e.isSourceLoaded) readYear(); };
    map.on('sourcedata', onSourceData);

    const hit = (point: maplibregl.PointLike) => {
      const layers = [CONTEXT_FILL_LAYER, CONTEXT_NODATA_LAYER].filter(id => map.getLayer(id));
      return layers.length ? map.queryRenderedFeatures(point, { layers })[0] : undefined;
    };
    const routeAt = (point: maplibregl.Point) => {
      const layers = ['stops-layer', 'overview-routes-hit-layer', 'routes-hit-layer', 'local-routes-hit-layer'].filter(id => map.getLayer(id));
      return layers.length > 0 && map.queryRenderedFeatures([[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]], { layers }).length > 0;
    };
    const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
    // Hover shows the figure on desktop; a click pins it (the only way on touch screens) until it is closed.
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!finePointer || pinnedRef.current) return;
      const f = routeAt(e.point) ? undefined : hit(e.point);
      setPopup(f ? { x: e.point.x, y: e.point.y, props: f.properties as ContextProps, pinned: false } : null);
    };
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (routeAt(e.point)) return;
      const f = hit(e.point);
      pinnedRef.current = Boolean(f);
      setPopup(f ? { x: e.point.x, y: e.point.y, props: f.properties as ContextProps, pinned: true } : null);
    };
    const onLeave = () => { if (!pinnedRef.current) setPopup(null); };
    map.on('mousemove', onMove);
    map.on('click', onClick);
    map.getCanvas().addEventListener('mouseleave', onLeave);
    return () => {
      map.off('sourcedata', onSourceData);
      map.off('mousemove', onMove);
      map.off('click', onClick);
      map.getCanvas().removeEventListener('mouseleave', onLeave);
    };
  }, [mapLoaded, active]);

  const closePopup = () => { pinnedRef.current = false; setPopup(null); };
  return { popup, year, closePopup };
}
