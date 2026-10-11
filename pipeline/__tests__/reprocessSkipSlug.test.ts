import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SKIP_SLUG_REASON,
  isReprocessTarget,
  parseSkipSlugs,
  partitionSkippedSlugs,
  skipSlugArgErrors,
} from '../archiveSelection.js';
import { applyOverrides, blockReason, evaluateRun, parseGateOverrides, summarizeArtifact } from '../releaseDiff.js';

const fixture = (name: string) => readFileSync(resolve('pipeline/__tests__/fixtures/release-diff', name), 'utf8');

describe('reprocess --skip-slug arguments', () => {
  it('collects repeated slugs in both forms and ignores other flags', () => {
    const argv = ['--allow', 'stl:drop', '--skip-slug', 'uga', '--skip-slug=clemson-cat', '--only-slug', 'ttc', '--skip-slug', 'winter-park', '--skip-slug', 'uga'];
    expect(parseSkipSlugs(argv)).toEqual({ slugs: ['uga', 'clemson-cat', 'winter-park'], errors: [] });
    expect(parseGateOverrides(argv).allow).toEqual(['stl:drop']);
  });

  it('errors on a missing value without swallowing the next flag', () => {
    expect(parseSkipSlugs(['--skip-slug']).errors).toEqual(['--skip-slug expects an agency slug, got ""']);
    const parsed = parseSkipSlugs(['--skip-slug', '--skip-slug', 'uga']);
    expect(parsed.slugs).toEqual(['uga']);
    expect(parsed.errors).toHaveLength(1);
  });

  it('errors on an unknown slug and on a slug named by both --only-slug and --skip-slug', () => {
    const known = ['uga', 'clemson-cat', 'ttc'];
    expect(skipSlugArgErrors(['uga', 'clemson-cat'], [], known)).toEqual([]);
    expect(skipSlugArgErrors(['ugaa'], [], known)).toEqual(['--skip-slug ugaa: unknown agency']);
    expect(skipSlugArgErrors(['uga'], ['uga', 'ttc'], known)).toEqual(['uga is named by both --only-slug and --skip-slug']);
  });
});

describe('reprocess --skip-slug carries the agency over unchanged', () => {
  const registry = [
    { slug: 'barrie', center: [44.3894, -79.6903], lastFeedExpiry: '20261226' },
    { slug: 'barrie-twin', center: [44.39, -79.69], lastFeedExpiry: '20261226' },
    { slug: 'uga', center: [33.95, -83.37], lastFeedExpiry: '20261231' },
  ];

  it('is a skipped report row, never a reprocess target', () => {
    const { kept, skipped } = partitionSkippedSlugs(registry, ['uga']);
    expect(kept.map(a => a.slug)).toEqual(['barrie', 'barrie-twin']);
    expect(skipped).toEqual([{ slug: 'uga', status: 'skipped', reason: SKIP_SLUG_REASON }]);
    expect(isReprocessTarget(registry[2])).toBe(true);
    expect(partitionSkippedSlugs(registry, []).kept).toHaveLength(3);
  });

  it('is not a gate candidate, so it raises no drop flag and its live data is what peers see', async () => {
    const live = summarizeArtifact(fixture('barrie-live.json'), fixture('barrie-live-stops.json'));
    const next = summarizeArtifact(fixture('barrie-new.json'), fixture('barrie-new-stops.json'));
    const twinLive = summarizeArtifact(fixture('slorta.json'), null);
    const { kept } = partitionSkippedSlugs(registry, ['barrie-twin']);
    const asked: string[] = [];
    const flags = await evaluateRun({
      candidates: kept.filter(a => a.slug === 'barrie').map(a => ({ slug: a.slug, next, service: { start: '20260920', end: '20261226' } })),
      getLive: async slug => { asked.push(slug); return slug === 'barrie' ? live : slug === 'barrie-twin' ? twinLive : null; },
      registry,
      todayYmd: '20261010',
      allowMissingLive: false,
    });
    expect(flags.filter(f => f.slug === 'barrie-twin')).toEqual([]);
    expect(blockReason('barrie-twin', applyOverrides(flags, { allowDrop: false, allow: [] }))).toBeNull();
    // Read as a live peer (unchanged), not treated as missing or emptied.
    expect(asked).toContain('barrie-twin');
  });
});
