import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreWorker';
import { basemapStyle, showBasemapTheme } from '../lib/basemap';
import { BasemapCredit } from './BasemapCredit';
import { hourTime } from '../../shared/timeText';
import { AIRPORTS, landableAt, landableCount, type AirportDay } from '../data/airportHourly';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import { getAgencyArtifactUrls } from '../../shared/config';
import { routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { headwayToTierColor, type ColorVisionMode } from '../utils/colors';
import { ROUTE_LINE_WIDTH_BY_ZOOM } from './Interval/map/routeStyle';

/**
 * CIV-1550: the airport story's sticky map (the Frequent service story's pattern, FrequentServiceStoryMap). Every airport
 * is a dot, filled when a bus or train leaves for downtown within 60 minutes of landing at the step's hour and grey
 * otherwise. Pearson is ringed throughout. Dev only, like the page.
 */
interface Props {
  day: AirportDay;
  hour: number;
  /** How far the scroll section has blended to the dark tokens, 0 (day) to 1 (night); 1 for a reader already in dark mode. */
  night: number;
  /** Zoomed in on Pearson with the routes leaving its terminals at 11 PM (the 11 PM card). */
  pearson: boolean;
  colorMode: ColorVisionMode;
  children: ReactNode;
}

const HIGHLIGHT = 'YYZ';
/** Canada and the lower 48, Victoria to St. John's. Anchorage, Whitehorse and the two Hawaii airports sit outside it. */
const VIEW: maplibregl.LngLatBoundsLike = [[-126, 24.5], [-52, 54]];
/** Pearson to Union Station, wide enough for the routes' first stretch out of the airport. */
const PEARSON_VIEW: maplibregl.LngLatBoundsLike = [[-79.76, 43.6], [-79.33, 43.77]];

/**
 * The routes drawn at the 11 PM card, picked from the agencies' GTFS (feeds of the 2026-11-14 study): every route with a
 * departure between 11 PM and midnight on Tuesday 2026-11-17 from a stop within 400 m of the Terminal 1 and Terminal 3
 * stops. Viscount station (the terminal train's other end) is not a terminal stop, so routes serving only it are out.
 */
export const PEARSON_ROUTES: Record<string, string[]> = {
  upexpress: ['UP'],
  ttc: ['52', '900'],
  miway: ['7'],
  brampton: ['115'],
  go: ['40', '94'],
};

type RouteFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

/** The weekday rows of the picked routes, coloured as the main map colours a route for the Late period (11 PM on). */
export function pearsonRouteCollection(rows: Array<{ slug: string; features: GeoJSON.Feature[] }>, mode: ColorVisionMode): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const { slug, features: all } of rows) {
    const picked = PEARSON_ROUTES[slug] ?? [];
    for (const f of all) {
      const props = (f.properties ?? {}) as { day?: string; routeShortName?: string; routeId?: string };
      if (props.day !== 'Weekday') continue;
      if (f.geometry?.type !== 'LineString' && f.geometry?.type !== 'MultiLineString') continue;
      if (!picked.includes(String(props.routeShortName ?? props.routeId))) continue;
      features.push({ type: 'Feature', geometry: (f as RouteFeature).geometry, properties: { color: headwayToTierColor(routeFilterHeadway(props, 'late'), mode) } });
    }
  }
  return { type: 'FeatureCollection', features };
}

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function airportCollection(day: AirportDay, hour: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: AIRPORTS.map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { code: a.code, on: landableAt(a, day, hour), highlight: a.code === HIGHLIGHT },
    })),
  };
}

/** A small clock face with the hour hand at the step's hour (decorative; the time is written beside it). */
function Clock({ hour }: { hour: number }) {
  const angle = ((hour % 12) / 12) * 2 * Math.PI;
  const x = 12 + 6 * Math.sin(angle);
  const y = 12 - 6 * Math.cos(angle);
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" />
      {[0, 90, 180, 270].map(deg => <line key={deg} x1="12" y1="3.5" x2="12" y2="5" stroke="var(--text-muted)" strokeWidth="1.25" transform={`rotate(${deg} 12 12)`} />)}
      <line x1="12" y1="12" x2={x} y2={y} stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.25" fill="var(--text-primary)" />
    </svg>
  );
}

/** On a narrow, tall map the step text covers the top: the airports sit below it. */
export function viewPadding(width: number, height: number): maplibregl.PaddingOptions {
  const narrow = width < 640 && height > width;
  return { top: narrow ? Math.round(height * 0.38) : 24, bottom: 24, left: 24, right: 24 };
}

export default function AirportStoryMap({ day, hour, night, pearson, colorMode, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const collection = useMemo(() => airportCollection(day, hour), [day, hour]);
  const [routeRows, setRouteRows] = useState<Array<{ slug: string; features: GeoJSON.Feature[] }>>([]);
  const routes = useMemo(() => pearsonRouteCollection(routeRows, colorMode), [routeRows, colorMode]);
  const pearsonRef = useRef(pearson);
  pearsonRef.current = pearson;
  const count = useMemo(() => landableCount(AIRPORTS, day, hour), [day, hour]);

  // Colours come from the tokens on the map's own box, which follow the section's theme.
  const paint = () => {
    const map = mapRef.current;
    // Not map.isStyleLoaded(): it stays false while basemap tiles load. Layers not added yet are skipped.
    if (!map || !box.current) return;
    const css = getComputedStyle(box.current);
    const token = (name: string) => css.getPropertyValue(name).trim();
    // The basemap crossfades with the section: the light layer stays under the dark one, whose opacity follows `night`.
    showBasemapTheme(map, true);
    if (map.getLayer('basemap-dark')) {
      map.setLayoutProperty('basemap-dark', 'visibility', night > 0 ? 'visible' : 'none');
      map.setPaintProperty('basemap-dark', 'raster-opacity', night);
      map.setPaintProperty('basemap-dark', 'raster-fade-duration', 0);
    }
    if (!map.getLayer('airports')) return;
    map.setPaintProperty('airports', 'circle-color', ['case', ['get', 'on'], token('--accent'), token('--text-dim')]);
    map.setPaintProperty('airports', 'circle-stroke-color', token('--bg-app'));
    map.setPaintProperty('airport-highlight', 'circle-stroke-color', token('--text-primary'));
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({ container: box.current, style: basemapStyle(night < 1, { labels: false }), bounds: VIEW, fitBoundsOptions: { padding: viewPadding(box.current.clientWidth, box.current.clientHeight) }, interactive: false, attributionControl: false, fadeDuration: 0 });
    mapRef.current = map;
    map.on('load', () => {
      map.addSource('pearson-routes', { type: 'geojson', data: routes });
      map.addLayer({
        id: 'pearson-routes', type: 'line', source: 'pearson-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ROUTE_LINE_WIDTH_BY_ZOOM as unknown as number, 'line-opacity': 0, 'line-opacity-transition': { duration: 0, delay: 0 } },
      });
      map.addSource('airports', { type: 'geojson', data: collection });
      map.addLayer({
        id: 'airports', type: 'circle', source: 'airports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 5, 5.5],
          'circle-color': '#888', 'circle-opacity': ['case', ['get', 'on'], 0.95, 0.4],
          'circle-stroke-width': 0.75, 'circle-stroke-color': '#fff',
        },
      });
      map.addLayer({
        id: 'airport-highlight', type: 'circle', source: 'airports', filter: ['==', ['get', 'highlight'], true],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 7, 5, 10], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2, 'circle-stroke-color': '#000' },
      });
      setMapReady(true);
    });
    const resize = new ResizeObserver(() => { map.resize(); map.fitBounds(pearsonRef.current ? PEARSON_VIEW : VIEW, { padding: viewPadding(map.getContainer().clientWidth, map.getContainer().clientHeight), animate: false }); });
    resize.observe(box.current);
    return () => { resize.disconnect(); setMapReady(false); map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (mapRef.current?.getSource('airports') as maplibregl.GeoJSONSource | undefined)?.setData(collection);
  }, [collection, mapReady]);

  useEffect(paint, [night, mapReady]);

  // The routes load once, after the map: five agency files the main map also reads.
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    Promise.all(Object.keys(PEARSON_ROUTES).map(slug =>
      fetchAgencyGeo({ slug, name: slug, url: getAgencyArtifactUrls(slug).url })
        .then(data => ({ slug, features: data.features }))
        .catch(() => ({ slug, features: [] as GeoJSON.Feature[] }))))
      .then(rows => { if (!cancelled) setRouteRows(rows); });
    return () => { cancelled = true; };
  }, [mapReady]);

  useEffect(() => {
    (mapRef.current?.getSource('pearson-routes') as maplibregl.GeoJSONSource | undefined)?.setData(routes);
  }, [routes, mapReady]);

  // The 11 PM card flies in to Pearson and the 3 AM card back out to the continent; with reduced motion it jumps.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const container = map.getContainer();
    const reduced = prefersReducedMotion();
    map.fitBounds(pearson ? PEARSON_VIEW : VIEW, { padding: viewPadding(container.clientWidth, container.clientHeight), duration: reduced ? 0 : 1600, essential: false });
    if (map.getLayer('pearson-routes')) map.setPaintProperty('pearson-routes', 'line-opacity', pearson ? 0.9 : 0);
  }, [pearson, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // The Frequent service story's sizes (#1310): pinned at top-16 below lg, top-24 from lg.
    <figure className="flex h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-8rem)] min-h-0 flex-col overflow-hidden border-y border-[var(--border-primary)] bg-[var(--bg-panel)] sm:rounded-[2rem] sm:border">
      <div className="relative min-h-0 flex-1 bg-[var(--bg-app)]">
        <div ref={box} className="h-full w-full" role="img" aria-label={`Airports with a ride downtown within the hour at ${hourTime(hour)}: ${count} of ${AIRPORTS.length}`} />
        <div className="absolute left-5 top-5 z-10 w-[calc(100%-2.5rem)] max-w-md rounded-2xl bg-[var(--bg-app)]/90 p-5 backdrop-blur">
          {children}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 pb-6 pt-4 text-xs text-[var(--text-muted)]">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><BasemapCredit /></span>
        <span className="flex items-center gap-2">
          <Clock hour={hour} />
          <span className="flex flex-col items-start sm:items-end sm:text-right">
            <span className="font-bold text-[var(--text-primary)]">{hourTime(hour)}</span>
            <span>{count} of {AIRPORTS.length} airports</span>
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
