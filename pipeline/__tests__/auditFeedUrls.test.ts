import { describe, expect, it } from 'vitest';
import { classifyFeedUrl, normalizeProviderName } from '../audit-feed-urls.js';

describe('classifyFeedUrl', () => {
  it('flags the retired Google-hosted MDB mirror', () => {
    expect(classifyFeedUrl('https://storage.googleapis.com/storage/v1/b/mdb-latest/o/us-new-york-hocts-gtfs-588.zip?alt=media')).toBe('retired-mirror');
  });
  it('flags dated MDB snapshots but not latest.zip', () => {
    expect(classifyFeedUrl('https://files.mobilitydatabase.org/mdb-280/mdb-280-202610010000/mdb-280-202610010000.zip')).toBe('dated-snapshot');
    expect(classifyFeedUrl('https://files.mobilitydatabase.org/mdb-280/latest.zip')).toBe('mdb-stable');
  });
  it('treats other hosts as direct', () => {
    expect(classifyFeedUrl('https://www.ttc.ca/gtfs.zip')).toBe('direct');
    expect(classifyFeedUrl('not a url')).toBe('direct');
  });
});

describe('normalizeProviderName', () => {
  it('matches names exactly after stripping punctuation, never by substring', () => {
    expect(normalizeProviderName('Toronto Transit Commission')).toBe('torontotransitcommission');
    expect(normalizeProviderName('TTC')).not.toBe(normalizeProviderName('TTC Motorcoach Co.'));
  });
});
