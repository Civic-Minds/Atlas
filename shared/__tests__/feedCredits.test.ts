import { describe, expect, it } from 'vitest';
import { feedCreditFor, FEED_CREDITS } from '../feedCredits';
import { buildAgencyCatalog } from '../agencyCatalog';

describe('feed credits (#1692)', () => {
  it('a 511 API feed needs the 511 credit; other feeds need none', () => {
    expect(feedCreditFor('https://api.511.org/transit/datafeeds?operator_id=SM')).toBe('511');
    expect(feedCreditFor('http://api.511.org/transit/datafeeds?operator_id=CE')).toBe('511');
    expect(feedCreditFor('https://511.org.example.com/x.zip')).toBeUndefined();
    expect(feedCreditFor('not a url')).toBeUndefined();
    expect(feedCreditFor(undefined)).toBeUndefined();
    expect(FEED_CREDITS['511'].label).toBe('Powered by 511.org');
  });

  it('the catalog carries the credit key but never the feed URL', () => {
    const { agencies } = buildAgencyCatalog([
      { slug: 'samtrans', name: 'SamTrans', center: [37.5, -122.3], feedUrl: 'https://api.511.org/transit/datafeeds?operator_id=SM' },
      { slug: 'ttc', name: 'TTC', center: [43.7, -79.4], feedUrl: 'https://example.org/ttc.zip' },
    ], 'public');
    expect(agencies.map(a => [a.slug, a.feedCredit])).toEqual([['samtrans', '511'], ['ttc', undefined]]);
    expect(agencies.some(a => 'feedUrl' in a)).toBe(false);
  });
});
