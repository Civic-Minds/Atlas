import { describe, expect, it } from 'vitest';
import { assertRouteArtifactSchema, routeArtifactSchemaError, ROUTE_ARTIFACT_SCHEMA_VERSION } from '../artifactSchema';

describe('route artifact schema', () => {
  it('accepts the current schema version', () => {
    expect(routeArtifactSchemaError({ atlasSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION }, 'ttc.json')).toBeNull();
    expect(() => assertRouteArtifactSchema({ atlasSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION }, 'ttc.json')).not.toThrow();
  });

  it('rejects legacy artifacts before PMTiles packaging', () => {
    expect(routeArtifactSchemaError({ features: [] }, 'sacrt.json')).toContain('schema missing');
    expect(() => assertRouteArtifactSchema({ atlasSchemaVersion: 1 }, 'sacrt.json')).toThrow(/expected 2/);
  });
});
