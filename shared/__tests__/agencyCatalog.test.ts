import { describe, expect, it } from 'vitest';
import { buildAgencyCatalog } from '../agencyCatalog';

describe('buildAgencyCatalog', () => {
  it('keeps only agencies visible in the requested mode', () => {
    const catalog = buildAgencyCatalog([
      { slug: 'public', name: 'Public', center: [1, 2] },
      { slug: 'beta', name: 'Beta', center: [1, 2], hiddenInProduction: true, betaOnly: true },
      { slug: 'staged', name: 'Staged', center: [1, 2], staged: true },
    ], 'beta');

    expect(catalog).toMatchObject({ mode: 'beta', agencyCount: 2 });
    expect(catalog.agencies.map(a => a.slug)).toEqual(['public', 'beta']);
  });

  it('omits pipeline-only feed source fields', () => {
    const catalog = buildAgencyCatalog([
      { slug: 'ttc', name: 'TTC', center: [1, 2], feedUrl: 'https://private.example/feed.zip', mdbFeedUrl: 'https://private.example/mdb.zip', supplementalFeedUrls: ['https://private.example/extra.zip'] },
    ], 'public');

    expect(catalog.agencies[0]).not.toHaveProperty('feedUrl');
    expect(catalog.agencies[0]).not.toHaveProperty('mdbFeedUrl');
    expect(catalog.agencies[0]).not.toHaveProperty('supplementalFeedUrls');
  });
});
