import type { GeoJSON } from 'geojson';
import { buildRouteKey, splitRouteKey } from './routeKey';

interface RouteSelectionProperties {
  routeId?: string;
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeBranch?: string | null;
  day?: string;
}

/**
 * Keep a selected logical route when an agency uses different route IDs on
 * different service days (for example Visalia's 6A and 6AW).
 *
 * Route IDs remain the normal identity. We only switch IDs when the selected
 * ID is absent for the active day and exactly one same-name route exists there.
 */
export function resolveRouteSelectionForDay(
  selectedRoute: string,
  agencySlug: string,
  features: GeoJSON.Feature[],
  day: string,
): string | null {
  const { routeId: selectedRouteId, routeBranch: selectedBranch } = splitRouteKey(selectedRoute);
  if (!selectedRouteId) return null;

  const routeFeatures = features
    .map(f => f.properties as RouteSelectionProperties | null)
    .filter((p): p is RouteSelectionProperties => !!p?.routeId);
  const selectedFeature = routeFeatures.find(p => p.routeId === selectedRouteId && (p.routeBranch ?? undefined) === selectedBranch);
  if (!selectedFeature) return null;

  const isActiveDay = (p: RouteSelectionProperties) => p.day === undefined || p.day === day;
  if (routeFeatures.some(p => p.routeId === selectedRouteId && (p.routeBranch ?? undefined) === selectedBranch && isActiveDay(p))) {
    return buildRouteKey(agencySlug, selectedRouteId, selectedBranch);
  }

  const sameLogicalRouteIds = new Set(
    routeFeatures
      .filter(p =>
        isActiveDay(p) &&
        p.routeShortName === selectedFeature.routeShortName &&
        (p.routeLongName ?? null) === (selectedFeature.routeLongName ?? null) &&
        (p.routeBranch ?? null) === (selectedFeature.routeBranch ?? null),
      )
      .map(p => p.routeId as string),
  );

  return sameLogicalRouteIds.size === 1
    ? buildRouteKey(agencySlug, [...sameLogicalRouteIds][0], selectedBranch)
    : null;
}
