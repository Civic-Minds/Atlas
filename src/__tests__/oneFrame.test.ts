import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One frame for every map view (CIV-1828; Ryan, 2026-11-17: "I am getting increasingly annoyed at the fact this seems to
 * be consistently different from the main app"). Studio is a view of the main map, as History is: App draws the one top
 * bar, and Studio's files build on the main map's components, never the separate map-app frame. A source scan, so a
 * second top bar or a second Studio route fails here before anyone sees it. The clause deleting components/MapApp
 * outright joins in step 3, once the Live tool page has moved onto the main map (step 2).
 */
const ROOT = join(import.meta.dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const sourceFiles = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
  return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
});
const SRC = sourceFiles('src');

describe('one frame for every map view (CIV-1828)', () => {
  it('draws the top bar only in App', () => {
    // styles.ts and mapOverlayLayout.ts define and list the slot; only App may place it.
    const placing = SRC.filter(f => !['src/App.tsx', 'src/styles.ts', 'src/mapOverlayLayout.ts'].includes(f))
      .filter(f => /MAP_TOP_BAR_SLOT|data-map-overlay="top-bar"/.test(read(f)));
    expect(placing).toEqual([]);
    expect(read('src/App.tsx')).toMatch(/MAP_TOP_BAR_SLOT[\s\S]*data-map-overlay="top-bar"/);
  });

  it('builds Studio on the main map\'s components: no map-app frame, no hand-made chips', () => {
    const studio = sourceFiles('src/apps/studio');
    expect(studio.length).toBeGreaterThan(0);
    const offending = studio.filter(f => /components\/MapApp|from '\.\.\/MapApp|topBarChipClass/.test(read(f))).map(f => relative(ROOT, join(ROOT, f)));
    expect(offending).toEqual([]);
  });

  it('opens /studio inside App, never as a page of its own', () => {
    const main = read('src/main.tsx');
    // Its earlier addresses may redirect to it; nothing else names its path in a route.
    const routes = main.split('\n').filter(l => /<Route\b/.test(l) && /FEATURE_ROUTES\.studio\b|['"]\/studio['"]/.test(l));
    expect(routes.filter(l => !/element=\{<Navigate to=\{FEATURE_ROUTES\.studio\}/.test(l))).toEqual([]);
    expect(main).not.toMatch(/StudioPage|apps\/studio/);
    expect(read('src/App.tsx')).toMatch(/\[FEATURE_ROUTES\.studio\]: 'studio'/);
  });
});
