import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from '../../lib/mapStyle';
import { LATE_SHARE_SWATCH } from './lateShare';
import { numberedDots, type LateStopDot } from './lateStopsMapModel';

/**
 * A small map of the stops most often late (CIV-1405 mock-up): the Atlas basemap with one numbered dot per stop, the
 * number being the stop's rank in the table beside it. A bigger dot is late more often. `lines` draws a route under the
 * dots (the route page). It frames the dots and lines once drawn; it can be dragged, and zooms with a pinch or double
 * click, never with the scroll wheel, so the page keeps scrolling over it.
 */
export default function LateStopsMap({ dots, lines = [], label, note, mapClassName = 'h-72', className = '' }: {
  dots: readonly LateStopDot[];
  /** Route lines to draw under the dots, each a list of [longitude, latitude]. */
  lines?: ReadonlyArray<ReadonlyArray<[number, number]>>;
  /** What the map shows, for screen readers (the table beside it holds the same stops and figures). */
  label: string;
  /** A line added to the caption (which dots have no table row). */
  note?: string;
  /** The map's height (Tailwind classes). */
  mapClassName?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ dots, lines });
  latest.current = { dots, lines };
  const key = `${dots.map(d => `${d.key}:${d.size}`).join('|')}#${lines.length}`;

  useEffect(() => {
    if (!box.current) return;
    const light = document.documentElement.getAttribute('data-theme') !== 'dark';
    const map = new maplibregl.Map({ container: box.current, style: getMapStyle(light), center: [-79.38, 43.65], zoom: 11, attributionControl: false, scrollZoom: false, dragRotate: false, pitchWithRotate: false });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const markers: maplibregl.Marker[] = [];
    map.on('load', () => {
      const { dots: ds, lines: ls } = latest.current;
      const dim = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#6b7280';
      if (ls.length) {
        map.addSource('late-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: ls.map(l => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: l as [number, number][] } })) } });
        map.addLayer({ id: 'late-lines', type: 'line', source: 'late-lines', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dim, 'line-width': 3, 'line-opacity': 0.7 } });
      }
      // Every dot sits at its own stop. Where dots crowd, only the best-ranked carry their number (drawn on top); the
      // rest get theirs as zooming in makes room. Hover always names the stop.
      const draw = () => {
        markers.splice(0).forEach(m => m.remove());
        const numbered = numberedDots(ds, p => map.project(p));
        for (const d of [...ds].sort((a, b) => b.rank - a.rank)) {
          const shown = numbered.has(d.key);
          const el = document.createElement('div');
          el.textContent = shown ? String(d.rank) : '';
          el.title = `${d.rank}. ${d.title}`;
          el.style.cssText = `width:${d.size}px;height:${d.size}px;border-radius:9999px;background:${d.color};border:2px solid var(--bg-app);box-shadow:0 0 0 1px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font:800 ${d.size >= 24 ? 12 : 10}px/1 Inter,system-ui,sans-serif;color:#111827;font-variant-numeric:tabular-nums;box-sizing:border-box;`;
          el.style.zIndex = String(shown ? 2000 - d.rank : 1000 - d.rank);
          markers.push(new maplibregl.Marker({ element: el }).setLngLat(d.lonLat).addTo(map));
        }
      };
      map.on('zoomend', draw);
      const points = [...ds.map(d => d.lonLat), ...ls.flat()];
      if (points.length) {
        const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
        map.resize();
        map.fitBounds(bounds, { padding: { top: 28, bottom: 28, left: 56, right: 56 }, maxZoom: 15, duration: 0 });
      }
      draw();
    });
    return () => { markers.forEach(m => m.remove()); map.remove(); };
  }, [key]);

  return (
    <figure className={`m-0 ${className}`}>
      <div ref={box} role="img" aria-label={label} className={`${mapClassName} isolate w-full overflow-hidden rounded-2xl border border-[var(--border-primary)]`} />
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[var(--text-muted)]">
        <span>Numbers match the table. A bigger dot is late more often. Zoom in to see the number on every dot.{note ? ` ${note}` : ''}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2 w-9 rounded-full" style={{ background: LATE_SHARE_SWATCH }} />under 10%, 10–20%, 20% or more</span>
      </figcaption>
    </figure>
  );
}
