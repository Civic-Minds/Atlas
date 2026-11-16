import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreWorker';
import { basemapStyle, showBasemapTheme } from '../lib/basemap';
import { BasemapCredit } from './BasemapCredit';
import { hourTime } from '../../shared/timeText';
import { AIRPORTS, landableAt, landableCount, type AirportDay } from '../data/airportHourly';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import { FADED_OPACITY } from './charts/useActivePart';
import { getAgencyArtifactUrls } from '../../shared/config';
import { routeFilterHeadway, type HeadwayFilterPeriod } from '../../shared/routeHeadwayFilter';
import { headwayToTierColor, type ColorVisionMode } from '../utils/colors';

/**
 * CIV-1550: the airport story's sticky map (the Frequent service story's pattern, FrequentServiceStoryMap). Every airport
 * is a dot, filled when a bus or train leaves for downtown within 60 minutes of landing at the step's hour and a faint
 * outline otherwise. Pearson is ringed throughout, and so is the airport of the active zoom. At some cards the map flies in to one airport and its routes (ZOOMS).
 * Dev only, like the page.
 */
interface Props {
  day: AirportDay;
  hour: number;
  /** The reader's theme for the basemap: 0 light, 1 dark (the page no longer blends to dark at night, CIV-1550). */
  night: number;
  /** The airport code of the zoom in ZOOMS the map is flown in to, or null for the continent view. */
  zoom: string | null;
  colorMode: ColorVisionMode;
  children: ReactNode;
}

const HIGHLIGHT = 'YYZ';
/** Canada and the lower 48, Victoria to St. John's. Anchorage, Whitehorse and the two Hawaii airports sit outside it. */
const VIEW: maplibregl.LngLatBoundsLike = [[-126, 24.5], [-52, 54]];
/** One fly-in: from the slot of `hour` until the slot of `until`, the map shows one airport and the routes serving it. */
export interface StoryZoom {
  hour: number;
  /** The hour the map flies back out to the continent view. */
  until: number;
  code: string;
  view: maplibregl.LngLatBoundsLike;
  /** The main map's period whose headway colours the routes. */
  period: HeadwayFilterPeriod;
  /** Route short names (or route IDs) by agency slug. */
  routes: Record<string, string[]>;
  /** Routes drawn at the charts' faded opacity: none of them leaves the airport in the zoom's hours. */
  faded: boolean;
}

export const ZOOMS: StoryZoom[] = [
  // Memphis's midday gap: route 28, the only route at the airport (study of 2026-11-14), has no weekday departure in the
  // 11 AM and 12 PM hours, so the airport shows as a faint outline and the route faded. Back out at 1 PM. The view runs
  // from the airport to downtown, the route's full length.
  {
    hour: 11, until: 13, code: 'MEM', view: [[-90.07, 34.99], [-89.92, 35.17]], period: 'midday', faded: true,
    routes: { mata: ['28'] },
  },
  // Pearson at 11 PM, back out at the 3 AM card; Pearson to Union Station, wide enough for the routes' first stretch out
  // of the airport. The routes, picked from the agencies' GTFS (feeds of the 2026-11-14 study): every route with a
  // departure between 11 PM and midnight on Tuesday 2026-11-17 from a stop within 400 m of the Terminal 1 and Terminal 3
  // stops. Viscount station (the terminal train's other end) is not a terminal stop, so routes serving only it are out.
  {
    hour: 23, until: 3, code: 'YYZ', view: [[-79.76, 43.6], [-79.33, 43.77]], period: 'late', faded: false,
    routes: { upexpress: ['UP'], ttc: ['52', '900'], miway: ['7'], brampton: ['115'], go: ['40', '94'] },
  },
];

/** Every agency any zoom draws routes from. */
const ZOOM_AGENCIES = [...new Set(ZOOMS.flatMap(z => Object.keys(z.routes)))];

const ROUTE_WIDTH = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 11, 3, 14, 4];
const ROUTE_CASING_WIDTH = ['interpolate', ['linear'], ['zoom'], 8, 4.5, 11, 5, 14, 6.5];

type RouteFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

/**
 * The weekday rows of every zoom's routes, each coloured as the main map colours the route for the zoom's period and
 * tagged with the zoom's airport code, so one layer shows only the active zoom's routes.
 */
function zoomRouteCollection(rows: Array<{ slug: string; features: GeoJSON.Feature[] }>, mode: ColorVisionMode): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const zoom of ZOOMS) {
    for (const { slug, features: all } of rows) {
      const picked = zoom.routes[slug];
      if (!picked) continue;
      for (const f of all) {
        const props = (f.properties ?? {}) as { day?: string; routeShortName?: string; routeId?: string };
        if (props.day !== 'Weekday') continue;
        if (f.geometry?.type !== 'LineString' && f.geometry?.type !== 'MultiLineString') continue;
        if (!picked.includes(String(props.routeShortName ?? props.routeId))) continue;
        features.push({ type: 'Feature', geometry: (f as RouteFeature).geometry, properties: { zoom: zoom.code, color: headwayToTierColor(routeFilterHeadway(props, zoom.period), mode) } });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function airportCollection(day: AirportDay, hour: number, zoom: string | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: AIRPORTS.map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { code: a.code, on: landableAt(a, day, hour), highlight: a.code === HIGHLIGHT || a.code === zoom },
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
function viewPadding(width: number, height: number): maplibregl.PaddingOptions {
  const narrow = width < 640 && height > width;
  return { top: narrow ? Math.round(height * 0.38) : 24, bottom: 24, left: 24, right: 24 };
}

export default function AirportStoryMap({ day, hour, night, zoom, colorMode, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const collection = useMemo(() => airportCollection(day, hour, zoom), [day, hour, zoom]);
  const [routeRows, setRouteRows] = useState<Array<{ slug: string; features: GeoJSON.Feature[] }>>([]);
  const routes = useMemo(() => zoomRouteCollection(routeRows, colorMode), [routeRows, colorMode]);
  const activeZoom = ZOOMS.find(z => z.code === zoom) ?? null;
  const viewRef = useRef(activeZoom?.view ?? VIEW);
  viewRef.current = activeZoom?.view ?? VIEW;
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
    // Ryan's pick (CIV-1550): an airport with no ride in the hour stays on the map as a faint outline, in the dim text
    // token at the charts' shared faded opacity, so it reads in both themes; served airports are filled with the accent.
    map.setPaintProperty('airports', 'circle-color', ['case', ['get', 'on'], token('--accent'), 'rgba(0,0,0,0)']);
    map.setPaintProperty('airports', 'circle-stroke-color', ['case', ['get', 'on'], token('--bg-app'), token('--text-dim')]);
    map.setPaintProperty('airport-highlight', 'circle-stroke-color', token('--text-primary'));
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({ container: box.current, style: basemapStyle(night < 1, { labels: false }), bounds: VIEW, fitBoundsOptions: { padding: viewPadding(box.current.clientWidth, box.current.clientHeight) }, interactive: false, attributionControl: false, fadeDuration: 0 });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __airportMap?: maplibregl.Map }).__airportMap = map;
    map.on('load', () => {
      map.addSource('zoom-routes', { type: 'geojson', data: routes });
      // A casing in the background colour under each route keeps the lines apart from the basemap's grey roads at night
      // (the hourly routes' brown and grey tiers otherwise sink into them); the lines are a little wider than the main
      // map's, since the story map is seen whole rather than zoomed into.
      map.addLayer({
        id: 'zoom-routes-casing', type: 'line', source: 'zoom-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000', 'line-width': ROUTE_CASING_WIDTH as unknown as number, 'line-opacity': 0 },
      });
      map.addLayer({
        id: 'zoom-routes', type: 'line', source: 'zoom-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ROUTE_WIDTH as unknown as number, 'line-opacity': 0 },
      });
      map.addSource('airports', { type: 'geojson', data: collection });
      map.addLayer({
        id: 'airports', type: 'circle', source: 'airports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 5, 5.5],
          'circle-color': '#888', 'circle-opacity': ['case', ['get', 'on'], 0.95, 0],
          'circle-stroke-width': ['case', ['get', 'on'], 0.75, 1.25], 'circle-stroke-color': '#fff',
          'circle-stroke-opacity': ['case', ['get', 'on'], 1, FADED_OPACITY],
        },
      });
      map.addLayer({
        id: 'airport-highlight', type: 'circle', source: 'airports', filter: ['==', ['get', 'highlight'], true],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 7, 5, 10], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2, 'circle-stroke-color': '#000' },
      });
      setMapReady(true);
    });
    const resize = new ResizeObserver(() => { map.resize(); map.fitBounds(viewRef.current, { padding: viewPadding(map.getContainer().clientWidth, map.getContainer().clientHeight), animate: false }); });
    resize.observe(box.current);
    return () => { resize.disconnect(); setMapReady(false); map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (mapRef.current?.getSource('airports') as maplibregl.GeoJSONSource | undefined)?.setData(collection);
  }, [collection, mapReady]);

  useEffect(paint, [night, mapReady]);

  // The routes start loading with the page, not at the first zoom: the agency files the main map also reads (TTC's is
  // about 24 MB). Each agency draws as soon as its file arrives, so a slow one does not hold back the rest, and a failed
  // load is reported in the console instead of leaving the zoom silently empty.
  useEffect(() => {
    let cancelled = false;
    for (const slug of ZOOM_AGENCIES) {
      fetchAgencyGeo({ slug, name: slug, url: getAgencyArtifactUrls(slug).url })
        .then(data => { if (!cancelled) setRouteRows(rows => [...rows.filter(r => r.slug !== slug), { slug, features: data.features }]); })
        .catch(err => console.warn(`Airport story: ${slug} routes did not load`, err));
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    (mapRef.current?.getSource('zoom-routes') as maplibregl.GeoJSONSource | undefined)?.setData(routes);
  }, [routes, mapReady]);

  // A zoom's first slot flies in to its airport and its `until` slot back out to the continent; with reduced motion it
  // jumps. Only the active zoom's routes show, at the charts' faded opacity when none of them runs in the zoom's hours.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const container = map.getContainer();
    const reduced = prefersReducedMotion();
    map.fitBounds(activeZoom?.view ?? VIEW, { padding: viewPadding(container.clientWidth, container.clientHeight), duration: reduced ? 0 : 1600, essential: false });
    if (map.getLayer('zoom-routes')) {
      const shown = (opacity: number): maplibregl.ExpressionSpecification => ['case', ['==', ['get', 'zoom'], zoom ?? ''], opacity, 0];
      const line = activeZoom?.faded ? FADED_OPACITY : 0.95;
      map.setPaintProperty('zoom-routes', 'line-opacity', shown(line));
      map.setPaintProperty('zoom-routes-casing', 'line-opacity', shown(activeZoom?.faded ? 0 : 0.6));
      map.setPaintProperty('zoom-routes-casing', 'line-color', getComputedStyle(container).getPropertyValue('--bg-app').trim() || '#000');
    }
  }, [zoom, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
