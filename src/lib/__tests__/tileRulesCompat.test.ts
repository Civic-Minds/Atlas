import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_TILE_RULES_VERSIONS,
  isAcceptedTileRulesVersion,
  ROUTE_ARTIFACT_SCHEMA_VERSION,
  TILE_RULES_VERSION,
} from '../../../shared/artifactSchema';
import { isCompatibleDataRelease } from '../dataRelease';

// Temporary v1 + v2 acceptance during the #665 rollout. Drop v1 in #703.
describe('accepted tile-rules versions', () => {
  const release = {
    releaseId: 'release-test',
    pmtilesKey: 'atlas/releases/release-test/atlas.pmtiles',
    overviewPmtilesKey: 'atlas/releases/release-test/atlas-overview.pmtiles',
    agencyPrefix: 'atlas/releases/release-test/agencies',
    routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  };

  const accepted: Array<[string, unknown]> = [
    ['version 1', 1],
    ['version 2', 2],
    ['no stamp (counts as 1)', undefined],
  ];
  const rejected: Array<[string, unknown]> = [
    ['version 0', 0],
    ['version 3', 3],
    ['a string', '2'],
    ['garbage text', 'garbage'],
    ['null', null],
    ['NaN', Number.NaN],
    ['a fraction', 1.5],
    ['an object', { version: 2 }],
  ];

  it('always includes the version this code builds tiles with', () => {
    expect(ACCEPTED_TILE_RULES_VERSIONS).toContain(TILE_RULES_VERSION);
  });

  it('accepts exactly versions 1 and 2', () => {
    expect([...ACCEPTED_TILE_RULES_VERSIONS].sort()).toEqual([1, 2]);
  });

  it.each(accepted)('accepts %s', (_label, tileRulesVersion) => {
    const stamp = tileRulesVersion === undefined ? {} : { tileRulesVersion };
    expect(isAcceptedTileRulesVersion(stamp)).toBe(true);
    expect(isCompatibleDataRelease({ ...release, ...stamp } as never)).toBe(true);
  });

  it.each(rejected)('rejects %s', (_label, tileRulesVersion) => {
    expect(isAcceptedTileRulesVersion({ tileRulesVersion })).toBe(false);
    expect(isCompatibleDataRelease({ ...release, tileRulesVersion } as never)).toBe(false);
  });
});
