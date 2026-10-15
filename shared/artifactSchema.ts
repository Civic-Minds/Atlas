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
export const TILE_RULES_VERSION = 3;

/** Releases published before the stamp existed count as the baseline rules. */
export function releaseTileRulesVersion(release: { tileRulesVersion?: unknown }): number | null {
  if (release.tileRulesVersion === undefined) return 1;
  return typeof release.tileRulesVersion === 'number' ? release.tileRulesVersion : null;
}

/**
 * Tile-rules versions the deployed app accepts from a data release (an
 * unstamped release counts as 1, so it is rejected). Normally this is just
 * TILE_RULES_VERSION. During a rollout, list the outgoing version too so the
 * app keeps drawing the live release until the new one is published, then drop
 * it. Kept as literals on purpose: deriving it from TILE_RULES_VERSION would
 * silently drop the outgoing version the moment the constant is bumped.
 * Anything else fails closed.
 */
// #720 rollout: 4 is accepted ahead of the TILE_RULES_VERSION bump, so the deployed app keeps
// drawing the live version-3 release and then draws the first version-4 release. Drop 3 after
// that release is live.
export const ACCEPTED_TILE_RULES_VERSIONS: readonly number[] = [3, 4];

export function isAcceptedTileRulesVersion(release: { tileRulesVersion?: unknown }): boolean {
  const version = releaseTileRulesVersion(release);
  return version !== null && ACCEPTED_TILE_RULES_VERSIONS.includes(version);
}
