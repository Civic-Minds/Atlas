import type { ShapeProperties, HoveredBranch, DayType } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import { clipBetweenStopIndices } from '../apps/corridor-geometry';
import { headwayToTierColor } from './colors';

/** Build clipped GeoJSON for the shared section of a hovered multi-branch direction. */
export function buildSharedHoverSegments(
  layers: AgencyLayers | undefined,
  selectedRoute: string | null,
  hoveredBranch: HoveredBranch | null,
  day: DayType,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (!layers || !selectedRoute || !hoveredBranch?.isCore || (hoveredBranch.sharedStopIds?.length ?? 0) < 2) {
    return [];
  }

  const separator = selectedRoute.indexOf('::');
  if (separator < 0) return [];
  const agencySlug = selectedRoute.slice(0, separator);
  const routeId = selectedRoute.slice(separator + 2);
  const headsigns = new Set(hoveredBranch.headsigns ?? []);
  if (headsigns.size === 0) return [];
  const sharedStops = new Set(hoveredBranch.sharedStopIds);
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const feature of layers[agencySlug]?.features ?? []) {
    if (feature.geometry.type !== 'LineString') continue;
    const p = feature.properties as unknown as ShapeProperties;
    if (String(p.routeId) !== routeId || Number(p.directionId) !== Number(hoveredBranch.directionId)) continue;
    if (p.day !== undefined && p.day !== day) continue;
    if (!p.headsign || !headsigns.has(p.headsign) || !p.stopOrder || !p.stopPositions) continue;
    if (p.stopPositions.length !== p.stopOrder.length) continue;

    const indices = p.stopOrder
      .map((stopId, index) => sharedStops.has(stopId) ? index : -1)
      .filter(index => index >= 0);
    if (indices.length < 2) continue;

    const coordinates = clipBetweenStopIndices(
      feature.geometry.coordinates,
      p.stopPositions,
      Math.min(...indices),
      Math.max(...indices),
    );
    if (!coordinates) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        color: headwayToTierColor(hoveredBranch.sharedHeadway),
        agencySlug,
        routeId,
        directionId: hoveredBranch.directionId,
        headsign: p.headsign,
        day: p.day ?? day,
      },
    });
  }

  return features;
}
