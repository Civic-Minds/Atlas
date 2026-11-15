import { useMemo } from 'react';
import type { ColorVisionMode } from '../../../utils/colors';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import type { DayType } from '../../../../shared/dayTypes';
import { FEATURES } from '../../../../shared/config';
import { buildSectionColourFeatures } from '../../../utils/sectionColours';

export interface SectionColourInput {
  filteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  mapFilteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  period: TimePeriod;
  day: DayType;
  colorMode: ColorVisionMode;
  showRouteLayers: boolean;
  nightServiceView: boolean;
  frequentServiceView: boolean;
  /** Defaults to FEATURES.segmentColours (beta only); tests pass it. */
  enabled?: boolean;
}

/**
 * CIV-152 (beta): the sections of every drawn line whose every-gap grade differs from the route's own tier, in their
 * own colour over the base line (#690 stopTiers, judged by the slower direction). A period view reads that period's
 * per-stop values (CIV-321 S3); the filter still reads the route-level values.
 *
 * Every piece, the selected route's included, comes from the map-filtered layers: a selected route is drawn only when
 * it passes the map's filters, the same on every site (#1504; useIntervalStats' selectedRoute, 64db443e2). The pieces
 * carry none of the fields the tile filter reads, so the filter is applied here, to the lines they are cut from.
 */
export function sectionColourFeatures({
  filteredLayers, mapFilteredLayers, period, day, colorMode, showRouteLayers, nightServiceView, frequentServiceView,
  enabled = FEATURES.segmentColours,
}: SectionColourInput) {
  if (!enabled || !showRouteLayers || nightServiceView || frequentServiceView) return [];
  // CIV-321 S3: a period view colours by that period's per-stop values (beta only, as above).
  const sectionPeriod = period === 'all' ? undefined : period;
  return buildSectionColourFeatures(mapFilteredLayers ?? filteredLayers, day, colorMode, undefined, sectionPeriod);
}

export function useSectionColourFeatures(input: SectionColourInput) {
  const { filteredLayers, mapFilteredLayers, period, day, colorMode, showRouteLayers, nightServiceView, frequentServiceView } = input;
  return useMemo(() => sectionColourFeatures({ filteredLayers, mapFilteredLayers, period, day, colorMode, showRouteLayers, nightServiceView, frequentServiceView }),
    [filteredLayers, mapFilteredLayers, period, day, colorMode, showRouteLayers, nightServiceView, frequentServiceView]);
}
