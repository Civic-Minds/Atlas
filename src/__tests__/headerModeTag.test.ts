import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerModeTag, BETA_TAG, HEADER_TAG_INTERNAL } from '../content/noticeCopy';

// CIV-1692: the wordmark's tag says which Atlas this is; the public site has none.
describe('headerModeTag', () => {
  it('reads Beta on beta, Internal locally, and nothing on public or preview', () => {
    expect(headerModeTag('beta')).toBe(BETA_TAG);
    expect(headerModeTag('dev')).toBe(HEADER_TAG_INTERNAL);
    expect(headerModeTag('public')).toBeNull();
    expect(headerModeTag('preview')).toBeNull();
  });

  // Ryan, 2026-11-16: "I just wanted plain text not a pill". The tag uses the byline's own text style.
  it('shows as plain text in the byline style, not a Tag pill', () => {
    const brand = readFileSync(resolve(__dirname, '../components/AtlasBrand.tsx'), 'utf8');
    expect(brand).not.toMatch(/import Tag\b/);
    expect(brand).not.toMatch(/<Tag\b/);
    expect(brand).toMatch(/by Civic Minds/);
  });

  // Ryan, 2026-11-16, option 1: the word shares the wordmark's line, muted; with a word the byline is right-aligned under it.
  it('puts the word on the wordmark line and right-aligns the byline when there is one', () => {
    const brand = readFileSync(resolve(__dirname, '../components/AtlasBrand.tsx'), 'utf8');
    expect(brand).toMatch(/MODE_TAG && <span className="font-medium text-\[var\(--text-muted\)\]"> \{MODE_TAG\}<\/span>/);
    expect(brand).toMatch(/MODE_TAG \? 'items-end text-right' : 'items-start text-left'/);
    expect(brand).not.toMatch(/TAG_VARIANT|tag=/);
  });
});
