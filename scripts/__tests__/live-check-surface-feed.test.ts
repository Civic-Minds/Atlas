import { describe, expect, it } from 'vitest';
import { KNOWN_FEED, feedChanges } from '../live-check-surface-feed';

describe('surface feed check', () => {
  it('reports nothing when the file looks the same as the stored feed', () => {
    expect(feedChanges({ etag: KNOWN_FEED.etag, lastModified: KNOWN_FEED.lastModified, length: KNOWN_FEED.length })).toEqual([]);
  });
  it('names each header that changed, and treats a missing one as a change', () => {
    const c = feedChanges({ etag: '"new"', lastModified: KNOWN_FEED.lastModified, length: 90000000 });
    expect(c).toHaveLength(2);
    expect(c.join(' ')).toMatch(/ETag "new"/);
    expect(c.join(' ')).toMatch(/size 90000000/);
    expect(feedChanges({ etag: null, lastModified: null, length: null })).toHaveLength(3);
  });
});
