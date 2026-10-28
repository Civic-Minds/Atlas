import { describe, expect, it } from 'vitest';
import { planRollback, rollbackFileKeys, RELEASE_POINTER_KEY } from '../releaseRollback';
import { ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../../shared/artifactSchema';
import type { ReleaseManifest } from '../releaseGuard';

const manifest = (id: string, generatedAt: string, extra: Partial<ReleaseManifest> = {}): ReleaseManifest => ({
  releaseId: id,
  generatedAt,
  routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  tileRulesVersion: TILE_RULES_VERSION,
  pmtilesKey: `atlas/releases/${id}/atlas.pmtiles`,
  overviewPmtilesKey: `atlas/releases/${id}/atlas-overview.pmtiles`,
  agencyPrefix: `atlas/releases/${id}/agencies`,
  ...extra,
});
const older = manifest('release-old1', '2026-10-20T10:00:00Z');
const live = manifest('release-new2', '2026-10-26T12:00:00Z');
const allThere = (m: ReleaseManifest) => rollbackFileKeys(m, ['ttc', 'grt']).map(key => ({ key, exists: true }));
const evidence = (over: Partial<Parameters<typeof planRollback>[0]> = {}) => ({
  target: older, targetSource: 'atlas/releases/release-old1/manifest.json', current: live,
  files: allThere(older), historyIds: ['release-old1', 'release-new2'], ...over,
});

describe('planRollback (CIV-521)', () => {
  it('plans one pointer write of the target manifest when everything checks out', () => {
    const plan = planRollback(evidence());
    expect(plan.errors).toEqual([]);
    expect(plan.writes).toEqual([{ key: RELEASE_POINTER_KEY, body: JSON.stringify(older, null, 2) }]);
    expect(plan.summary).toContain('from release-new2 to release-old1');
  });

  it('checks the manifest, both tile archives and every agency file of the target', () => {
    expect(rollbackFileKeys(older, ['ttc'])).toEqual([
      'atlas/releases/release-old1/manifest.json',
      'atlas/releases/release-old1/atlas.pmtiles',
      'atlas/releases/release-old1/atlas-overview.pmtiles',
      'atlas/releases/release-old1/agencies/ttc.json',
    ]);
  });

  it('refuses when a target file is gone (pruned), and writes nothing', () => {
    const files = allThere(older).map(f => (f.key.endsWith('ttc.json') ? { ...f, exists: false } : f));
    const plan = planRollback(evidence({ files }));
    expect(plan.errors.join(' ')).toContain('agencies/ttc.json');
    expect(plan.writes).toEqual([]);
  });

  it('refuses a target built under other tile rules or route schema than this code', () => {
    expect(planRollback(evidence({ target: { ...older, tileRulesVersion: TILE_RULES_VERSION - 1 } })).errors.join(' ')).toContain('tile rules');
    expect(planRollback(evidence({ target: { ...older, routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION - 1 } })).errors.join(' ')).toContain('route schema');
  });

  it('refuses the release that is already public, and a newer one', () => {
    expect(planRollback(evidence({ target: live, files: allThere(live) })).errors.join(' ')).toContain('already the public release');
    expect(planRollback(evidence({ target: live, current: older, files: allThere(live) })).errors.join(' ')).toContain('newer than the public');
  });

  it('refuses a missing or malformed target', () => {
    expect(planRollback(evidence({ target: null, files: [] })).errors.length).toBeGreaterThan(0);
    expect(planRollback(evidence({ target: { ...older, agencyPrefix: 'atlas' } })).errors.join(' ')).toContain('do not all point');
  });

  it('warns, without refusing, when the target was never published or the pointer is unreadable', () => {
    const plan = planRollback(evidence({ historyIds: ['release-new2'], current: null }));
    expect(plan.errors).toEqual([]);
    expect(plan.warnings.length).toBe(2);
  });
});
