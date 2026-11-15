import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #1520: fonts came from fonts.googleapis.com, so every page load sent the visitor's address to Google.
const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('fonts are served from this site (#1520)', () => {
  it('no page loads anything from Google Fonts', () => {
    for (const page of ['index.html', 'public/404.html']) expect(read(page)).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(read('src/styles/index.css')).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it("Inter's @font-face points at files that exist, with their licence", () => {
    const css = read('src/styles/index.css');
    const files = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(m => m[1]);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) expect(existsSync(resolve(root, 'public/fonts', file))).toBe(true);
    expect(existsSync(resolve(root, 'public/fonts/Inter-OFL.txt'))).toBe(true);
    expect(css).toMatch(/font-family: 'Inter';/);
  });
});
