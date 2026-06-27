import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import { HEADWAY_TIERS } from '../../utils/colors';
import { titleCase, fmtHeadway } from '../../utils/format';
import { getRegionalView, getSavedView } from '../../utils/regionView';
import { useCorridorMapOverlay } from '../../context/CorridorMapOverlay';
import { CorridorMapLayers } from '../corridor/CorridorMapLayers';
import { useHistoryMapOverlay } from '../../context/HistoryMapOverlay';
import { HistoryStopMarkers } from '../history/HistoryStopMarkers';
import {
  MapRefCapturer, MapClickHandler, LocateControl, ResetViewControl,
  RouteZoomer, ViewPersistor, GeolocateOnMount, BoundsReporter,
} from './MapControls';
import type { Agency } from '../../App';
import type { AgencyLayers, ShapeProperties } from '../../hooks/useIntervalStats';
import type { ViewportBounds, TimePeriod } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod } from '../../hooks/useAgencyData';

const CORRIDOR_BAND_COLOR = HEADWAY_TIERS[0].color;

function periodTierColor(p: ShapeProperties, period: TimePeriod): string {
  if (period !== 'all') {
    const byPeriod = (p as any).headwayByPeriod as HeadwayByPeriod | undefined;
    const h = byPeriod?.[period as keyof HeadwayByPeriod];
    if (h != null) {
      if (h <= 10) return getTierColor('10');
      if (h <= 15) return getTierColor('15');
      if (h <= 20) return getTierColor('20');
      if (h <= 30) return getTierColor('30');
      if (h <= 60) return getTierColor('60');
      return getTierColor('infrequent');
    }
  }
  return getTierColor(p?.tier ?? null);
}

interface MapCanvasProps {
  agencies: Agency[];
  layers: AgencyLayers;
  allLayers?: AgencyLayers;
  maxHeadway: number;
  period: TimePeriod;
  q: string;
  selectedRoute: string | null;
  setSelectedRoute: React.Dispatch<React.SetStateAction<string | null>>;
  selectedStop: string | null;
  setSelectedStop: React.Dispatch<React.SetStateAction<string | null>>;
  setDisambiguationRoutes: (routes: string[] | null) => void;
  lightMode: boolean;
  matchesQuery: (p: ShapeProperties) => boolean;
  onBoundsChange: (b: ViewportBounds) => void;
  resetViewKey?: number;
  onLocate?: (lat: number, lon: number) => void;
  routesForStop?: { slug: string; routeIds: Set<string> } | null;
  showRouteLayers?: boolean;
  showCorridorBand?: boolean;
}

/**
 * Interpolates a point along a linestring at parameter t ∈ [0,1].
 * Coordinates are [lon, lat] (GeoJSON order).
 */
function interpolateAt(coords: number[][], t: number): number[] {
  if (t <= 0) return coords[0];
  if (t >= 1) return coords[coords.length - 1];
  // Compute cumulative lengths
  const lens: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    lens.push(lens[i] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = lens[lens.length - 1];
  const target = t * total;
  for (let i = 0; i < lens.length - 1; i++) {
    if (target <= lens[i + 1]) {
      const segLen = lens[i + 1] - lens[i];
      const frac = segLen > 0 ? (target - lens[i]) / segLen : 0;
      return [
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ];
    }
  }
  return coords[coords.length - 1];
}

/**
 * Returns the sub-array of coords between parameters tStart and tEnd (0–1),
 * with interpolated endpoints. Returns null if the segment is degenerate.
 */
function clipLinestring(coords: number[][], tStart: number, tEnd: number): number[][] | null {
  if (tEnd <= tStart) return null;
  // Compute cumulative lengths once
  const lens: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    lens.push(lens[i] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = lens[lens.length - 1];
  if (total === 0) return null;
  const targetStart = tStart * total;
  const targetEnd = tEnd * total;

  const result: number[][] = [];
  // Interpolated start point
  for (let i = 0; i < lens.length - 1; i++) {
    const segLen = lens[i + 1] - lens[i];
    if (lens[i + 1] >= targetStart && result.length === 0) {
      const frac = segLen > 0 ? (targetStart - lens[i]) / segLen : 0;
      result.push([
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ]);
    }
    // Interior vertices within the window
    if (lens[i + 1] > targetStart && lens[i + 1] < targetEnd) {
      result.push(coords[i + 1]);
    }
    // Interpolated end point
    if (lens[i] < targetEnd && lens[i + 1] >= targetEnd) {
      const frac = segLen > 0 ? (targetEnd - lens[i]) / segLen : 1;
      result.push([
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ]);
      break;
    }
  }
  return result.length >= 2 ? result : null;
}

/**
 * Given a route feature with stopOrder/stopPositions/stopHeadways, returns the
 * clipped coordinate array covering only the longest contiguous segment where every
 * stop has headway <= maxHeadway. Falls back to the full coords if data is absent.
 */
function getClippedCoords(feature: GeoJSON.Feature, maxHeadway: number): number[][] {
  const p = feature.properties as any;
  const stopOrder: string[] | undefined = p.stopOrder;
  const stopPositions: number[] | undefined = p.stopPositions;
  const stopHeadways: Record<string, number> | undefined = p.stopHeadways;
  const coords = (feature.geometry as GeoJSON.LineString).coordinates;

  if (!stopOrder || !stopPositions || !stopHeadways || stopOrder.length < 2) return coords;

  // Find the longest contiguous run of stops passing the threshold.
  // A stop "passes" if its headway <= maxHeadway.
  let bestStart = -1, bestEnd = -1, bestLen = 0;
  let runStart = -1;
  for (let i = 0; i < stopOrder.length; i++) {
    const hw = stopHeadways[stopOrder[i]];
    const passes = hw != null && hw <= maxHeadway;
    if (passes) {
      if (runStart === -1) runStart = i;
      const len = i - runStart + 1;
      if (len > bestLen) { bestLen = len; bestStart = runStart; bestEnd = i; }
    } else {
      runStart = -1;
    }
  }

  if (bestStart === -1 || bestLen < 2) return coords;

  // Add a half-stop buffer at each end so the line doesn't abruptly end mid-block.
  const tStart = bestStart > 0
    ? (stopPositions[bestStart] + stopPositions[bestStart - 1]) / 2
    : stopPositions[bestStart];
  const tEnd = bestEnd < stopPositions.length - 1
    ? (stopPositions[bestEnd] + stopPositions[bestEnd + 1]) / 2
    : stopPositions[bestEnd];

  return clipLinestring(coords, tStart, tEnd) ?? coords;
}

function findRoutesNearClick(
  clickLatLng: L.LatLng,
  map: L.Map,
  allLayers: AgencyLayers,
  pixelTolerance: number,
): string[] {
  const zoom = map.getZoom();
  const clickPx = map.project(clickLatLng, zoom);
  // Deduplicate by agencySlug::shortName so different schedule-period route_ids
  // for the same visible route (e.g. two HSR "20" feeds) don't each get a row.
  const seenDisplay = new Set<string>();
  const found: string[] = [];
  const t2 = pixelTolerance * pixelTolerance;

  for (const [slug, fc] of Object.entries(allLayers)) {
    for (const feature of fc.features) {
      if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') continue;
      const p = feature.properties as unknown as ShapeProperties;
      if ((p as any).isCorridor || !(p as any).routeId) continue;
      const displayKey = `${slug}::${p.routeShortName ?? (p as any).routeId}`;
      if (seenDisplay.has(displayKey)) continue;

      const coords: number[][] =
        feature.geometry.type === 'LineString'
          ? feature.geometry.coordinates
          : (feature.geometry.coordinates as number[][][]).flat();

      const step = Math.max(1, Math.floor(coords.length / 80));
      for (let i = 0; i < coords.length; i += step) {
        const [lng, lat] = coords[i];
        const px = map.project(L.latLng(lat, lng), zoom);
        const dx = px.x - clickPx.x;
        const dy = px.y - clickPx.y;
        if (dx * dx + dy * dy <= t2) {
          seenDisplay.add(displayKey);
          found.push(routeKey({ ...p, agencySlug: slug } as any));
          break;
        }
      }
    }
  }
  return found;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  agencies,
  layers,
  allLayers,
  maxHeadway,
  period,
  q,
  selectedRoute,
  setSelectedRoute,
  selectedStop,
  setSelectedStop,
  lightMode,
  setDisambiguationRoutes,
  matchesQuery,
  onBoundsChange,
  resetViewKey,
  onLocate,
  routesForStop,
  showRouteLayers = true,
  showCorridorBand = false,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const { overlay: corridorOverlay } = useCorridorMapOverlay();
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const corridorSelected = showCorridorBand && (corridorOverlay?.lines.length ?? 0) > 0;
  const regionalView = getRegionalView(agencies);
  const hasSavedView = getSavedView() !== null;
  const [zoom, setZoom] = useState(regionalView.zoom);
  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  // Zoom tiers:
  // - >=15: all individual stops
  // - 12–14: rail/subway stations only (bus stops too noisy at city scale)
  // - <12: none except explicitly selected
  const showAllStops = zoom >= 15;
  const showHubsOnly = false;
  const showRailOnly = zoom >= 12 && zoom < 15;

  // Per ~50m grid cell, keep only the highest-priority stop across all agencies so
  // shared stations (e.g. GO + TTC at Union) don't render overlapping duplicate pins.
  // Score: rail stops beat bus stops; within a mode, more routes = higher priority.
  const primaryStopKeys = useMemo(() => {
    const cellBest = new Map<string, { compositeId: string; score: number }>();
    for (const [slug, data] of Object.entries(layers)) {
      const fc = data as GeoJSON.FeatureCollection;
      for (const f of fc.features) {
        if (f.geometry.type !== 'Point') continue;
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
        const locKey = `${Math.round(lat * 2000)}_${Math.round(lon * 2000)}`;
        const p = f.properties as any;
        if (!p.stopId) continue;
        const compositeId = `${slug}::${p.stopId}`;
        const score = (p.isRail ? 1000 : 0) + (p.routeIds?.length ?? 0);
        const prev = cellBest.get(locKey);
        if (!prev || score > prev.score) cellBest.set(locKey, { compositeId, score });
      }
    }
    return new Set([...cellBest.values()].map(v => v.compositeId));
  }, [layers]);

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const p = feature?.properties as unknown as ShapeProperties;

      // Stop points: hide at regional zoom, show when zoomed in
      if (feature?.geometry.type === 'Point') return {};

      const isCorridor = !!(p as any)?.isCorridor;

      // Corridors app initial view: show only isCorridor band, hide everything else.
      // When a corridor selection is active, hide everything (CorridorMapLayers takes over).
      if (showCorridorBand) {
        if (corridorSelected) return { opacity: 0, interactive: false };
        if (!isCorridor) return { opacity: 0, interactive: false };
        return { color: CORRIDOR_BAND_COLOR, weight: 3.5, opacity: 0.75, lineCap: 'round' as const, lineJoin: 'round' as const, interactive: false };
      }

      // History mode: highlight only the focused route, dim everything else.
      if (historyOverlay && !isCorridor) {
        const agSlug = (p as any)?.agencySlug as string | undefined;
        const rShort = p?.routeShortName;
        const isFocused = agSlug === historyOverlay.slug && rShort === historyOverlay.routeShortName;
        if (!isFocused) return { opacity: 0.06, interactive: false };
        const isRailFocus = p?.routeType === 2;
        return {
          color: CORRIDOR_BAND_COLOR,
          weight: isRailFocus ? 5 : 4,
          opacity: 0.9,
          lineCap: 'round' as const,
          lineJoin: 'round' as const,
          interactive: false,
        };
      }

      // Thickness rules (plain English):
      // - Rail (routeType=2) always +1 thicker than buses (to distinguish the mode)
      // - Selected route: thickest (3.5 bus / 4.5 rail)
      // - Search active + match: boosted (2.5 bus / 3.5 rail)
      // - Normal visible: base (1.5 bus / 2.5 rail)
      // - Dimmed/non-match: thin (0.5 bus / 1 rail)
      // - Corridors: 2 when visible
      // - Hit layer (invisible): 16 for easy clicking
      // Frequency info comes ONLY from color. Thickness is for mode + state only.
      const isRail = p?.routeType === 2;

      if (routesForStop) {
        const featSlug = (p as any)?.agencySlug;
        const routeId = p?.routeId;
        const cRouteIds = (p as any)?.routeIds as string[] | undefined;
        const servesStop = featSlug === routesForStop.slug &&
          (!routeId || routesForStop.routeIds.has(routeId)) &&
          (!cRouteIds || cRouteIds.some((rid) => routesForStop.routeIds.has(rid)));
        if (!servesStop) {
          return { color: lightMode ? '#cbd5e1' : '#334155', weight: isRail ? 1 : 0.5, opacity: 0.12, interactive: false };
        }
      }

      if (selectedRoute !== null) {
        if (isCorridor) {
          // When a route is selected, keep its overlapping corridors visible at full combined color; dim others
          const cRoutes: string[] = (p as any)?.routeIds || [];
          const cAgencySlug = (p as any)?.agencySlug;
          const contrib = cRoutes.some((rid) => routeKey({ agencySlug: cAgencySlug, routeId: rid } as any) === selectedRoute);
          if (contrib) {
            return { color: periodTierColor(p as ShapeProperties, period), weight: 2.5, opacity: 0.9, interactive: false };
          }
          return { color: '#1e293b', weight: 0.5, opacity: 0.15, interactive: false };
        }
        const key = p ? routeKey(p) : null;
        if (key === selectedRoute) {
          return { color: periodTierColor(p as ShapeProperties, period), weight: isRail ? 4.5 : 3.5, opacity: 1, interactive: false };
        }
        // Rail lines stay slightly visible when dimmed so the network structure reads through
        return { color: '#1e293b', weight: isRail ? 1 : 0.5, opacity: isRail ? 0.25 : 0.2, interactive: false };
      }
      const match = matchesQuery(p);
      if (!match) {
        if (isCorridor) {
          return { color: lightMode ? '#cbd5e1' : '#334155', weight: 1, opacity: 0.2, interactive: false };
        }
        return { color: lightMode ? '#cbd5e1' : '#334155', weight: isRail ? 1 : 0.5, opacity: 0.12, interactive: false };
      }
      if (isCorridor) {
        return {
          color: periodTierColor(p as ShapeProperties, period),
          weight: 2,
          opacity: 0.9,
          interactive: false,
        };
      }
      return {
        color: periodTierColor(p as ShapeProperties, period),
        weight: q !== '' ? (isRail ? 3.5 : 2.5) : isRail ? 2.5 : 1.5,
        opacity: p?.tier ? (q !== '' ? 1 : isRail ? 0.9 : 0.8) : 0.3,
        interactive: false,
      };
    },
    [maxHeadway, period, q, selectedRoute, lightMode, matchesQuery, routesForStop, showCorridorBand, corridorSelected, historyOverlay]
  );

  // Invisible, much wider line drawn under the visible one purely to make routes
  // easier to click/tap — the visible style above stays thin for legibility.
  const hitStyle = useCallback((): L.PathOptions => ({
    color: '#000000',
    weight: 16,
    opacity: 0,
    interactive: true,
  }), []);

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const props = feature.properties as unknown as ShapeProperties;

      if (feature.geometry.type === 'Point') {
        const { stopName, stopId, routeIds } = props;
        const agencySlug = (props as any).agencySlug as string | undefined;
        const compositeStopId = agencySlug && stopId ? `${agencySlug}::${stopId}` : stopId || null;
        const displayName = stopName ? titleCase(stopName) : stopName;
        (layer as L.Marker).bindTooltip(
          `<div class="tooltip-content">
            <div class="tooltip-name">Station</div>
            <div class="tooltip-title">${displayName}</div>
          </div>`,
          { sticky: true, className: 'atlas-tooltip', opacity: 1 }
        );
        layer.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setSelectedRoute(null);
          setDisambiguationRoutes(null);
          setSelectedStop(prev => prev === compositeStopId ? null : compositeStopId);
        });
        return;
      }

      const isCorridor = !!(props as any)?.isCorridor;
      if (isCorridor) {
        const h = (props as any).headway;
        const n = ((props as any).routeIds?.length || 0);
        (layer as L.Path).bindTooltip(
          `<div class="tooltip-content">
            <div class="tooltip-name">Combined corridor</div>
            <div class="tooltip-info">${h != null ? `every ${h} min` : ''} • ${n} overlapping routes</div>
          </div>`,
          { sticky: true, className: 'atlas-tooltip', opacity: 1 }
        );
        // Corridors are viz overlays for combined freq; click clears route selection (no single route to select)
        (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setSelectedRoute(null);
        });
        return;
      }

      // Route lines: no map tooltip (hover or click). Click selects and opens the full details
      // exclusively in the left sidebar panel (sized to match the search bar width).
      const key = routeKey(props);
      (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedStop(null);
        const map = mapRef.current;
        if (map) {
          const nearby = findRoutesNearClick(e.latlng, map, layers, 10);
          if (nearby.length > 1) {
            setDisambiguationRoutes(nearby);
            return;
          }
        }
        setSelectedRoute(prev => (prev === key ? null : key));
      });
    },
    [selectedRoute, setSelectedRoute, selectedStop, setSelectedStop, setDisambiguationRoutes, layers]
  );

  return (
    <MapContainer
      center={regionalView.center}
      zoom={regionalView.zoom}
      style={{ height: '100%', width: '100%', background: 'var(--bg-app)' }}
      zoomControl={false}
      preferCanvas={true}
      zoomAnimation={true}
      zoomSnap={0.25}
      zoomDelta={1}
      wheelPxPerZoomLevel={60}
    >
      <TileLayer
        key={tileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={tileUrl}
      />
      <MapRefCapturer mapRef={mapRef} />
      <MapClickHandler onClear={() => { setSelectedRoute(null); setSelectedStop(null); setDisambiguationRoutes(null); }} />
      <BoundsReporter onBoundsChange={onBoundsChange} onZoomChange={setZoom} />
      <ViewPersistor />
      <GeolocateOnMount skip={hasSavedView} />
      <ResetViewControl resetKey={resetViewKey} agencies={agencies} />
      <LocateControl onLocate={onLocate} />
      <RouteZoomer selectedRoute={selectedRoute} layers={allLayers || layers} />
      {(showCorridorBand || !showRouteLayers) && corridorOverlay && <CorridorMapLayers overlay={corridorOverlay} />}
      {historyOverlay && <HistoryStopMarkers />}
      {showRouteLayers && Object.entries(layers).map(([slug, data]) => {
        const fc = data as GeoJSON.FeatureCollection;
        // Split route shapes from stop points — stops mount/unmount on zoom without
        // triggering expensive remounts of the much larger route layer.
        const lineFeatures = fc.features.filter(f => f.geometry.type !== 'Point');
        const pointFeatures = fc.features.filter(f => f.geometry.type === 'Point');
        const filterActive = maxHeadway !== Infinity;
        const lineFc = {
          ...fc,
          features: lineFeatures.map(f => {
            const withSlug = { ...f, properties: { ...f.properties, agencySlug: slug } };
            if (!filterActive || f.geometry.type !== 'LineString') return withSlug;
            const clipped = getClippedCoords(withSlug, maxHeadway);
            if (clipped === (f.geometry as GeoJSON.LineString).coordinates) return withSlug;
            if (clipped.some(c => isNaN(c[0]) || isNaN(c[1]))) return withSlug;
            return { ...withSlug, geometry: { type: 'LineString' as const, coordinates: clipped } };
          }),
        };
        // Inject agencySlug so onEachFeature can build the composite stopId key
        const pointFc = { ...fc, features: pointFeatures.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })) };
        return (
          <React.Fragment key={slug}>
            <GeoJSON
              key={`${slug}-hit-${lineFeatures.length}`}
              data={lineFc}
              style={hitStyle}
              onEachFeature={onEachFeature}
            />
            <GeoJSON
              key={`${slug}-lines-${maxHeadway}-${q}-${lineFeatures.length}`}
              data={lineFc}
              style={styleFeature}
              />
              {(showAllStops || showHubsOnly || showRailOnly || selectedStop != null) && pointFeatures.length > 0 && (
              <GeoJSON
                key={`${slug}-stops-${selectedStop}-${zoom >= 12 ? zoom : 'hidden'}`}
                data={pointFc}
                style={styleFeature}
                onEachFeature={onEachFeature}
                pointToLayer={(feature, latlng) => {
                  const props = feature.properties as unknown as ShapeProperties;
                  const agSlug = (props as any).agencySlug as string | undefined;
                  const compositeId = agSlug && props.stopId ? `${agSlug}::${props.stopId}` : props.stopId;
                  const isSelected = selectedStop === compositeId;
                  const routeCount = (props as any).routeIds?.length ?? 0;
                  const isHub = (props as any).isHub || routeCount >= 4;
                  const isRail = (props as any).isRail;

                  // Visibility logic — prevents terminal clusters from becoming blobs at overview zooms.
                  // Only "significant" stops (hubs/terminals + rail) are shown until you zoom in.
                  if (!isSelected) {
                    // Hide stops that lost the per-location priority race (deduplicates shared stations).
                    if (compositeId && !primaryStopKeys.has(compositeId)) {
                      return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                    }
                    if (zoom < 12) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                    if (zoom < 15 && !isRail) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                  }

                  // Smaller regular stops + slightly scaled by zoom so terminals read cleanly far out.
                  // Hubs (terminals) get a bit more presence.
                  const baseR = isSelected ? 6 : isRail ? 4.5 : isHub ? 4.2 : 2.2;
                  const zFactor = zoom >= 15 ? 1.05 : zoom >= 14 ? 0.85 : 0.72;
                  const radius = Math.max(1.2, baseR * zFactor);
                  const fillColor = isSelected ? 'var(--accent)' : isRail ? (lightMode ? '#fff' : 'var(--accent)') : 'var(--text-dim)';
                  const color = isSelected ? '#fff' : isRail ? 'var(--accent)' : 'var(--border-primary)';
                  const weight = isSelected ? 1.5 : isRail ? 2 : 1;
                  const opacity = isSelected ? 1 : isRail ? 0.9 : 0.55;
                  const fillOpacity = isSelected ? 1 : isRail ? 1 : isHub ? 0.55 : 0.25;

                  return L.circleMarker(latlng, {
                    radius,
                    fillColor,
                    color,
                    weight,
                    opacity,
                    fillOpacity,
                  });
                }}
              />
              )}
              </React.Fragment>
        );
      })}
    </MapContainer>
  );
};
