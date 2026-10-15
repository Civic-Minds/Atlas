import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { LocateFixed, Plus, Minus, Link2, Flag, Download } from 'lucide-react';
import { routeKey } from '../../hooks/useIntervalStats';
import { type ColorVisionMode } from '../../utils/colors';
import { getRegionalView, getSavedView } from '../../utils/regionView';
import { useViewport } from '../../context/ViewportContext';
import { useHistoryMapOverlay } from '../../context/HistoryMapOverlay';
import { useLiveVehiclesMapOverlay } from '../../context/LiveVehiclesMapOverlay';
import { useHistoryLayer } from './map/useHistoryLayer';
import { addMapLayers } from './map/mapLayers';
import { resetRoutesLayerDefaultPaint as resetRouteLayersPaint, localRouteHeadwayColor } from './map/routeStyle';
import { useRouteStyling } from './map/useRouteStyling';
import { useSelectionFraming } from './map/useSelectionFraming';
import { useRouteLayerVisibility } from './map/useRouteLayerVisibility';
import { useViewSync } from './map/useViewSync';
import { useSectionColourFeatures } from './map/useSectionColours';
import { useGeoJsonFeaturesSource, useOnDemandSources, useNightServiceLayer, useFrequentServiceLayer } from './map/useOverlaySources';
import type { Agency } from '../../App';
import type { ShapeProperties, ViewportBounds, TimePeriod, HoveredBranch } from '../../hooks/useIntervalStats';
import type { DayType } from '../../../shared/dayTypes';
import { registerProtocol, getMapStyle, getActiveDataRelease } from '../../lib/mapStyle';
import { Z_PANEL, MAP_BADGE } from '../../styles';
import { useColorVision } from '../../context/ColorVisionContext';
import { routeFilterHeadway } from '../../../shared/routeHeadwayFilter';
import { isOnDemandStopFocused, isOnDemandZoneFocused, ON_DEMAND_FOCUSED_PROP, type OnDemandFocusTarget } from './map/onDemandFocus';
import { dedupeRouteKeysByDisplay } from '../../utils/routeKey';
import { computeFrequencySegmentOverlay } from '../../utils/frequencySegments';
import { buildSharedHoverSegments } from '../../utils/sharedHoverSegments';
import { dedupeMapContextByDisplay, getMapContextAgenciesFromFeatures, isMapContextOutsideClick, type MapContextAgency } from '../../utils/mapContext';
import { MapContextPanel } from './MapContextPanel';
import MapExportDialog from '../MapExportDialog';
import { waitForMapExportReady } from '../../utils/mapExport';
import { describeMapExport, type MapExportBox, type MapExportDetails, type MapExportView, type RenderedRouteSample } from '../../utils/mapExportDetails';
import { getRouteLabel, titleCase } from '../../utils/format';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../../shared/frequentService';
import { ON_DEMAND_MODE } from '../../../shared/modes';
import { useOnDemandStatus, useReportOnDemandVisible } from '../../hooks/useOnDemandData';
import { FEATURES } from '../../../shared/config';
import { trackEvent, withShareTags, SHARE_UTM_MEDIUM_LINK, type ShareMedium } from '../../lib/analytics';
import type { NightServiceFrequency } from '../../../shared/nightService';
import { markAtlasLatest } from '../../lib/performance';
import { isOnDemandStopShown, isOnDemandZoneShown, localDateIn, onDemandHoursConfirmed, onDemandStopZoneNames } from '../../../shared/onDemandAvailability';
import Panel from '../ui/Panel';
import ListRow from '../ui/ListRow';

// Keep the Live/Deck.gl graph out of public builds entirely when Live is disabled.
const LiveVehiclesLayer = import.meta.env.VITE_LIVE_ENABLED === 'true'
  ? React.lazy(() => import('./map/LiveVehiclesLayer'))
  : null;

function featureAreaName(feature: GeoJSON.Feature): string | undefined {
  return (feature.properties as { areaName?: string } | undefined)?.areaName;
}

/** MapLibre's evaluated colour ({ r, g, b, a } in 0–1) as a hex string. */
function paintColorToHex(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const { r, g, b, a } = value as { r?: number; g?: number; b?: number; a?: number };
  if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null;
  // MapLibre keeps colours premultiplied by alpha.
  const alpha = typeof a === 'number' && a > 0 ? a : 1;
  const channel = (n: number) => Math.round(Math.max(0, Math.min(1, n / alpha)) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const EXPORT_SELECTED_LAYERS = ['selected-route-layer', 'selected-local-route-layer'] as const;
const EXPORT_CASING_SUFFIX = '-export-casing';
const exportSavedWidths = new WeakMap<maplibregl.Map, Map<string, unknown>>();

/**
 * Draw the selected route bolder, over an outline in the basemap's background colour, for
 * the exported image only. Returns false when no route is selected in the view.
 */
function emphasizeSelectedRouteForExport(map: maplibregl.Map, lightMode: boolean): boolean {
  const layers = EXPORT_SELECTED_LAYERS.filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none'
    && map.queryRenderedFeatures(undefined, { layers: [id] }).length > 0);
  if (layers.length === 0) return false;
  restoreSelectedRouteAfterExport(map);
  const saved = new Map<string, unknown>();
  for (const id of layers) {
    const layer = map.getLayer(id)!;
    saved.set(id, map.getPaintProperty(id, 'line-width'));
    map.addLayer({
      id: `${id}${EXPORT_CASING_SUFFIX}`,
      type: 'line',
      source: layer.source,
      ...(layer.sourceLayer ? { 'source-layer': layer.sourceLayer } : {}),
      filter: map.getFilter(id) as any,
      paint: { 'line-color': lightMode ? '#ffffff' : '#0b0b0d', 'line-width': 10, 'line-opacity': 0.95 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    }, id);
    map.setPaintProperty(id, 'line-width', 6);
  }
  exportSavedWidths.set(map, saved);
  return true;
}

function restoreSelectedRouteAfterExport(map: maplibregl.Map) {
  const saved = exportSavedWidths.get(map);
  if (!saved) return;
  for (const [id, width] of saved) {
    if (map.getLayer(`${id}${EXPORT_CASING_SUFFIX}`)) map.removeLayer(`${id}${EXPORT_CASING_SUFFIX}`);
    if (map.getLayer(id)) map.setPaintProperty(id, 'line-width', width as any);
  }
  exportSavedWidths.delete(map);
}

function MapNoticePill({ children, className = '', raised = false }: { children: React.ReactNode; className?: string; raised?: boolean }) {
  return (
    <div className={`absolute ${raised ? 'bottom-16' : 'bottom-6'} left-6 right-24 sm:right-56 flex justify-center ${Z_PANEL} pointer-events-none`}>
      <div className={`${MAP_BADGE} h-8 max-w-full ${className}`}>
        {children}
      </div>
    </div>
  );
}

interface MapCanvasProps {
  agencies: Agency[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
  /** Same as `layers` but pre-filtered by day/agency/mode/hideSpan/live-polling (useIntervalStats'
   *  passesRouteFilter, with skipFrequency) -- used for the #317 qualifying-segment overlay so it
   *  never draws service from a day-type or agency that's currently filtered off the map.
   *  Deliberately NOT frequency-filtered: computeFrequencySegmentOverlay needs partial-match
   *  routes the frequency check would otherwise exclude, and does its own per-stop-range check. */
  filteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  /** Fully filtered route layers for the tile-failure fallback, including frequency. */
  mapFilteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  maxHeadway: number;
  period: TimePeriod;
  q: string;
  selectedRoute: string | null;
  /** Debug-only: draw these routes on the map in distinct colors, independent of selectedRoute.
   * Not exposed in any UI -- set via ?highlight=agency::routeId,agency::routeId2 in Interval.tsx. */
  highlightRoutes?: string[];
  /** Route key hovered in search results — highlighted on the map, others faded. */
  hoveredSearchRoute?: string | null;
  hoveredBranch?: HoveredBranch | null;
  setSelectedRoute: React.Dispatch<React.SetStateAction<string | null>>;
  selectedStop: string | null;
  setSelectedStop: React.Dispatch<React.SetStateAction<string | null>>;
  setDisambiguationRoutes: (routes: string[] | null) => void;
  lightMode: boolean;
  matchesQuery: (p: ShapeProperties) => boolean;
  onBoundsChange: (b: ViewportBounds, zoom?: number) => void;
  resetViewKey?: number;
  onLocate?: (lat: number, lon: number) => void;
  showMapContext?: boolean;
  mapContextOpen?: boolean;
  mapContextView?: 'agencies' | 'routes';
  onMapContextOpenChange?: (open: boolean) => void;
  onMapContextAgencyCountChange?: (count: number) => void;
  onMapContextRouteCountChange?: (count: number) => void;
  /** Route keys drawn in view, counted the same way as the route-count badge (compare mode labels). */
  onRenderedRouteKeysChange?: (keys: Set<string>) => void;
  day?: DayType;
  routesForStop?: {
    slug: string;
    routeIds: Set<string>;
    stopName?: string | null;
    siblingIdsByAgency?: Record<string, Set<string>>;
  } | null;
  showRouteLayers?: boolean;
  liveRoutesOnly?: boolean;
  hideSpan?: boolean;
  filterToAgencies?: boolean;
  agencyFilterSlugs?: string[] | null;
  onHistoryRouteClick?: (slug: string, routeShortName: string) => void;
  tileFilter?: any;
  selectedAgencySlug?: string | null;
  setSelectedAgencySlug?: (slug: string | null) => void;
  onOnDemandStopClick?: (slug: string) => void;
  onOnDemandZoneClick?: (selection: { slug: string; zoneId: string }) => void;
  /** Selected on-demand service: its zone(s) and stops stay full strength, everything else fades. */
  selectedOnDemandSlug?: string | null;
  /** Selected zone within selectedOnDemandSlug; null focuses the whole service. */
  selectedOnDemandZoneId?: string | null;
  nightServiceView?: boolean;
  nightServiceFrequency?: NightServiceFrequency;
  frequentServiceView?: boolean;
  frequentServiceDays?: DayType[];
  frequentServiceFrequency?: FrequentServiceFrequency;
  frequentServiceWindow?: FrequentServiceWindow;
  selectedModes?: Set<number>;
  selectedAgencies?: Set<string>;
  initialMapCenter?: { lat: number; lon: number; zoom: number };
  /** [south, west, north, east] to fit on first load (`?area=`); an explicit initialMapCenter wins. */
  initialMapBounds?: [number, number, number, number] | null;
  /** A metro area chosen in search; the map fits to its bounds (as ?area=<slug> does on load). */
  areaFocus?: { bbox: [number, number, number, number]; nonce: number } | null;
  /**
   * Second map in compare mode: follows the first map's camera, so it never writes the URL or
   * saved view, has no map controls or context menu, and does not expose itself for debugging.
   */
  secondary?: boolean;
  /**
   * Zoom, locate and export buttons. Defaults to on for the main map and off for the second map.
   * In compare mode the second (right / bottom) map shows them instead, so they sit at the
   * bottom right of the whole view; the cameras are synced, so one set drives both maps.
   */
  showMapControls?: boolean;
  /** Receives the MapLibre map once it has loaded (and null when it is removed), for camera sync. */
  onMapReady?: (map: maplibregl.Map | null) => void;
  /** On-demand agency named in the opening URL (`?ondemand=`); frames its zones when the URL has no lat/lon. */
  initialOnDemandSlug?: string | null;
  onTileLoadingChange?: (loading: boolean) => void;
  onBasemapLoadingChange?: (loading: boolean) => void;
  setQuery?: (q: string) => void;
  onClearSelection?: () => void;
  sidebarLeft?: number;
  searchBarWidth?: number;
  exportEnabled?: boolean;
  exportTitle?: string;
  /** True while agency route data for the current view is still downloading. */
  agencyDataLoading?: boolean;
  /** Number of agencies whose route data failed to load. */
  agencyDataFailedCount?: number;
}

const MapCanvasInner: React.FC<MapCanvasProps> = ({
  agencies,
  layers,
  filteredLayers,
  mapFilteredLayers,
  maxHeadway,
  period,
  q,
  selectedRoute,
  highlightRoutes = [],
  hoveredSearchRoute = null,
  hoveredBranch = null,
  setSelectedRoute,
  selectedStop,
  setSelectedStop,
  lightMode,
  setDisambiguationRoutes,
  onBoundsChange,
  resetViewKey,
  setQuery,
  onLocate,
  showMapContext = false,
  mapContextOpen = false,
  mapContextView = 'routes',
  onMapContextOpenChange,
  onMapContextAgencyCountChange,
  onMapContextRouteCountChange,
  onRenderedRouteKeysChange,
  day = 'Weekday',
  routesForStop,
  showRouteLayers = true,
  liveRoutesOnly = false,
  hideSpan = false,
  filterToAgencies = false,
  agencyFilterSlugs = null,
  onHistoryRouteClick,
  tileFilter,
  selectedAgencySlug,
  setSelectedAgencySlug,
  onOnDemandStopClick,
  onOnDemandZoneClick,
  selectedOnDemandSlug = null,
  selectedOnDemandZoneId = null,
  nightServiceView = false,
  nightServiceFrequency = 60,
  frequentServiceView = false,
  frequentServiceDays = ['Weekday'],
  frequentServiceFrequency = 15,
  frequentServiceWindow = 'daytime',
  selectedModes = new Set(),
  selectedAgencies,
  initialMapCenter,
  initialMapBounds,
  areaFocus,
  secondary = false,
  showMapControls = !secondary,
  onMapReady,
  initialOnDemandSlug = null,
  onTileLoadingChange,
  onBasemapLoadingChange,
  onClearSelection,
  sidebarLeft,
  searchBarWidth,
  exportEnabled = false,
  exportTitle = 'Transit map',
  agencyDataLoading = false,
  agencyDataFailedCount = 0,
}) => {
  const { colorVisionFriendly } = useColorVision();
  const colorMode: ColorVisionMode = colorVisionFriendly ? 'friendly' : 'default';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [pmtilesRoutesAvailable, setPmtilesRoutesAvailable] = useState<boolean | null>(null);
  const [pmtilesRouteAgencies, setPmtilesRouteAgencies] = useState<Set<string> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(11);
  // Stop visibility only changes at zoom 12/14/17, so the style/filter effect depends on this tier
  // rather than raw zoom and doesn't rebuild on every zoom tick (CIV-104).
  const stopZoomTier = zoom >= 17 ? 3 : zoom >= 14 ? 2 : zoom >= 12 ? 1 : 0;
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const agencyDataLoadingRef = useRef(agencyDataLoading);
  agencyDataLoadingRef.current = agencyDataLoading;
  const agencyDataFailedCountRef = useRef(agencyDataFailedCount);
  agencyDataFailedCountRef.current = agencyDataFailedCount;
  const prepareExportSource = useCallback(async () => {
    const map = mapRef.current;
    const routeLayers = ['overview-routes-layer', 'routes-layer', 'local-routes-layer', 'night-service-routes-layer', 'frequent-service-routes-layer'];
    await waitForMapExportReady({
      map: map ?? {
        // No map yet: report "not loaded" until the timeout gives a plain message.
        loaded: () => false,
        areTilesLoaded: () => false,
        isMoving: () => false,
        triggerRepaint: () => undefined,
        once: () => undefined,
        off: () => undefined,
      },
      isDataLoading: () => agencyDataLoadingRef.current,
      hasFailedData: () => agencyDataFailedCountRef.current > 0,
      hasRenderedRoutes: () => {
        if (!map) return false;
        const layers = routeLayers.filter(layer => map.getLayer(layer) && map.getLayoutProperty(layer, 'visibility') !== 'none');
        return layers.length > 0 && map.queryRenderedFeatures(undefined, { layers }).length > 0;
      },
    });
    // In the image, the selected route gets a bolder line with an outline in the map's
    // background colour, so it stands out without changing any tier colour.
    if (map && emphasizeSelectedRouteForExport(map, exportStateRef.current.lightMode)) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 3000);
        map.once('idle', () => {
          clearTimeout(timer);
          resolve();
        });
        map.triggerRepaint();
      });
    }
    return map!.getCanvas();
  }, []);
  const releaseExportSource = useCallback(() => {
    if (mapRef.current) restoreSelectedRouteAfterExport(mapRef.current);
  }, []);

  // Read at export time (not captured by the callback) so the image always describes the
  // filters that are on screen right now.
  const exportStateRef = useRef({
    agencies, maxHeadway, period, day, q, selectedRoute, selectedModes, colorMode, exportTitle,
    nightServiceView, nightServiceFrequency, frequentServiceView, frequentServiceDays,
    frequentServiceFrequency, frequentServiceWindow, liveRoutesOnly, lightMode,
  });
  exportStateRef.current = {
    agencies, maxHeadway, period, day, q, selectedRoute, selectedModes, colorMode, exportTitle,
    nightServiceView, nightServiceFrequency, frequentServiceView, frequentServiceDays,
    frequentServiceFrequency, frequentServiceWindow, liveRoutesOnly, lightMode,
  };
  const describeExport = useCallback((box?: MapExportBox): MapExportDetails => {
    const map = mapRef.current;
    const state = exportStateRef.current;
    const view: MapExportView = state.nightServiceView ? 'night'
      : state.frequentServiceView ? 'frequent-service'
      : state.liveRoutesOnly || state.exportTitle !== 'Transit Frequency' ? 'other'
      : 'frequency';

    // Only routes actually drawn: hidden-by-zoom routes stay in the query results with zero
    // opacity, so read each feature's evaluated paint and skip the invisible ones.
    const samples: RenderedRouteSample[] = [];
    let routeLabel: string | null = null;
    let routeShortName: string | null = null;
    let routeColor: string | null = null;
    if (map) {
      const drawnLayers = ['overview-routes-layer', 'routes-layer', 'local-routes-layer', 'route-segments-layer', 'selected-route-layer', 'selected-local-route-layer', 'selected-route-segments-layer', 'night-service-routes-layer', 'frequent-service-routes-layer', 'frequency-qualifying-segments-layer']
        .filter(layer => map.getLayer(layer) && map.getLayoutProperty(layer, 'visibility') !== 'none');
      // Only the part of the map that ends up in the image (exports crop to their own shape).
      const features = drawnLayers.length > 0 ? map.queryRenderedFeatures(box, { layers: drawnLayers }) : [];
      for (const feature of features) {
        const paint = (feature.layer as { paint?: Record<string, unknown> }).paint ?? {};
        const opacity = typeof paint['line-opacity'] === 'number' ? paint['line-opacity'] : 1;
        if (opacity < 0.05) continue;
        const props = feature.properties as Record<string, unknown>;
        const agencySlug = typeof props.agencySlug === 'string' ? props.agencySlug : null;
        samples.push({
          agencySlug,
          routeKey: `${agencySlug}::${props.routeId ?? ''}::${props.routeBranch ?? ''}`,
          color: paintColorToHex(paint['line-color']),
        });
        if (!routeLabel && state.selectedRoute && feature.layer.id.startsWith('selected-')) {
          const agencyName = state.agencies.find(agency => agency.slug === agencySlug)?.name ?? null;
          const shortName = typeof props.routeShortName === 'string' ? props.routeShortName : null;
          const longName = typeof props.routeLongName === 'string' ? props.routeLongName : null;
          const label = titleCase(getRouteLabel(shortName, longName, agencyName));
          if (label) {
            routeLabel = label;
            routeShortName = shortName ?? longName;
            routeColor = paintColorToHex(paint['line-color']);
          }
        }
      }
    }

    return describeMapExport({
      view,
      viewTitle: state.exportTitle,
      colorMode: state.colorMode,
      maxHeadway: state.maxHeadway,
      day: state.day,
      period: state.period,
      zoom: map?.getZoom() ?? 11,
      selectedModes: state.selectedModes,
      query: state.q,
      routeLabel,
      routeShortName,
      routeColor,
      nightServiceFrequency: state.nightServiceFrequency,
      frequentServiceDays: state.frequentServiceDays,
      frequentServiceFrequency: state.frequentServiceFrequency,
      frequentServiceWindow: state.frequentServiceWindow,
      releaseGeneratedAt: getActiveDataRelease()?.generatedAt ?? null,
    }, samples, state.agencies);
  }, []);
  const [mapContextMenu, setMapContextMenu] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const mapContextPanelRef = useRef<HTMLDivElement>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showMapHint = (msg: string) => {
    setMapHint(msg);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setMapHint(null), 2500);
  };

  const { setBoundsAndZoom } = useViewport();
  const onDemandStatus = useOnDemandStatus();
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();
  const [liveLayerRequested, setLiveLayerRequested] = useState(false);

  useEffect(() => {
    if (liveOverlay) setLiveLayerRequested(true);
  }, [liveOverlay]);

  const [mapContextAgencies, setMapContextAgencies] = useState<MapContextAgency[]>([]);
  const mapContextRegionBySlug = useMemo(
    () => new Map(agencies.map(agency => [agency.slug, agency.region ?? 'Other'])),
    [agencies],
  );

  // Each zone and stop is filtered on its own hours (zones/stops that aren't
  // running are hidden, like fixed routes); ones with no hours on file stay
  // visible but are drawn muted so they never read as confirmed service.
  const onDemandShown = FEATURES.onDemand && (selectedModes.size === 0 || selectedModes.has(ON_DEMAND_MODE));
  useReportOnDemandVisible(onDemandShown);
  const onDemandAgencies = useMemo(() => (
    onDemandShown
      ? agencies.filter(agency => agency.onDemandServiceArea && (selectedAgencies?.has(agency.slug) ?? true))
      : []
  ), [agencies, selectedAgencies, onDemandShown]);
  const onDemandFocus = useMemo<OnDemandFocusTarget | null>(() => (
    selectedOnDemandSlug ? { slug: selectedOnDemandSlug, zoneId: selectedOnDemandZoneId ?? null } : null
  ), [selectedOnDemandSlug, selectedOnDemandZoneId]);
  const onDemandServiceAreaData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>>(() => ({
    type: 'FeatureCollection',
    features: onDemandAgencies.flatMap(agency => {
      const service = agency.onDemandServiceArea!;
      const today = localDateIn(agency.timezone);
      return service.features
        .filter(feature => isOnDemandZoneShown(service, featureAreaName(feature), day, period, today))
        .map(feature => {
          const areaName = featureAreaName(feature);
          return {
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              agencySlug: agency.slug,
              agencyName: agency.name,
              onDemandZoneId: areaName ?? feature.id,
              hoursConfirmed: onDemandHoursConfirmed(service, areaName ? [areaName] : [], day),
              ...(onDemandFocus ? { [ON_DEMAND_FOCUSED_PROP]: isOnDemandZoneFocused(onDemandFocus, agency.slug, areaName ?? feature.id) } : {}),
            },
          };
        });
    }),
  }), [day, onDemandAgencies, onDemandFocus, period]);
  const onDemandStopData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: onDemandAgencies.flatMap(agency => {
      const service = agency.onDemandServiceArea!;
      const today = localDateIn(agency.timezone);
      return (service.stopFeatures ?? [])
        .filter(feature => isOnDemandStopShown(service, feature.properties, day, period, today))
        .map(feature => {
          const zones = onDemandStopZoneNames(service, feature.properties);
          return {
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              agencySlug: agency.slug,
              agencyName: agency.name,
              // A stop inside exactly one zone opens that zone's card when clicked.
              ...(zones.length === 1 ? { onDemandZoneId: zones[0] } : {}),
              hoursConfirmed: onDemandHoursConfirmed(service, zones, day),
              ...(onDemandFocus ? { [ON_DEMAND_FOCUSED_PROP]: isOnDemandStopFocused(onDemandFocus, agency.slug, zones) } : {}),
            },
          };
        });
    }),
  }), [day, onDemandAgencies, onDemandFocus, period]);

  const renderedRouteKeysRef = useRef(onRenderedRouteKeysChange);
  renderedRouteKeysRef.current = onRenderedRouteKeysChange;
  const reportsRenderedRoutes = !!onRenderedRouteKeysChange;
  const updateMapContext = useCallback(() => {
    const map = mapRef.current;
    if ((!showMapContext && !reportsRenderedRoutes) || !map || !mapLoaded) {
      setMapContextAgencies([]);
      return;
    }
    const layers = ['overview-routes-layer', 'routes-layer', 'local-routes-layer'].filter(layer => map.getLayer(layer));
    const features = layers.length > 0 ? map.queryRenderedFeatures(undefined, { layers }) : [];
    const contextAgencies = getMapContextAgenciesFromFeatures(agencies, features);
    // The panel and its counts show distinct rider-visible lines; compare mode below keeps raw keys.
    if (showMapContext) setMapContextAgencies(dedupeMapContextByDisplay(contextAgencies));
    renderedRouteKeysRef.current?.(new Set(contextAgencies.flatMap(agency => agency.routes.map(route => route.key))));
  }, [agencies, mapLoaded, showMapContext, reportsRenderedRoutes]);

  useEffect(() => {
    if (!mapLoaded || (!showMapContext && !reportsRenderedRoutes)) return;
    const map = mapRef.current;
    if (!map) return;
    updateMapContext();
    map.on('idle', updateMapContext);
    map.on('moveend', updateMapContext);
    return () => {
      map.off('idle', updateMapContext);
      map.off('moveend', updateMapContext);
    };
  }, [mapLoaded, showMapContext, updateMapContext]);

  // A deployed PMTiles source can finish loading its metadata while its route tiles
  // remain unavailable. If that happens, use the already-loaded GeoJSON for the current
  // viewport instead of leaving the map blank. Healthy PMTiles rendering is unchanged.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const sourceId = lightMode ? 'cartodb-light' : 'cartodb-dark';
    let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
    const clearLoadingTimeout = () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = undefined;
      }
    };
    const onTileStart = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== sourceId) return;
      onBasemapLoadingChangeRef.current?.(true);
      clearLoadingTimeout();
      loadingTimeout = setTimeout(() => {
        loadingTimeout = undefined;
        onBasemapLoadingChangeRef.current?.(false);
      }, 15000);
    };
    const onSourceData = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== sourceId || !event.isSourceLoaded) return;
      clearLoadingTimeout();
      onBasemapLoadingChangeRef.current?.(false);
    };
    const onIdle = () => {
      clearLoadingTimeout();
      onBasemapLoadingChangeRef.current?.(false);
    };
    onBasemapLoadingChangeRef.current?.(!map.isSourceLoaded(sourceId));
    map.on('sourcedataloading', onTileStart);
    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
    return () => {
      clearLoadingTimeout();
      map.off('sourcedataloading', onTileStart);
      map.off('sourcedata', onSourceData);
      map.off('idle', onIdle);
      onBasemapLoadingChangeRef.current?.(false);
    };
  }, [lightMode, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const checkRouteTiles = () => {
      const detailedSourceFeatures = map.querySourceFeatures('atlas-pmtiles', { sourceLayer: 'routes' });
      const overviewSourceFeatures = map.querySourceFeatures('atlas-overview-pmtiles', { sourceLayer: 'routes' });
      const sourceFeatures = [...overviewSourceFeatures, ...detailedSourceFeatures];
      const renderedLayers = ['overview-routes-layer', 'routes-layer'].filter(layer => map.getLayer(layer));
      const renderedFeatures = renderedLayers.length > 0
        ? map.queryRenderedFeatures(undefined, { layers: renderedLayers })
        : [];
      const agencySlugs = new Set(
        renderedFeatures
          .map(feature => String(feature.properties?.agencySlug ?? ''))
          .filter(Boolean),
      );
      if (sourceFeatures.length > 0 && (map.isSourceLoaded('atlas-pmtiles') || map.isSourceLoaded('atlas-overview-pmtiles') || renderedFeatures.length > 0)) {
        markAtlasLatest('network-data-ready', {
          source: 'pmtiles',
          sourceFeatureCount: sourceFeatures.length,
          renderedFeatureCount: renderedFeatures.length,
          zoom: map.getZoom(),
        });
      }
      setPmtilesRoutesAvailable(sourceFeatures.length > 0);
      setPmtilesRouteAgencies(previous => {
        const previousKey = previous ? [...previous].sort().join('|') : '';
        const nextKey = [...agencySlugs].sort().join('|');
        return previousKey === nextKey ? previous : agencySlugs;
      });
    };

    map.on('sourcedata', checkRouteTiles);
    map.on('idle', checkRouteTiles);
    map.on('moveend', checkRouteTiles);
    const fallbackTimer = window.setTimeout(() => {
      const sourceFeatures = [
        ...map.querySourceFeatures('atlas-overview-pmtiles', { sourceLayer: 'routes' }),
        ...map.querySourceFeatures('atlas-pmtiles', { sourceLayer: 'routes' }),
      ];
      if (sourceFeatures.length === 0) {
        setPmtilesRoutesAvailable(false);
        setPmtilesRouteAgencies(new Set());
        onTileLoadingChangeRef.current?.(false);
      } else {
        checkRouteTiles();
      }
    }, 5000);

    return () => {
      window.clearTimeout(fallbackTimer);
      map.off('sourcedata', checkRouteTiles);
      map.off('idle', checkRouteTiles);
      map.off('moveend', checkRouteTiles);
    };
  }, [mapLoaded]);

  // Keep processed local GeoJSON visible while PMTiles is still being checked.
  // This avoids a blank map during a stalled tile request; healthy PMTiles takes
  // over once it reports route features.
  const localRouteData = useMemo<GeoJSON.FeatureCollection>(() => {
    const localSlugs = new Set(agencies
      .filter(a => pmtilesRouteAgencies === null
        || !pmtilesRouteAgencies.has(a.slug)
        || (a.betaOnly && a.pmtilesPending))
      .map(a => a.slug));
    const sourceLayers = mapFilteredLayers ?? filteredLayers ?? layers ?? {};
    const features = Object.entries(sourceLayers).flatMap(([slug, collection]) => {
      if (!localSlugs.has(slug)) return [];
      return collection.features.flatMap(feature => {
        const properties = feature.properties as Record<string, any> | null;
        if (!properties?.routeId || !properties.routeShortName) return [];
        if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') return [];
        const periodHeadway = routeFilterHeadway(properties, period);
        return [{
          ...feature,
          properties: {
            ...properties,
            agencySlug: properties.agencySlug ?? slug,
            localHeadwayColor: localRouteHeadwayColor(periodHeadway, colorMode),
          },
        }];
      });
    });
    return { type: 'FeatureCollection', features };
  }, [agencies, filteredLayers, layers, mapFilteredLayers, period, pmtilesRouteAgencies, colorMode]);

  useEffect(() => {
    onMapContextAgencyCountChange?.(mapContextAgencies.length);
    onMapContextRouteCountChange?.(mapContextAgencies.reduce((total, agency) => total + agency.routeCount, 0));
  }, [mapContextAgencies, onMapContextAgencyCountChange, onMapContextRouteCountChange]);

  useEffect(() => {
    if (!showMapContext || !mapContextOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!isMapContextOutsideClick(mapContextPanelRef.current, event.target)) return;
      onMapContextOpenChange?.(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mapContextOpen, onMapContextOpenChange, showMapContext]);

  // Deck.gl overlay for GPU-rendered vehicle markers
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);

  // Refs keep event-handler closures (registered once on map load) from going stale.
  const setSelectedRouteRef = useRef(setSelectedRoute);
  const setSelectedStopRef = useRef(setSelectedStop);
  const setDisambiguationRoutesRef = useRef(setDisambiguationRoutes);
  const setQueryRef = useRef(setQuery);
  const onHistoryRouteClickRef = useRef(onHistoryRouteClick);
  const setSelectedAgencySlugRef = useRef(setSelectedAgencySlug);
  const selectedAgencySlugRef = useRef(selectedAgencySlug);
  const onOnDemandStopClickRef = useRef(onOnDemandStopClick);
  const onOnDemandZoneClickRef = useRef(onOnDemandZoneClick);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const secondaryRef = useRef(secondary);
  secondaryRef.current = secondary;
  const onTileLoadingChangeRef = useRef(onTileLoadingChange);
  const onBasemapLoadingChangeRef = useRef(onBasemapLoadingChange);
  const onClearSelectionRef = useRef(onClearSelection);
  const selectedRouteRef = useRef(selectedRoute);
  const highlightRoutesRef = useRef(highlightRoutes);
  const handleMapClickRef = useRef<(e: maplibregl.MapMouseEvent) => void>(() => {});
  // Read by resetRoutesLayerDefaultPaint (called from several places, not just the main filter
  // effect) so the #317 partial-match dim survives a paint reset instead of being wiped back to
  // an undimmed default -- see the frequencySegmentOverlay useMemo + its sync effect below.
  const frequencySegmentOverlayRef = useRef<{ partialMatches: ReturnType<typeof computeFrequencySegmentOverlay>['partialMatches'] }>({ partialMatches: [] });

  const resetRoutesLayerDefaultPaint = (map: maplibregl.Map) => resetRouteLayersPaint(map, period, frequencySegmentOverlayRef.current.partialMatches);

  const clearMapSelection = () => {
    const map = mapRef.current;
    if (map) resetRoutesLayerDefaultPaint(map);
    if (onClearSelectionRef.current) {
      onClearSelectionRef.current();
      return;
    }
    setSelectedRouteRef.current(null);
    setSelectedStopRef.current(null);
    setDisambiguationRoutesRef.current(null);
  };

  useLayoutEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useLayoutEffect(() => {
    highlightRoutesRef.current = highlightRoutes;
  }, [highlightRoutes]);

  useLayoutEffect(() => {
    handleMapClickRef.current = (e: maplibregl.MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      if (selectedAgencySlugRef.current) {
        setSelectedAgencySlugRef.current?.(null);
      }

      const stopHits = map.queryRenderedFeatures(e.point, { layers: ['stops-layer'] });
      if (stopHits.length > 0) {
        const props = stopHits[0].properties;
        const compositeId = `${props.agencySlug}::${props.stopId}`;
        setSelectedRouteRef.current(null);
        setDisambiguationRoutesRef.current(null);
        if (map.getZoom() < 13) {
          map.flyTo({ center: e.lngLat, zoom: 13, duration: 800 });
          return;
        }
        setSelectedStopRef.current(prev => prev === compositeId ? null : compositeId);
        return;
      }

      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 12, e.point.y - 12],
        [e.point.x + 12, e.point.y + 12],
      ];

      // Service-area clicks take priority over route hitboxes. A route can cross a
      // zone, but clicking inside the visible zone should open the on-demand agency
      // rather than whichever route happens to be nearby.
      const serviceAreaHitLayers = ['on-demand-service-area-fill', 'on-demand-service-area-line', 'on-demand-stop-points']
        .filter(layerId => map.getLayer(layerId));
      const serviceAreaHits = serviceAreaHitLayers.length > 0
        ? map.queryRenderedFeatures(e.point, { layers: serviceAreaHitLayers })
        : [];
      const serviceAreaSlug = serviceAreaHits[0]?.properties?.agencySlug as string | undefined;
      if (serviceAreaSlug) {
        setSelectedRouteRef.current(null);
        setSelectedStopRef.current(null);
        setDisambiguationRoutesRef.current(null);
        setQueryRef.current?.('');
        if (serviceAreaHits[0]?.layer?.id === 'on-demand-stop-points') {
          const stopZoneId = serviceAreaHits[0]?.properties?.onDemandZoneId as string | undefined;
          if (stopZoneId) onOnDemandZoneClickRef.current?.({ slug: serviceAreaSlug, zoneId: stopZoneId });
          else onOnDemandStopClickRef.current?.(serviceAreaSlug);
        } else {
          const zoneId = serviceAreaHits[0]?.properties?.onDemandZoneId as string | undefined;
          if (zoneId) onOnDemandZoneClickRef.current?.({ slug: serviceAreaSlug, zoneId });
          else setSelectedAgencySlugRef.current?.(serviceAreaSlug);
        }
        return;
      }

      const routeHitLayers = ['overview-routes-hit-layer', 'routes-hit-layer'];
      if (map.getLayer('local-routes-hit-layer')) {
        routeHitLayers.push('local-routes-hit-layer');
      }
      if (map.getLayer('night-service-routes-hit-layer')) {
        routeHitLayers.push('night-service-routes-hit-layer');
      }
      if (map.getLayer('frequent-service-routes-hit-layer')) {
        routeHitLayers.push('frequent-service-routes-hit-layer');
      }
      if (map.getLayer('frequency-qualifying-segments-hit-layer')) {
        routeHitLayers.push('frequency-qualifying-segments-hit-layer');
      }
      const routeHits = map.queryRenderedFeatures(bbox, { layers: routeHitLayers });
      if (routeHits.length > 0) {
        const props = routeHits[0].properties;
        const uniqueRouteKeys = dedupeRouteKeysByDisplay(routeHits.map((f: maplibregl.MapGeoJSONFeature) => {
          const p = f.properties;
          return {
            key: routeKey({ ...p, agencySlug: p.agencySlug } as any),
            agencySlug: String(p.agencySlug ?? ''),
            shortName: String(p.routeShortName ?? p.routeId ?? ''),
            longName: p.routeLongName as string | null | undefined,
          };
        }));

        setSelectedStopRef.current(null);
        if (onHistoryRouteClickRef.current) {
          const slug = props.agencySlug as string;
          const rsn = props.routeShortName as string;
          if (slug && rsn) onHistoryRouteClickRef.current(slug, rsn);
        } else if (uniqueRouteKeys.length > 1) {
          if (map.getZoom() < 11) {
            setDisambiguationRoutesRef.current(null);
            map.flyTo({ center: e.lngLat, zoom: 11, duration: 800 });
            return;
          }
          setDisambiguationRoutesRef.current(uniqueRouteKeys);
        } else {
          const key = routeKey({ ...props, agencySlug: props.agencySlug } as any);
          const wasSelected = selectedRouteRef.current === key;
          setSelectedRouteRef.current(prev => prev === key ? null : key);
          setQueryRef.current?.('');
          if (wasSelected) resetRoutesLayerDefaultPaint(map);
        }
        return;
      }

      clearMapSelection();
    };
  });

  useLayoutEffect(() => {
    setSelectedRouteRef.current = setSelectedRoute;
    setSelectedStopRef.current = setSelectedStop;
    setDisambiguationRoutesRef.current = setDisambiguationRoutes;
    setQueryRef.current = setQuery;
    onHistoryRouteClickRef.current = onHistoryRouteClick;
    setSelectedAgencySlugRef.current = setSelectedAgencySlug;
    onOnDemandStopClickRef.current = onOnDemandStopClick;
    onOnDemandZoneClickRef.current = onOnDemandZoneClick;
    selectedAgencySlugRef.current = selectedAgencySlug;
    onBoundsChangeRef.current = onBoundsChange;
    onTileLoadingChangeRef.current = onTileLoadingChange;
    onBasemapLoadingChangeRef.current = onBasemapLoadingChange;
    onClearSelectionRef.current = onClearSelection;
  });

  const regionalView = useMemo(() => getRegionalView(agencies), [agencies]);
  const hasSavedView = useMemo(() => getSavedView() !== null, []);

  // Frequency filter partial-match segments (#317): when a route only qualifies for the active
  // frequency filter because part of its stops meet the threshold (not the whole shape), computed
  // from the real per-agency GeoJSON -- see frequencySegments.ts for why this can't be done with
  // PMTiles filter/paint expressions. Uses `filteredLayers` (already day/agency/mode/hideSpan/
  // live-polling-filtered via passesRouteFilter), not raw `layers` -- otherwise this would draw a
  // qualifying-segment overlay for a day type or agency the user has filtered off the map entirely.
  // Only relevant to the plain Frequency Map view.
  const frequencySegmentOverlay = useMemo(() => {
    // nightServiceView colors routes by a boolean nightService flag, not by headway tier --
    // the #317 overlay is a frequency-filter concept and doesn't apply there.
    if (!showRouteLayers || nightServiceView || frequentServiceView || !filteredLayers) {
      return { segments: [], partialMatches: [], sharedStretchRoutes: [] };
    }
    return computeFrequencySegmentOverlay(filteredLayers, period, maxHeadway, colorMode, layers ?? filteredLayers);
  }, [filteredLayers, layers, period, maxHeadway, showRouteLayers, nightServiceView, frequentServiceView, colorMode]);


  const routeSegmentFeatures = useSectionColourFeatures({
    layers, filteredLayers, mapFilteredLayers, period, day, selectedRoute, colorMode, showRouteLayers,
    nightServiceView, frequentServiceView,
  });

  const sharedHoverSegments = useMemo(
    () => buildSharedHoverSegments(layers, selectedRoute, hoveredBranch, day, colorMode),
    [layers, selectedRoute, hoveredBranch, day, colorMode],
  );

  useLayoutEffect(() => {
    frequencySegmentOverlayRef.current = frequencySegmentOverlay;
  }, [frequencySegmentOverlay]);

  // Push the qualifying-segment overlay geometry to its GeoJSON source whenever it changes.
  useGeoJsonFeaturesSource(mapRef, mapLoaded, 'frequency-qualifying-segments', frequencySegmentOverlay.segments);
  useGeoJsonFeaturesSource(mapRef, mapLoaded, 'route-segments', routeSegmentFeatures);
  useOnDemandSources(mapRef, mapLoaded, { onDemandServiceAreaData, onDemandStopData, selectedAgencySlug });
  // A combined-row hover is a clipped local overlay, not a full-route branch match.
  useGeoJsonFeaturesSource(mapRef, mapLoaded, 'shared-hover-segments', sharedHoverSegments);
  useNightServiceLayer(mapRef, mapLoaded, { layers, nightServiceView, nightServiceFrequency });
  useFrequentServiceLayer(mapRef, mapLoaded, { layers, frequentServiceView, frequentServiceDays, frequentServiceFrequency, frequentServiceWindow, selectedModes });

  // Initialize MapLibre Map
  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer) return;
    let cancelled = false;
    let cleanupMap: maplibregl.Map | null = null;

    void (async () => {
      // Start resolving the PMTiles release in parallel with MapLibre startup.
      // The initial style only contains the raster basemap, so it can render
      // while the route archive metadata is still loading.
      const protocolReady = registerProtocol();

    const saved = getSavedView();
    const fitBounds = !initialMapCenter && initialMapBounds
      ? [[initialMapBounds[1], initialMapBounds[0]], [initialMapBounds[3], initialMapBounds[2]]] as [[number, number], [number, number]]
      : null;
    const initialCenter = initialMapCenter
      ?? (hasSavedView && saved ? { lat: saved.lat, lon: saved.lon, zoom: saved.zoom } : null)
      ?? { lat: regionalView.center[0], lon: regionalView.center[1], zoom: regionalView.zoom };

    const map = new maplibregl.Map({
      container: mapContainer,
      style: getMapStyle(lightMode),
      ...(fitBounds
        ? { bounds: fitBounds, fitBoundsOptions: { padding: 48, maxZoom: 12 } }
        : { center: [initialCenter.lon, initialCenter.lat] as [number, number], zoom: initialCenter.zoom }),
      attributionControl: false,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    });

    cleanupMap = map;
      mapRef.current = map;

      map.on('load', async () => {
        if (cancelled) return;
        setZoom(map.getZoom());

        await protocolReady;
        if (cancelled) return;

      addMapLayers(map, { lightMode, colorMode, highlightRoutes: highlightRoutesRef.current });

      // Deck.gl is attached lazily when Live Vehicles first needs markers
      // (see useLiveVehiclesLayer) so Frequency Map doesn't pay the deck bundle cost.
      if (import.meta.env.DEV) {
        (window as any)[secondary ? '__mapB' : '__map'] = map;
      }

      // Start loading nearby agency data as soon as the map is ready. Waiting for
      // `idle` can deadlock agency loading when a route-tile request is stalled.
      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChangeRef.current(bounds, map.getZoom());
      setBoundsAndZoom(bounds, map.getZoom());
      setMapLoaded(true);
      onMapReadyRef.current?.(map);
    });

    })();

    return () => {
      cancelled = true;
      onMapReadyRef.current?.(null);
      cleanupMap?.remove();
      if (mapRef.current === cleanupMap) mapRef.current = null;
    };
  }, []);

  // MapLibre measures the container only when it initializes. The app shell can
  // still be settling at that point, especially while the agency index loads.
  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container || !mapLoaded || typeof ResizeObserver === 'undefined') return;
    const resize = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) map.resize();
    };
    const observer = new ResizeObserver(() => requestAnimationFrame(resize));
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [mapLoaded]);

  useRouteLayerVisibility(mapRef, mapLoaded, { localRouteData, showRouteLayers, nightServiceView, frequentServiceView, pmtilesRoutesAvailable });

  // Single map click handler — avoids layer preventDefault blocking background deselect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onClick = (e: maplibregl.MapMouseEvent) => handleMapClickRef.current(e);
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [mapLoaded]);

  // Pointer cursor over clickable stops/routes — same hit layers the click handler queries.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const stopHits = map.getLayer('stops-layer')
        ? map.queryRenderedFeatures(e.point, { layers: ['stops-layer'] })
        : [];
      const routeHitLayers = ['overview-routes-hit-layer', 'routes-hit-layer'];
      if (map.getLayer('local-routes-hit-layer')) {
        routeHitLayers.push('local-routes-hit-layer');
      }
      if (map.getLayer('frequency-qualifying-segments-hit-layer')) {
        routeHitLayers.push('frequency-qualifying-segments-hit-layer');
      }
      const routeHits = stopHits.length === 0 && (map.getLayer('overview-routes-hit-layer') || map.getLayer('routes-hit-layer') || map.getLayer('local-routes-hit-layer'))
        ? map.queryRenderedFeatures(
            [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]],
            { layers: routeHitLayers },
          )
        : [];
      const serviceAreaHitLayers = ['on-demand-service-area-fill', 'on-demand-stop-clusters', 'on-demand-stop-points']
        .filter(layerId => Boolean(map.getLayer(layerId)));
      const serviceAreaHits = serviceAreaHitLayers.length > 0
        ? map.queryRenderedFeatures(e.point, { layers: serviceAreaHitLayers })
        : [];
      map.getCanvas().style.cursor = stopHits.length > 0 || routeHits.length > 0 || serviceAreaHits.length > 0 ? 'pointer' : '';
    };
    map.on('mousemove', onMouseMove);
    return () => {
      map.off('mousemove', onMouseMove);
      map.getCanvas().style.cursor = '';
    };
  }, [mapLoaded]);

  useViewSync(mapRef, mapLoaded, { setZoom, secondaryRef, onBoundsChangeRef, setBoundsAndZoom });

  // Right-click a spot to open a small menu: copy a URL pointing at that exact
  // location + current zoom (handy for a bug report or handing someone the
  // precise spot under the cursor), or jump straight to filing a GitHub issue
  // pre-filled with that URL.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (secondaryRef.current) return;
      setMapContextMenu({ x: e.point.x, y: e.point.y, lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    const closeMenu = () => setMapContextMenu(null);
    map.on('contextmenu', onContextMenu);
    map.on('click', closeMenu);
    map.on('movestart', closeMenu);
    return () => {
      map.off('contextmenu', onContextMenu);
      map.off('click', closeMenu);
      map.off('movestart', closeMenu);
    };
  }, [mapLoaded]);

  const buildLocationUrl = (lat: number, lon: number, medium?: ShareMedium): string => {
    const map = mapRef.current;
    const sp = new URLSearchParams(window.location.search);
    sp.set('lat', lat.toFixed(5));
    sp.set('lon', lon.toFixed(5));
    sp.set('z', (map?.getZoom() ?? zoom).toFixed(2));
    const url = `${window.location.origin}${window.location.pathname}?${sp.toString()}`;
    return withShareTags(url, medium);
  };

  const handleCopyLocationUrl = () => {
    if (!mapContextMenu) return;
    const url = buildLocationUrl(mapContextMenu.lat, mapContextMenu.lon, SHARE_UTM_MEDIUM_LINK);
    navigator.clipboard.writeText(url).then(
      () => showMapHint('Location URL copied'),
      () => showMapHint('Could not copy — clipboard access denied'),
    );
    setMapContextMenu(null);
  };

  const handleReportIssue = () => {
    if (!mapContextMenu) return;
    const url = buildLocationUrl(mapContextMenu.lat, mapContextMenu.lon);
    trackEvent('report_issue_opened', { source: 'map_context_menu' });
    const title = `Map issue near ${mapContextMenu.lat.toFixed(5)}, ${mapContextMenu.lon.toFixed(5)}`;
    const body = `**Location:** ${url}\n\n**What's wrong:**\n\n`;
    const issueUrl = `https://github.com/Civic-Minds/Atlas/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent('user-reported')}`;
    window.open(issueUrl, '_blank', 'noopener,noreferrer');
    setMapContextMenu(null);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
    const clearLoadingTimeout = () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = undefined;
      }
    };
    const onTileStart = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== 'atlas-pmtiles' && event.sourceId !== 'atlas-overview-pmtiles') return;
      onTileLoadingChangeRef.current?.(true);
      clearLoadingTimeout();
      // A failed or rate-limited tile must not leave the HUD spinning forever.
      loadingTimeout = setTimeout(() => {
        loadingTimeout = undefined;
        onTileLoadingChangeRef.current?.(false);
      }, 15000);
    };
    const onSourceData = (event: maplibregl.MapSourceDataEvent) => {
      if ((event.sourceId !== 'atlas-pmtiles' && event.sourceId !== 'atlas-overview-pmtiles') || !event.isSourceLoaded) return;
      clearLoadingTimeout();
      onTileLoadingChangeRef.current?.(false);
    };
    const onIdle = () => {
      clearLoadingTimeout();
      onTileLoadingChangeRef.current?.(false);
    };
    map.on('sourcedataloading', onTileStart);
    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
    return () => {
      clearLoadingTimeout();
      map.off('sourcedataloading', onTileStart);
      map.off('sourcedata', onSourceData);
      map.off('idle', onIdle);
    };
  }, [mapLoaded]);

  // Toggle light/dark basemap without setStyle (setStyle would drop all the
  // programmatically added vector layers like routes-layer, stops-layer, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const lightVis = lightMode ? 'visible' : 'none';
    const darkVis = lightMode ? 'none' : 'visible';
    // Guard: layers may not exist in some edge cases (initial load, StrictMode)
    if (map.getLayer('basemap-light')) {
      map.setLayoutProperty('basemap-light', 'visibility', lightVis);
    }
    if (map.getLayer('basemap-dark')) {
      map.setLayoutProperty('basemap-dark', 'visibility', darkVis);
    }
  }, [lightMode, mapLoaded]);

  // Handle locating the user
  const locateUser = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14, duration: 1200 });
        onLocate?.(coords.latitude, coords.longitude);
      },
      error => {
        // error.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        // POSITION_UNAVAILABLE/TIMEOUT are usually Wi-Fi-based positioning failing to
        // triangulate anything (Ethernet-only, Wi-Fi off) -- that fails identically for every
        // site on the machine, not just this one, so fall back to an approximate (city-level)
        // fix from Vercel's edge IP-geolocation headers rather than just erroring out. Skip the
        // fallback for PERMISSION_DENIED -- the user explicitly said no, respect that.
        if (error.code === error.PERMISSION_DENIED) {
          showMapHint('Location access denied — check your browser\'s site permissions');
          return;
        }
        fetch('/api/geo')
          .then(r => (r.ok ? r.json() : null))
          .then((geo: { latitude: number; longitude: number; city?: string | null } | null) => {
            if (!geo) throw new Error('no approximate location');
            map.flyTo({ center: [geo.longitude, geo.latitude], zoom: 10, duration: 1200 });
            onLocate?.(geo.latitude, geo.longitude);
            showMapHint(geo.city ? `Showing the approximate area of ${geo.city} — precise location wasn't available` : 'Showing an approximate location — precise location wasn\'t available');
          })
          .catch(() => {
            const message = error.code === error.TIMEOUT
              ? 'Location request timed out — try again'
              : 'Couldn\'t determine your location — check your device\'s location services';
            showMapHint(message);
          });
      },
      { timeout: 8000 }
    );
  };

  useSelectionFraming(mapRef, mapLoaded, {
    agencies, layers, selectedAgencySlug, selectedRoute, selectedStop, initialOnDemandSlug,
    initialMapCenter, areaFocus, resetViewKey, regionalView,
  });

  useRouteStyling(mapRef, mapLoaded, {
    agencies, layers, q, period, maxHeadway, tileFilter, selectedRoute, hoveredSearchRoute, hoveredBranch,
    selectedStop, routesForStop, stopZoomTier, showRouteLayers, liveRoutesOnly, filterToAgencies,
    agencyFilterSlugs, nightServiceView, frequentServiceView, historyOverlay, frequencySegmentOverlay,
    frequencySegmentOverlayRef, colorMode, colorVisionFriendly, onDemandFocus,
  });

  // Overlay layers (history, live vehicles) — extracted to hooks
  useHistoryLayer(mapRef, mapLoaded);
  // Clean up deck overlay on unmount
  useEffect(() => {
    return () => {
      deckOverlayRef.current?.finalize();
    };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', background: 'var(--bg-app)' }}>
      {/* Map Element */}
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

      {LiveVehiclesLayer && liveLayerRequested && (
        <React.Suspense fallback={null}>
          <LiveVehiclesLayer mapRef={mapRef} deckOverlayRef={deckOverlayRef} mapLoaded={mapLoaded} />
        </React.Suspense>
      )}

      {/* Geolocate Button Control Overlay */}
      {onDemandStatus === 'error' && onDemandShown && (
        // Zones that failed to load must not read as "no on-demand service here" (CIV-50), so no
        // other hint hides this; a transient hint sits above it instead.
        <MapNoticePill className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
          On-demand areas couldn't load.
        </MapNoticePill>
      )}
      {mapHint ? (
        <MapNoticePill raised={onDemandStatus === 'error' && onDemandShown} className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
          {mapHint}
        </MapNoticePill>
      ) : onDemandStatus !== 'error' && selectedModes.has(ON_DEMAND_MODE) && (
        // A missing zone must never read as "no on-demand service here" (CIV-23).
        <MapNoticePill className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
          On-demand coverage is still growing. Not every service is mapped yet.
        </MapNoticePill>
      )}

      {mapContextMenu && (
        <Panel
          className={`absolute ${Z_PANEL} pointer-events-auto`}
          style={{ left: mapContextMenu.x, top: mapContextMenu.y }}
        >
          <ListRow
            onClick={handleCopyLocationUrl}
            className="justify-start gap-2"
          >
            <Link2 className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
            <span className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">Copy URL for here</span>
          </ListRow>
          <ListRow
            onClick={handleReportIssue}
            className="justify-start gap-2"
          >
            <Flag className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
            <span className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">Report an issue</span>
          </ListRow>
        </Panel>
      )}

      {showMapContext && mapContextOpen && (
        <div ref={mapContextPanelRef}>
          <MapContextPanel
            agencies={mapContextAgencies}
            regionBySlug={mapContextRegionBySlug}
            mode={mapContextView}
            sidebarLeft={sidebarLeft}
            searchBarWidth={searchBarWidth}
            onSelectAgency={setSelectedAgencySlug ? slug => {
              onClearSelection?.();
              setSelectedAgencySlug(slug);
              onMapContextOpenChange?.(false);
            } : undefined}
            onSelectRoute={key => {
              onClearSelection?.();
              setSelectedRoute(key);
              onMapContextOpenChange?.(false);
            }}
          />
        </div>
      )}

      {/* Map controls — one stack keeps the gaps identical at every map size. */}
      {showMapControls && <div className={`absolute bottom-6 right-3 ${Z_PANEL} flex flex-col gap-2 pointer-events-auto`}>
        {exportEnabled && (
          <button
            onClick={() => setExportDialogOpen(true)}
            aria-label="Export map image"
            className="box-border !h-8 !w-8 min-h-8 min-w-8 shrink-0 p-0 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex flex-col rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-lg backdrop-blur-md overflow-hidden">
          <button
            onClick={() => mapRef.current?.zoomIn({ duration: 200 })}
            aria-label="Zoom in"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] border-b border-[var(--border-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => mapRef.current?.zoomOut({ duration: 200 })}
            aria-label="Zoom out"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={locateUser}
          aria-label="Go to my location"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5" />
        </button>
      </div>}
      <MapExportDialog
        open={exportDialogOpen}
        sourceSize={exportDialogOpen && mapRef.current ? { width: mapRef.current.getCanvas().width, height: mapRef.current.getCanvas().height } : null}
        prepareSource={prepareExportSource}
        releaseSource={releaseExportSource}
        describe={describeExport}
        lightMode={lightMode}
        onClose={() => setExportDialogOpen(false)}
      />

    </div>
  );
};

/** Skip re-renders when parent (sidebar search, stats) updates unrelated state. */
export const MapCanvas = React.memo(MapCanvasInner);
