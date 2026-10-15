import { ON_DEMAND_MODE } from './modes.js';

/**
 * Which layers each map view may draw. One rule lives here so no view re-decides it.
 *
 * Frequency research views (Frequent Service, Night Service, and any view added to
 * FREQUENCY_RESEARCH_VIEWS) never show on-demand zones or stops: on-demand service has no scheduled
 * frequency, so drawing it beside frequency results is misleading. Every view that is not listed
 * here (main map, beta, History, Live) keeps its current behaviour.
 */
export type MapViewKind = 'map' | 'live' | 'night' | 'frequent-service';

export const FREQUENCY_RESEARCH_VIEWS: ReadonlySet<MapViewKind> = new Set<MapViewKind>(['night', 'frequent-service']);

/** The view a map is in, from the flags each view passes to the map. */
export function mapViewKind(flags: { nightServiceView?: boolean; frequentServiceView?: boolean; liveRoutesOnly?: boolean }): MapViewKind {
  if (flags.nightServiceView) return 'night';
  if (flags.frequentServiceView) return 'frequent-service';
  if (flags.liveRoutesOnly) return 'live';
  return 'map';
}

/** False for frequency research views, regardless of mode filters or URL state. */
export function viewAllowsOnDemand(view: MapViewKind): boolean {
  return !FREQUENCY_RESEARCH_VIEWS.has(view);
}

/** Mode options a view offers: research views drop On-demand. */
export function modesForView<T extends { id: number }>(modes: ReadonlyArray<T>, view: MapViewKind): ReadonlyArray<T> {
  return viewAllowsOnDemand(view) ? modes : modes.filter(m => m.id !== ON_DEMAND_MODE);
}
