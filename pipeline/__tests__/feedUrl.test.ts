import { describe, expect, it, vi } from 'vitest';
import { resolveFeedUrl } from '../feedUrl.js';

describe('resolveFeedUrl', () => {
  it('adds a configured API key at runtime', () => {
    vi.stubEnv('TEST_FEED_KEY', 'secret-value');
    expect(resolveFeedUrl(
      'https://api.example.test/feed?operator_id=UC',
      'TEST_FEED_KEY',
      'api_key',
    )).toBe('https://api.example.test/feed?operator_id=UC&api_key=secret-value');
  });

  it('does not alter public URLs', () => {
    expect(resolveFeedUrl('https://example.test/feed.zip')).toBe('https://example.test/feed.zip');
  });

  it('fails clearly when a required key is missing', () => {
    vi.stubEnv('MISSING_FEED_KEY', undefined);
    expect(() => resolveFeedUrl('https://example.test/feed', 'MISSING_FEED_KEY')).toThrow(
      'Missing MISSING_FEED_KEY for feed URL',
    );
  });
});
