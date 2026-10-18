import { useMemo } from 'react';
import type { ColorVisionMode } from '../../../utils/colors';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import type { DayType } from '../../../../shared/dayTypes';
import { FEATURES } from '../../../../shared/config';
import { buildSectionColourFeatures, selectedRouteMatches } from '../../../utils/sectionColours';

// CIV-152 (beta): the sections of every visible line whose every-gap grade differs from
// the route's own tier, in their own colour over the base line (#690 stopTiers, judged by
// the slower direction). A period view reads that period's per-stop values (CIV-321 S3); the
// filter still reads the route-level values.
export function useSectionColourFeatures({
  layers, filteredLayers, mapFilteredLayers, period, day, selectedRoute, colorMode, showRouteLayers,
  nightServiceView, frequentServiceView,
}: {
  layers?: Record<string, GeoJSON.FeatureCollection>;
  filteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  mapFilteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  period: TimePeriod;
  day: DayType;
  selectedRoute: string | null;
  colorMode: ColorVisionMode;
  showRouteLayers: boolean;
  nightServiceView: boolean;
  frequentServiceView: boolean;
}) {
  return useMemo(() => {
    if (!FEATURES.segmentColours || !showRouteLayers || nightServiceView || frequentServiceView) return [];
    // CIV-321 S3: a period view colours by that period's per-stop values (beta only, as above).
    const sectionPeriod = period === 'all' ? undefined : period;
    // The selected route is drawn whether or not it passes the filter, so its sections come
    // from the unfiltered layers for the current day.
    const notSelected = selectedRoute ? (p: { agencySlug: string; routeId: string }) => !selectedRouteMatches(selectedRoute, p.agencySlug, p.routeId) : undefined;
    const pieces = buildSectionColourFeatures(mapFilteredLayers ?? filteredLayers, day, colorMode, notSelected, sectionPeriod);
    if (!selectedRoute || !layers) return pieces;
    return pieces.concat(buildSectionColourFeatures(layers, day, colorMode,
      p => selectedRouteMatches(selectedRoute, p.agencySlug, p.routeId), sectionPeriod));
  }, [mapFilteredLayers, filteredLayers, layers, period, day, selectedRoute, colorMode, showRouteLayers, nightServiceView, frequentServiceView]);
}
