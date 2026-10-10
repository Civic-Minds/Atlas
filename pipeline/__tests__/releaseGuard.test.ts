import { describe, expect, it } from 'vitest';
import { ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../../shared/artifactSchema';
import {
  ALLOW_UNPAIRED_UPLOAD_FLAG,
  releasePublishError,
  tileRulesFingerprint,
  unpairedUploadError,
  type PublishEvidence,
  type ReleaseManifest,
} from '../releaseGuard';

const manifest: ReleaseManifest = {
  releaseId: 'release-b',
  generatedAt: '2026-10-10T12:00:00.000Z',
  routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  tileRulesVersion: TILE_RULES_VERSION,
  codeVersion: 'abc123',
  pmtilesKey: 'atlas/releases/release-b/atlas.pmtiles',
  overviewPmtilesKey: 'atlas/releases/release-b/atlas-overview.pmtiles',
  agencyPrefix: 'atlas/releases/release-b/agencies',
};

function evidence(overrides: Partial<PublishEvidence> = {}): PublishEvidence {
  return {
    local: manifest,
    remote: { ...manifest },
    current: { releaseId: 'release-a', generatedAt: '2026-10-09T05:21:01.950Z' },
    pmtilesName: 'release-b',
    overviewPmtilesName: 'release-b',
    agencyStamps: { ttc: 'release-b', yrt: 'release-b' },
    codeVersion: 'abc123',
    ...overrides,
  };
}

describe('releasePublishError', () => {
  it('allows a release whose tiles and agency data were built together', () => {
    expect(releasePublishError(evidence())).toBeNull();
    expect(releasePublishError(evidence({ current: null }))).toBeNull();
  });

  it('refuses tiles that were not built with this release (stale or rebuilt separately)', () => {
    expect(releasePublishError(evidence({ pmtilesName: 'release-a' }))).toContain('not stamped');
    expect(releasePublishError(evidence({ overviewPmtilesName: undefined }))).toContain('not stamped');
  });

  it('refuses agency data that was not built with these tiles', () => {
    expect(releasePublishError(evidence({ agencyStamps: { ttc: 'release-b', yrt: undefined } }))).toContain('yrt=undefined');
    expect(releasePublishError(evidence({ agencyStamps: { ttc: 'missing' } }))).toContain('ttc=missing');
    expect(releasePublishError(evidence({ agencyStamps: {} }))).toContain('No agency snapshots');
  });

  it('refuses a half-finished upload or a leftover local manifest', () => {
    expect(releasePublishError(evidence({ remote: null }))).toContain('did not finish');
    expect(releasePublishError(evidence({ remote: { ...manifest, generatedAt: '2026-10-10T13:00:00.000Z' } }))).toContain('differs');
  });

  it('refuses tiles built under different tile rules or schema than this code', () => {
    expect(releasePublishError(evidence({ local: { ...manifest, tileRulesVersion: TILE_RULES_VERSION + 1 } }))).toContain('tile rules');
    expect(releasePublishError(evidence({ local: { ...manifest, tileRulesVersion: undefined } }))).toContain('tile rules');
    expect(releasePublishError(evidence({ local: { ...manifest, routeArtifactSchemaVersion: 1 } }))).toContain('route schema');
  });

  it('refuses publishing from different code than built the release', () => {
    expect(releasePublishError(evidence({ codeVersion: 'def456' }))).toContain('built from abc123');
  });

  it('refuses rolling back to an older or equal release', () => {
    expect(releasePublishError(evidence({ current: { releaseId: 'release-c', generatedAt: '2026-10-11T00:00:00.000Z' } }))).toContain('roll back');
    expect(releasePublishError(evidence({ current: { releaseId: 'release-b', generatedAt: manifest.generatedAt } }))).toContain('roll back');
  });

  it('refuses a manifest whose keys point outside its own release folder', () => {
    expect(releasePublishError(evidence({ local: { ...manifest, pmtilesKey: 'atlas.pmtiles' } }))).toContain('keys');
    expect(releasePublishError(evidence({ local: { ...manifest, releaseId: 'local-abc' } }))).toContain('releaseId');
  });
});

describe('unpairedUploadError', () => {
  it('blocks legacy root PMTiles uploads unless explicitly overridden', () => {
    expect(unpairedUploadError(['tmp/atlas.pmtiles'], 'upload-pmtiles')).toContain('outside a verified data release');
    expect(unpairedUploadError(['tmp/atlas.pmtiles', ALLOW_UNPAIRED_UPLOAD_FLAG], 'upload-pmtiles')).toBeNull();
  });
});

describe('tile rules fingerprint', () => {
  // These files decide what build-pmtiles bakes into the map tiles, and the app
  // re-applies them to agency JSON at load. If this hash changes:
  //  - if the change can alter any tile property (for example the
  //    worst-direction rule in #601), bump TILE_RULES_VERSION in
  //    shared/artifactSchema.ts. The deployed app then shows no route data
  //    until a release built with the new rules is published
  //    (npm run refresh-release, or the Refresh GTFS feeds workflow);
  //  - if it cannot (comments, types, refactors), just update the hash here.
  it('changes only together with a deliberate TILE_RULES_VERSION decision', () => {
    expect({ version: TILE_RULES_VERSION, fingerprint: tileRulesFingerprint() }).toEqual({
      version: 1,
      fingerprint: '4548b3f18dea5898657205d6d3c42fc0e0c45f83b5feb44a472c74d9ac24a7c0',
    });
  });
});
