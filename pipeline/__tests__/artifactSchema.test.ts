import { describe, expect, it } from 'vitest';
import { assertRouteArtifactSchema, ROUTE_ARTIFACT_SCHEMA_VERSION } from '../../shared/artifactSchema';

describe('pipeline route artifact schema gate', () => {
  it('accepts regenerated route artifacts', () => {
    expect(() => assertRouteArtifactSchema({ atlasSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION }, 'test.json')).not.toThrow();
  });

  it('rejects legacy route artifacts before tile packaging', () => {
    expect(() => assertRouteArtifactSchema({ features: [] }, 'legacy.json')).toThrow(/Reprocess the full catalog/);
  });
});
