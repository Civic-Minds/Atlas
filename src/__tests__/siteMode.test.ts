import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { siteModeLabel, BETA_TAG, HEADER_TAG_INTERNAL } from '../../shared/siteMode';
import { seoTitlePrefix } from '../../shared/seo';

// CIV-1692: the wordmark's tag says which Atlas this is; the public site has none.
describe('siteModeLabel', () => {
  it('reads Beta on beta, Internal locally, and nothing on public or preview', () => {
    expect(siteModeLabel('beta')).toBe(BETA_TAG);
    expect(siteModeLabel('dev')).toBe(HEADER_TAG_INTERNAL);
    expect(siteModeLabel('public')).toBeNull();
    expect(siteModeLabel('preview')).toBeNull();
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
    expect(brand).toMatch(/MODE_TAG && <ModeTag word=\{MODE_TAG\} \/>/);
    // CIV-1872: the tag keeps the same muted look; on Internal it also opens /internal.
    const tag = readFileSync(resolve(__dirname, '../components/ModeTag.tsx'), 'utf8');
    expect(tag).toMatch(/const TAG_CLASS = 'font-medium text-\[var\(--text-muted\)\]'/);
    expect(brand).toMatch(/MODE_TAG \? 'items-end text-right' : 'items-start text-left'/);
    expect(brand).not.toMatch(/TAG_VARIANT|tag=/);
  });

  // Ryan, 2026-11-16 (#1573): the tab said [Beta] on the local site while the header said Internal.
  it('gives the tab title the same word as the header', () => {
    expect(seoTitlePrefix('dev')).toBe('[Internal] ');
    expect(seoTitlePrefix('beta')).toBe('[Beta] ');
    expect(seoTitlePrefix('public')).toBe('');
    expect(seoTitlePrefix('preview')).toBe('[Preview] ');
    for (const mode of ['beta', 'dev', 'public'] as const) {
      const word = siteModeLabel(mode);
      expect(seoTitlePrefix(mode)).toBe(word ? `[${word}] ` : '');
    }
  });

  // No file works out the mode word itself: the words live only in shared/siteMode.ts.
  it('keeps the mode words out of every other source file', () => {
    const roots = [resolve(__dirname, '..'), resolve(__dirname, '../../shared'), resolve(__dirname, '../../api')];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = resolve(d, n);
        if (statSync(f).isDirectory()) { if (n !== 'node_modules') walk(f); } else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(f);
      }
    };
    roots.forEach(r => { try { walk(r); } catch { /* no such folder */ } });
    const offenders = files.filter(f => !/shared\/siteMode\.ts$|shared\/pageNames\.ts$/.test(f)
      && /\[(Beta|Internal)\]|['"`](Beta|Internal)['"`]|mode === 'dev' \? ['"`]/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')));
    expect(offenders).toEqual([]);
  });
});
