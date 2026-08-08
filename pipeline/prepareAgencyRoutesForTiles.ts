/**
 * Prepare one agency's published route FeatureCollection for PMTiles (or other
 * flat-prop consumers).
 *
 * Re-stamps worst-direction headways with current product rules before flattening
 * period keys for MapLibre filters. Published Atlas JSON can still carry pre-fix
 * stamps (e.g. TTC 63 midday worst 175 from an unsustained St Clair short-turn);
 * tiles must not bake those in just because the GeoJSON was last processed under
 * older stamp logic. Client GeoJSON loads restamp in agencyGeo/geoWorker — this
 * is the same contract for the tile path.
 */
import { stampWorstDirectionHeadways } from '../shared/worstDirection.js';
import { flattenPeriodHeadwayProps } from '../shared/pmtilesProps.js';

export type RouteFeatureForTiles = {
  type: string;
  properties: Record<string, unknown> | null | undefined;
  geometry: { type: string; coordinates?: unknown };
};

/** Mutates features in place; returns LineString route features only. */
export function prepareAgencyRouteFeaturesForTiles(
  features: RouteFeatureForTiles[],
  agencySlug: string,
): RouteFeatureForTiles[] {
  // Stamp whole FC (including any non-LineString) so route+day groups are complete.
  stampWorstDirectionHeadways(features as Parameters<typeof stampWorstDirectionHeadways>[0]);

  const out: RouteFeatureForTiles[] = [];
  for (const f of features) {
    if (f.geometry?.type !== 'LineString') continue;
    f.properties = f.properties || {};
    f.properties.agencySlug = agencySlug;
    flattenPeriodHeadwayProps(f.properties);
    out.push(f);
  }
  return out;
}
