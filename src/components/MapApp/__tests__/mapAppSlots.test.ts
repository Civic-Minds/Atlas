import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CIV-1821 (Ryan: "why the fuck are we doing things differently here"): the map apps (Studio, the Live tool) place their
 * overlays in the regular map's slots (src/mapOverlayLayout.ts) with the regular map's components, never a place of
 * their own. A source scan, so a hand-placed key, credit or control fails here before anyone sees it.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const FILES = ['src/components/MapApp/MapAppLayout.tsx', 'src/components/MapApp/MapAppFooter.tsx', 'src/components/MapApp/MapAppMap.tsx', 'src/StudioPage.tsx', 'src/LiveToolPage.tsx'];

describe('map apps use the regular map\'s overlay slots (CIV-1821)', () => {
  it('puts the footer, credit, controls, key and sidebar in the shared slots and components', () => {
    expect(read('src/components/MapApp/MapAppFooter.tsx')).toMatch(/MAP_FOOTER_ROW_SLOT[\s\S]*<MapAttribution \/>/);
    expect(read('src/components/MapApp/MapAppFooter.tsx')).toContain('MAP_NOTICE_SLOT');
    expect(read('src/components/MapApp/MapAppMap.tsx')).toContain('MAP_CONTROLS_SLOT');
    expect(read('src/components/MapApp/MapAppLayout.tsx')).toContain('MAP_APP_SIDEBAR_SLOT');
    for (const page of ['src/StudioPage.tsx', 'src/LiveToolPage.tsx']) expect([page, read(page).includes('<MapLegendCard')]).toEqual([page, true]);
    expect(read('src/components/ui/MapLegendCard.tsx')).toContain('MAP_LEGEND_SLOT');
  });

  it('places nothing over the map by hand: no edge offsets outside the slot table', () => {
    // Menus open under their pill (top-full, left-0 / right-0), which is not a map placement.
    const offsets = FILES.flatMap(f => read(f).split('\n').map((line, i) => [f, i + 1, line] as const))
      .filter(([, , line]) => /\b(top|bottom|left|right)-(\d|\[)/.test(line) && !/\/\/|^\s*\*/.test(line.trim().slice(0, 2)))
      .map(([f, n, line]) => `${f}:${n}: ${line.trim()}`);
    expect(offsets).toEqual([]);
  });
});
