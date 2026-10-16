import { useEffect, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { DayType } from '../../../../shared/dayTypes';
import { frequentServiceBand, frequentServiceFeatureKey, frequentServiceQueryKey, type FrequentServiceFrequency, type FrequentServiceWindow } from '../../../../shared/frequentService';
import { effectiveMode, ON_DEMAND_MODE } from '../../../../shared/modes';
import { clipToStopIds } from '../../../utils/lineClip';
import { nightServiceKey, type NightServiceFrequency } from '../../../../shared/nightService';

type MapRef = React.RefObject<maplibregl.Map | null>;

/** Keeps a GeoJSON source's features in step with `features`. */
export function useGeoJsonFeaturesSource(mapRef: MapRef, mapLoaded: boolean, sourceId: string, features: GeoJSON.Feature[]) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features });
  }, [features, mapLoaded]);
}

/** On-demand zones and stops, shown whenever there is any to draw. */
export function useOnDemandSources(
  mapRef: MapRef,
  mapLoaded: boolean,
  { onDemandServiceAreaData, onDemandStopData, selectedAgencySlug }: {
    onDemandServiceAreaData: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
    onDemandStopData: GeoJSON.FeatureCollection<GeoJSON.Point>;
    selectedAgencySlug?: string | null;
  },
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('on-demand-service-areas') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(onDemandServiceAreaData);
    const stopSource = map.getSource('on-demand-stop-points') as maplibregl.GeoJSONSource | undefined;
    if (stopSource) stopSource.setData(onDemandStopData);
    // Service areas are map context, not selected-route detail: show them on
    // the regular map whenever the corresponding agency data is available.
    const visible = onDemandServiceAreaData.features.length > 0 || onDemandStopData.features.length > 0 ? 'visible' : 'none';
    for (const id of ['on-demand-service-area-fill', 'on-demand-service-area-line', 'on-demand-stop-points']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible);
    }
  }, [mapLoaded, onDemandServiceAreaData, onDemandStopData, selectedAgencySlug]);
}

/** The route features the Night Service overlay draws: service in the chosen night window. */
export function selectNightServiceFeatures(
  layers: Record<string, GeoJSON.FeatureCollection> | undefined,
  nightServiceFrequency: NightServiceFrequency,
): GeoJSON.Feature[] {
  if (!layers) return [];
  return Object.values(layers).flatMap(collection => collection.features.filter(feature => {
    const properties = feature.properties as Record<string, any> | null;
    return feature.geometry.type === 'LineString' && (properties?.[nightServiceKey(nightServiceFrequency)] === true || (nightServiceFrequency === 60 && properties?.nightService === true));
  }).flatMap((feature): GeoJSON.Feature[] => {
    // A route that runs at night on only part of it draws just the stops it serves.
    const p = feature.properties as Record<string, any> | null;
    if (nightServiceFrequency !== 60 || p?.nightServicePartOfRoute !== true || !Array.isArray(p.nightServiceStops)) return [feature];
    const pieces = clipToStopIds((feature.geometry as GeoJSON.LineString).coordinates, p.stopOrder, p.stopPositions, p.nightServiceStops);
    if (!pieces) return [feature];
    return pieces.map(coordinates => ({ ...feature, geometry: { type: 'LineString', coordinates } }));
  }));
}

/** Night Service overlay: routes with service in the chosen night window. */
export function useNightServiceLayer(
  mapRef: MapRef,
  mapLoaded: boolean,
  { layers, nightServiceView, nightServiceFrequency }: {
    layers?: Record<string, GeoJSON.FeatureCollection>;
    nightServiceView: boolean;
    nightServiceFrequency: NightServiceFrequency;
  },
) {
  const nightServiceFeatures = useMemo(
    () => (nightServiceView ? selectNightServiceFeatures(layers, nightServiceFrequency) : []),
    [layers, nightServiceFrequency, nightServiceView],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('night-service-routes') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: nightServiceFeatures });
    if (map.getLayer('night-service-routes-layer')) {
      map.setLayoutProperty('night-service-routes-layer', 'visibility', nightServiceView ? 'visible' : 'none');
    }
    if (map.getLayer('night-service-routes-hit-layer')) {
      map.setLayoutProperty('night-service-routes-hit-layer', 'visibility', nightServiceView ? 'visible' : 'none');
    }
  }, [nightServiceFeatures, nightServiceView, mapLoaded]);
}

/** The route features the Frequent Service overlay draws: frequent on every chosen day, with their band. */
export function selectFrequentServiceFeatures(
  layers: Record<string, GeoJSON.FeatureCollection> | undefined,
  { frequentServiceDays, frequentServiceFrequency, frequentServiceWindow, selectedModes }: {
    frequentServiceDays: DayType[];
    frequentServiceFrequency: FrequentServiceFrequency;
    frequentServiceWindow: FrequentServiceWindow;
    selectedModes: Set<number>;
  },
): GeoJSON.Feature[] {
  if (!layers) return [];
  const key = frequentServiceQueryKey(frequentServiceFrequency, frequentServiceWindow);
  const grouped = new Map<string, GeoJSON.Feature[]>();
  for (const feature of Object.values(layers ?? {}).flatMap(collection => collection.features)) {
    if (feature.geometry.type !== 'LineString') continue;
    const props = feature.properties as Record<string, any> | null;
    if (!props?.day || !frequentServiceDays.includes(props.day) || !props.researchFrequentService?.[key]) continue;
    const routeModes = [...selectedModes].filter(mode => mode !== ON_DEMAND_MODE);
    if (selectedModes.size > 0 && (routeModes.length === 0 || !routeModes.includes(effectiveMode({
      routeType: props.routeType,
      routeLongName: props.routeLongName,
      routeShortName: props.routeShortName,
      agencySlug: props.agencySlug,
    })))) continue;
    const group = grouped.get(frequentServiceFeatureKey(props)) ?? [];
    group.push(feature);
    grouped.set(frequentServiceFeatureKey(props), group);
  }
  const qualifyingKeys = new Set([...grouped.entries()]
    .filter(([, features]) => new Set(features.map(feature => (feature.properties as any)?.day)).size === frequentServiceDays.length)
    .map(([group]) => group));
  return Object.values(layers ?? {}).flatMap(collection => collection.features.filter(feature => {
    const props = feature.properties as Record<string, any> | null;
    return feature.geometry.type === 'LineString' && props?.day === frequentServiceDays[0] && qualifyingKeys.has(frequentServiceFeatureKey(props));
  }).map(feature => ({
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      frequentServiceBand: frequentServiceBand(feature.properties as Record<string, any>, frequentServiceWindow, frequentServiceFrequency),
    },
  })));
}

/** Frequent-service overlay: routes frequent on every chosen day, banded every 15 or every 30. */
export function useFrequentServiceLayer(
  mapRef: MapRef,
  mapLoaded: boolean,
  { layers, frequentServiceView, frequentServiceDays, frequentServiceFrequency, frequentServiceWindow, selectedModes }: {
    layers?: Record<string, GeoJSON.FeatureCollection>;
    frequentServiceView: boolean;
    frequentServiceDays: DayType[];
    frequentServiceFrequency: FrequentServiceFrequency;
    frequentServiceWindow: FrequentServiceWindow;
    selectedModes: Set<number>;
  },
) {
  const frequentServiceFeatures = useMemo(
    () => (frequentServiceView ? selectFrequentServiceFeatures(layers, { frequentServiceDays, frequentServiceFrequency, frequentServiceWindow, selectedModes }) : []),
    [frequentServiceDays, frequentServiceFrequency, frequentServiceView, frequentServiceWindow, layers, selectedModes],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('frequent-service-routes') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: frequentServiceFeatures });
    for (const id of ['frequent-service-routes-layer', 'frequent-service-routes-hit-layer']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', frequentServiceView ? 'visible' : 'none');
    }
  }, [frequentServiceFeatures, frequentServiceView, mapLoaded]);
}
