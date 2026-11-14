import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreWorker';
import { basemapStyle, showBasemapTheme } from '../lib/basemap';
import { BasemapCredit } from './BasemapCredit';
import { storyMapFailedText, storyMapLoadingText } from '../content/noticeCopy';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import type { Agency } from '../App';
import { headwayOrBetter } from '../utils/headwayText';
import { featurePassesHeadwayFilter, routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { isLimitedService, type IrregularRouteProperties } from '../../shared/irregularRoutes';

interface Props {
  agencies: Agency[];
  stage: number;
  frequencyMinutes: 15 | 30;
  researchRecord: {
    agencyId: string;
    agencyName: string;
    representativeThresholdMinutes?: number | null;
  };
}

type StoryFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

function coordinatesFor(feature: StoryFeature): number[][][] {
  if (feature.geometry.type === 'LineString') return [feature.geometry.coordinates];
  return feature.geometry.coordinates;
}

function boundsOf(features: StoryFeature[]): maplibregl.LngLatBoundsLike | null {
  const points = features.flatMap(feature => coordinatesFor(feature).flat());
  if (points.length === 0) return null;
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

/**
 * #1433: the rows the story counts. Weekday rows only, as the caption says ("Weekday daytime"): a route's Saturday or Sunday
 * row must not carry it into a stage its weekday service does not reach. The map draws these rows, and any number shown
 * beside it must count the same ones.
 */
export function storyRows(features: Array<GeoJSON.Feature | null | undefined>): StoryFeature[] {
  return features.filter((feature): feature is StoryFeature =>
    (feature?.geometry?.type === 'LineString' || feature?.geometry?.type === 'MultiLineString')
    && (feature.properties as { day?: string } | null)?.day === 'Weekday');
}

// #1434: limited service as the main map's hide-limited filter reads it (isLimitedService), not the row's own class: a
// route the map treats as all-day (TTC Line 1) is not removed as rush-hour-only.
function isNotRushHourOnly(feature: StoryFeature): boolean {
  const properties = (feature.properties ?? {}) as IrregularRouteProperties;
  return !isLimitedService(properties) && properties.serviceClass !== 'irregular';
}

// Midday service as the route card and the map filter read it (#750): the route's filter value,
// not a row's own terminal reading, which can show midday service the route does not run.
function runsThroughTheDay(feature: StoryFeature): boolean {
  const properties = feature.properties as { researchFrequentService?: { daytime30?: boolean } } | null;
  return properties?.researchFrequentService?.daytime30 === true || (properties != null && routeFilterHeadway(properties, 'midday') != null);
}

// CIV-1410: the frequency step reads the main map's own frequency filter (featurePassesHeadwayFilter, the route's typical
// wait with the worst direction deciding) in each daytime period, so a route the map shows at 15 or better stays here.
// The strict daytime15 flag (no single gap over 15 minutes) dropped routes the map shows as frequent, like TTC 501 Queen.
const DAYTIME_PERIODS = ['amPeak', 'midday', 'pmPeak'] as const;
function meetsOnTheMainMap(feature: StoryFeature, maxHeadway: number): boolean {
  const properties = feature.properties;
  return properties != null && DAYTIME_PERIODS.every(period => featurePassesHeadwayFilter(properties, period, maxHeadway));
}

export function featuresForStage(features: StoryFeature[], stage: number, frequencyMinutes: 15 | 30) {
  if (stage === 0) return features;
  const daytimeFeatures = features.filter(feature => isNotRushHourOnly(feature) && runsThroughTheDay(feature));
  if (stage === 1) return features.filter(isNotRushHourOnly);
  if (stage === 2) return daytimeFeatures;
  return daytimeFeatures.filter(feature => {
    if (frequencyMinutes === 15) return meetsOnTheMainMap(feature, 15);
    const properties = feature.properties as { researchFrequentService?: { daytime30?: boolean } } | null;
    return properties?.researchFrequentService?.daytime30 === true;
  });
}

/**
 * CIV-1424: how many routes the map draws at a stage. The map draws one row per direction (and day), so the count is of
 * routes, from the same rows `featuresForStage` gives the map, and follows the data rather than a written number.
 */
export function routeCountForStage(features: StoryFeature[], stage: number, frequencyMinutes: 15 | 30): number {
  const routes = new Set(featuresForStage(features, stage, frequencyMinutes).map(feature => {
    const properties = (feature.properties ?? {}) as { routeId?: string; routeBranch?: string | null };
    return `${properties.routeId ?? ''}::${properties.routeBranch ?? ''}`;
  }));
  return routes.size;
}

/**
 * Every route once, with `keep`: the last stage it is still shown at (each stage keeps a subset of the one before), so one
 * layer per stage can filter on it and the stages cross-fade as the SVG's paths did.
 */
export function stageCollection(features: StoryFeature[], frequencyMinutes: 15 | 30): GeoJSON.FeatureCollection {
  const kept = [1, 2, 3].map(stage => new Set(featuresForStage(features, stage, frequencyMinutes)));
  return {
    type: 'FeatureCollection',
    features: features.map(feature => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { keep: kept.filter(set => set.has(feature)).length },
    })),
  };
}

const STAGES = [0, 1, 2, 3] as const;
const FADE_MS = 700;

/**
 * The map's layers. `routes` is the grey base of every route; each `stage-N` draws only the routes still kept at stage N
 * (`keep >= N`). `minKeep` is the lowest `keep` a layer draws.
 */
export const STORY_LAYERS = [
  { id: 'routes', minKeep: 0 },
  ...STAGES.map(stage => ({ id: `stage-${stage}`, minKeep: stage })),
] as const;

/**
 * CIV-1408: the opacity each layer ends at for a stage. Only the stage's own layer is lit, and the grey base only at stage 0,
 * so a route that no longer qualifies is on no lit layer: it fades out with the layers it was on and is not drawn at all
 * (MapLibre skips a line layer at opacity 0). Scrolling back up lights the earlier layers again, which fades it back in.
 */
export function storyLayerOpacity(stage: number): Record<string, number> {
  const opacity: Record<string, number> = { routes: stage === 0 ? 0.34 : 0 };
  for (const s of STAGES) opacity[`stage-${s}`] = stage === s ? 0.88 : 0;
  return opacity;
}

/** The fade between stages; none for a reader who asked for reduced motion, as the page's CSS transitions do. */
export function storyFade(reducedMotion: boolean) {
  return { duration: reducedMotion ? 0 : FADE_MS, delay: 0 };
}
const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isLight = () => document.documentElement.getAttribute('data-theme') !== 'dark';
const cssColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function FrequentServiceStoryMap({ agencies, stage, frequencyMinutes, researchRecord }: Props) {
  const [features, setFeatures] = useState<StoryFeature[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const storyAgency = agencies.find(agency => agency.slug === researchRecord.agencyId);

  useEffect(() => {
    if (!storyAgency) return;
    let cancelled = false;
    setLoadState('loading');
    fetchAgencyGeo(storyAgency)
      .then(data => {
        if (cancelled) return;
        // fetchAgencyGeo has already applied the map's filter inputs (normalizeRouteFilterFeatures).
        setFeatures(storyRows(data.features));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [storyAgency]);

  const collection = useMemo(() => stageCollection(features, frequencyMinutes), [features, frequencyMinutes]);
  const bounds = useMemo(() => boundsOf(features), [features]);
  const routeCount = useMemo(() => routeCountForStage(features, stage, frequencyMinutes), [features, stage, frequencyMinutes]);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const ready = loadState === 'ready' && bounds != null;

  // CIV-1168 (Ryan's pick B): the routes on Atlas's light or dark basemap without place names. Not interactive: the page scrolls past it.
  useEffect(() => {
    if (!ready || !box.current) return;
    const map = new maplibregl.Map({ container: box.current, style: basemapStyle(isLight(), { labels: false }), bounds: bounds!, fitBoundsOptions: { padding: 28 }, interactive: false, attributionControl: false, fadeDuration: 0 });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __storyMap?: maplibregl.Map }).__storyMap = map;
    const paint = () => {
      if (!map.isStyleLoaded()) return;
      const light = isLight();
      showBasemapTheme(map, light);
      if (!map.getLayer('routes')) return;
      map.setPaintProperty('routes', 'line-color', cssColor('--text-dim'));
      for (const s of STAGES) map.setPaintProperty(`stage-${s}`, 'line-color', cssColor('--accent'));
    };
    map.on('load', () => {
      map.addSource('story', { type: 'geojson', data: collection });
      const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
      const fade = storyFade(prefersReducedMotion());
      for (const { id, minKeep } of STORY_LAYERS) {
        const base = id === 'routes';
        map.addLayer({ id, type: 'line', source: 'story', filter: ['>=', ['get', 'keep'], minKeep], layout: line, paint: { 'line-color': cssColor(base ? '--text-dim' : '--accent'), 'line-width': base ? 1.1 : 2.1, 'line-opacity': base ? storyLayerOpacity(0).routes : 0, 'line-opacity-transition': fade } });
      }
      // A theme switch while the style was loading was skipped: draw the theme the page has now.
      paint();
      setMapReady(true);
    });
    const theme = new MutationObserver(paint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const resize = new ResizeObserver(() => { map.resize(); map.fitBounds(bounds!, { padding: 28, animate: false }); });
    resize.observe(box.current);
    return () => { theme.disconnect(); resize.disconnect(); setMapReady(false); map.remove(); mapRef.current = null; };
  }, [ready, bounds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const source = mapRef.current?.getSource('story') as maplibregl.GeoJSONSource | undefined;
    source?.setData(collection);
  }, [collection, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const [id, opacity] of Object.entries(storyLayerOpacity(stage))) map.setPaintProperty(id, 'line-opacity', opacity);
  }, [stage, mapReady]);

  return (
    // #1310: below lg the map is pinned at top-16 (4rem), so it fills the rest of the screen; from lg it sits at top-24 with 2rem below.
    <figure className="flex h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-8rem)] min-h-0 flex-col overflow-hidden border-y border-[var(--border-primary)] bg-[var(--bg-panel)] sm:rounded-[2rem] sm:border">
      <div className="relative min-h-0 flex-1 bg-[var(--bg-app)]">
        {ready ? (
          <div ref={box} className="h-full w-full" role="img" aria-label={stage === 3 ? `Toronto routes with weekday daytime service ${headwayOrBetter(frequencyMinutes)}` : 'Toronto routes remaining in the story'} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            {loadState === 'error' ? storyMapFailedText(researchRecord.agencyName) : storyMapLoadingText(researchRecord.agencyName)}
          </div>
        )}
        <div className="absolute left-5 top-5 z-10 w-[calc(100%-2.5rem)] max-w-md rounded-2xl bg-[var(--bg-app)]/90 p-5 backdrop-blur">
          {stage === 0 && <>
            <h2 id="network-story-heading" className="text-3xl font-black tracking-tight">Start with the whole network.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">This is coverage: every weekday route that reaches somewhere, whether it comes often or not.</p>
          </>}
          {stage === 1 && <>
            <h2 className="text-3xl font-black tracking-tight">Remove limited-service routes.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Some routes are built for the busiest hours and disappear when demand drops, and some run only a few trips a day. Useful for some riders, but not service you can count on all day.</p>
          </>}
          {stage === 2 && <>
            <h2 className="text-3xl font-black tracking-tight">Keep routes that run through the day.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Now we keep routes that run in the middle of the day. Night-only routes, like Toronto's 300 buses, drop out here. Service is more useful when it is still there when your trip does not fit rush hour.</p>
          </>}
          {stage === 3 && <>
            <h2 className="text-3xl font-black tracking-tight">Now measure how often it comes.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">This is frequency, or headway: how long until the next vehicle. When service comes every 10 or 15 minutes, missing one does not have to derail your trip.</p>
          </>}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 pb-6 pt-4 text-xs text-[var(--text-muted)]">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">{researchRecord.agencyName}{ready && <BasemapCredit />}</span>
        <span className="flex flex-col items-start gap-y-1 sm:items-end sm:text-right">
          <span>{stage === 0 ? 'All weekday routes' : stage === 1 ? 'Limited-service routes removed' : stage === 2 ? 'Routes with sustained daytime service' : `Weekday daytime · ${headwayOrBetter(frequencyMinutes)}`}</span>
          {ready && <span className="tabular-nums">{routeCount} routes</span>}
        </span>
      </figcaption>
    </figure>
  );
}
