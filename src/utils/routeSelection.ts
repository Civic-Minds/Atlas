import type { GeoJSON } from 'geojson';

interface RouteSelectionProperties {
  routeId?: string;
  routeShortName?: string | null;
  routeLongName?: string | null;
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
  const separator = selectedRoute.indexOf('::');
  if (separator < 0) return null;
  const selectedRouteId = selectedRoute.slice(separator + 2);
  if (!selectedRouteId) return null;

  const routeFeatures = features
    .map(f => f.properties as RouteSelectionProperties | null)
    .filter((p): p is RouteSelectionProperties => !!p?.routeId);
  const selectedFeature = routeFeatures.find(p => p.routeId === selectedRouteId);
  if (!selectedFeature) return null;

  const isActiveDay = (p: RouteSelectionProperties) => p.day === undefined || p.day === day;
  if (routeFeatures.some(p => p.routeId === selectedRouteId && isActiveDay(p))) {
    return `${agencySlug}::${selectedRouteId}`;
  }

  const sameLogicalRouteIds = new Set(
    routeFeatures
      .filter(p =>
        isActiveDay(p) &&
        p.routeShortName === selectedFeature.routeShortName &&
        (p.routeLongName ?? null) === (selectedFeature.routeLongName ?? null),
      )
      .map(p => p.routeId as string),
  );

  return sameLogicalRouteIds.size === 1
    ? `${agencySlug}::${[...sameLogicalRouteIds][0]}`
    : null;
}
