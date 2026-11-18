import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CIV-1775, CIV-1814 item 29: no bracketed placeholder text in a public, preview or beta build. Placeholder text is a
// stand-in for wording Ryan has not given yet. Every placeholder goes through shared/devPlaceholder.ts (drawn as an
// element by src/content/devPlaceholder.tsx), which shows it only on the Vite dev server; that file is the only one allowed to hold the markers. Tests are not scanned;
// comments are, so a comment that quotes a marker needs rewording.
const ROOT = resolve(__dirname, '../../..');
const SCANNED = ['src', 'shared'];
const HELPER = 'shared/devPlaceholder.ts';
const MARKERS = [/\[Placeholder/, /\[Ryan[’']s wording/i];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const hasMarker = (text: string) => MARKERS.some(marker => marker.test(text));

const hits = SCANNED.flatMap(dir => files(join(ROOT, dir))).filter(path => hasMarker(readFileSync(path, 'utf8')))
  .map(path => relative(ROOT, path));

describe('placeholder text guard (CIV-1775, CIV-1814 item 29)', () => {
  it('finds bracketed placeholder text only in the dev-only helper', () => {
    const outside = hits.filter(file => file !== HELPER);
    expect(outside, `Bracketed placeholder text outside ${HELPER}: ${outside.join(', ')}. Give it real wording, or use devPlaceholder()/<DevPlaceholder> from that file.`).toEqual([]);
  });

  it('the helper shows placeholders only on the dev server', () => {
    const helper = readFileSync(join(ROOT, HELPER), 'utf8');
    const flag = helper.match(/^export const SHOW_PLACEHOLDERS\s*=\s*(.+);$/m)?.[1];
    expect(flag, `SHOW_PLACEHOLDERS was not found in ${HELPER}`).toBeDefined();
    expect(flag).toMatch(/^import\.meta\.env\??\.DEV === true$/);
  });

  it('catches both markers', () => {
    expect(hasMarker('[Placeholder: heading]')).toBe(true);
    expect(hasMarker('[Ryan’s wording: intro]')).toBe(true);
    expect(hasMarker("[Ryan's wording: intro]")).toBe(true);
    expect(hasMarker('Every 15 min')).toBe(false);
  });
});
