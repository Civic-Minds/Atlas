import { describe, expect, it } from 'vitest';
import { headerModeTag, HEADER_TAG_BETA, HEADER_TAG_INTERNAL } from '../content/noticeCopy';

// CIV-1692: the wordmark's tag says which Atlas this is; the public site has none.
describe('headerModeTag', () => {
  it('reads Beta on beta, Internal locally, and nothing on public or preview', () => {
    expect(headerModeTag('beta')).toBe(HEADER_TAG_BETA);
    expect(headerModeTag('dev')).toBe(HEADER_TAG_INTERNAL);
    expect(headerModeTag('public')).toBeNull();
    expect(headerModeTag('preview')).toBeNull();
  });
});
