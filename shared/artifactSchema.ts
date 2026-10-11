/**
 * Version for processed route GeoJSON consumed by the frontend and PMTiles build.
 * Bump this when process-core adds or changes a derived route field.
 */
export const ROUTE_ARTIFACT_SCHEMA_VERSION = 2;

export interface RouteArtifactEnvelope {
  type?: string;
  features?: unknown[];
  atlasSchemaVersion?: number;
}

export function routeArtifactSchemaError(
  artifact: RouteArtifactEnvelope,
  source: string,
): string | null {
  if (artifact.atlasSchemaVersion !== ROUTE_ARTIFACT_SCHEMA_VERSION) {
    return `${source} has route artifact schema ${artifact.atlasSchemaVersion ?? 'missing'}; expected ${ROUTE_ARTIFACT_SCHEMA_VERSION}. Reprocess the full catalog before rebuilding PMTiles.`;
  }
  return null;
}

export function assertRouteArtifactSchema(
  artifact: RouteArtifactEnvelope,
  source: string,
): void {
  const error = routeArtifactSchemaError(artifact, source);
  if (error) throw new Error(error);
}

/**
 * Version of the rules that build-pmtiles bakes into map tiles (worst-direction
 * stamping, period-headway flattening). The browser re-applies the same rules to
 * agency JSON at load time, so tiles built under different rules than the
 * deployed app disagree with the route cards (#601-class drift).
 *
 * Bump this whenever a change to those rules would change a tile property. The
 * app refuses any data release built under a different version and shows no
 * route data until a matching release is published (fail closed). The golden
 * fingerprint test in pipeline/__tests__/releaseGuard.test.ts forces the
 * decision whenever the underlying files change.
 */
export const TILE_RULES_VERSION = 1;

/** Releases published before the stamp existed count as the baseline rules. */
export function releaseTileRulesVersion(release: { tileRulesVersion?: unknown }): number | null {
  if (release.tileRulesVersion === undefined) return 1;
  return typeof release.tileRulesVersion === 'number' ? release.tileRulesVersion : null;
}

/**
 * Tile-rules versions the deployed app accepts from a data release (an
 * unstamped release counts as 1). Normally this is just TILE_RULES_VERSION,
 * but during the v1 -> v2 rollout (#665) the app must keep drawing the live
 * v1 release until the v2 release is published, so it accepts both. Kept as
 * literals on purpose: deriving it from TILE_RULES_VERSION would silently
 * drop v1 the moment the constant is bumped. Anything else still fails closed.
 *
 * TODO(#703): Drop tile-rules v1 support after the v2 release is live.
 * https://github.com/Civic-Minds/Atlas/issues/703
 */
export const ACCEPTED_TILE_RULES_VERSIONS: readonly number[] = [1, 2];

export function isAcceptedTileRulesVersion(release: { tileRulesVersion?: unknown }): boolean {
  const version = releaseTileRulesVersion(release);
  return version !== null && ACCEPTED_TILE_RULES_VERSIONS.includes(version);
}
