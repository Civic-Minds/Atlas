import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1917 (3rd report; #1792 before it): every left map card lines up with the search bar on both edges. Its left edge and
 * width come from one place: SIDEBAR_LEFT_EDGE and sidebarFrameStyle(left, searchBarWidth) in styles.ts, measured from
 * the search bar (useSidebarAnchor). A card that writes its own left offset or width drifts from the bar again.
 */
const SRC = join(__dirname, '../..');
// The shared layout sources themselves.
const ALLOWED = new Set(['styles.ts', 'mapOverlayLayout.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const files = sourceFiles(SRC).map(path => ({ rel: relative(SRC, path), text: readFileSync(path, 'utf8') }));

describe('left map cards take the search bar\'s edges from one source (#1917)', () => {
  it('no card writes its own left offset from --sidebar-left', () => {
    const own = files.filter(f => !ALLOWED.has(f.rel) && f.text.includes('var(--sidebar-left')).map(f => f.rel);
    expect(own).toEqual([]);
  });

  it('there is no wide sidebar card width', () => {
    const wide = files.filter(f => /SIDEBAR_PANEL_WIDE_WIDTH|<Panel\b[^>]*\bwide\b/.test(f.text)).map(f => f.rel);
    expect(wide).toEqual([]);
  });

  it('every sidebar card placement passes the search bar\'s width', () => {
    // sidebarFrameStyle(left) alone leaves the card at a class width; the map key (MapLegendCard) is not a card under the bar.
    const leftOnly = files
      .filter(f => f.rel !== 'styles.ts' && !f.rel.endsWith('MapLegendCard.tsx'))
      .flatMap(f => [...f.text.matchAll(/sidebarFrameStyle\(([^()]*)\)/g)].filter(m => !m[1].includes(',')).map(() => f.rel));
    expect(leftOnly).toEqual([]);
  });

  it('the sidebar provider gives Studio the search bar\'s width too', () => {
    const app = files.find(f => f.rel === 'App.tsx')!.text;
    const provider = app.match(/<SidebarFrameProvider[^>]*>/)?.[0] ?? '';
    expect(provider).toContain('searchBarWidth={isPhone ? undefined : searchBarWidth}');
  });

  it('the search bar and the cards share one minimum, so no window width squeezes the bar narrower than its card', () => {
    // Measured 700–1600 px: without this, Studio's busy top bar squeezed the bar to 87 px over a 252 px card at 800 px.
    const app = files.find(f => f.rel === 'App.tsx')!.text;
    const styles = files.find(f => f.rel === 'styles.ts')!.text;
    expect(app).toMatch(/ref=\{searchBarRef\}[^>]*minWidth: SEARCH_BAR_MIN_WIDTH/);
    expect(styles).toContain('SIDEBAR_CARD_MIN_WIDTH = `min(${SEARCH_BAR_MIN_WIDTH},');
    // The boxes holding the bar keep its width; the pills to its right wrap instead of sliding over it.
    expect(app.match(/TOP_BAR_KEEP_WIDTH\}/g)?.length).toBe(3);
    expect(app).toContain('<div ref={headerPortalRef} className="flex items-center gap-2 min-w-0 sm:flex-wrap sm:justify-end');
    expect(files.find(f => f.rel.endsWith('StudioChips.tsx'))!.text).toContain('min-w-0 flex-wrap justify-end');
  });
});
