import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  // Ryan, 2026-11-16: "I just wanted plain text not a pill". The tag uses the byline's own text style.
  it('shows as plain text in the byline style, not a Tag pill', () => {
    const brand = readFileSync(resolve(__dirname, '../components/AtlasBrand.tsx'), 'utf8');
    expect(brand).not.toMatch(/import Tag\b/);
    expect(brand).not.toMatch(/<Tag\b/);
    // CIV-1692 v3: ?tag=1..5 picks one of five looks on the dev server while Ryan chooses; the pill stays gone.
    expect(brand).toMatch(/by Civic Minds/);
  });
});
