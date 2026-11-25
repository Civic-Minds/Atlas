import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { networksFailedHint, networksFailedText } from '../../content/noticeCopy';

// CIV-2947 (Ryan, 2026-11-25: "1"): "1 agency couldn't load" stays short; a tap lists which, in the existing words, in the
// map errors card (no hover title on phones).
const src = readFileSync(resolve(__dirname, '../Interval.tsx'), 'utf8');

describe('failed agencies pill (CIV-2947)', () => {
  it('keeps the short count and lists each agency in the existing words', () => {
    expect(networksFailedText(1)).toBe('1 agency couldn’t load');
    expect(networksFailedHint(['TTC'])).toBe('TTC couldn’t load.');
  });
  it('is a button that opens the shared map errors card with one line per agency', () => {
    expect(src).toMatch(/networksFailedHint\(\[hintNames\.get\(slug\) \?\? slug\]\)/);
    expect(src).toMatch(/onClick=\{\(\) => setListedMapErrors\(listedMapErrors === failedAgencyLines \? null : failedAgencyLines\)\}/);
    expect(src).toMatch(/<MapErrorsPanel/);
  });
});
