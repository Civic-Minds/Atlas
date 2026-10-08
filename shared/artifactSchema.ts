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
