import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CIV-984: route lists show the label from route facts (`facts.label`), never a label built from `shortName`, which is
 * the route's identity and is the route ID when the feed has none (#1099). Every other place in the list code that still
 * builds a label is listed here with why; a new one fails this test until it is checked and added.
 */
const ALLOWED_LABEL_CALLS: Record<string, { count: number; why: string }> = {
  'src/utils/routeFacts.ts': { count: 1, why: 'builds facts.label, the one label every route row carries' },
  'src/utils/mapContext.ts': { count: 1, why: 'the map-context list label, from the feed names (labelShortNameOf)' },
  'src/components/Interval/SidebarControls.tsx': { count: 3, why: 'suggestions after combining long names (labelShortNameOf); the chooser dedupe key (identity-based on purpose, two calls)' },
  'src/utils/chooserRoutes.ts': { count: 1, why: 'the chooser fallback row for a route with no loaded feature: labels the route ID, never the whole key' },
  'src/components/Interval/SearchSuggestionsPanel.tsx': { count: 1, why: 'a recent saved by an older build has no label' },
  'src/components/Interval/panels/RouteCardHeadway.tsx': { count: 1, why: 'title fallback when the route card data has no label (the map always sets it)' },
  'src/components/RouteCardTitle.tsx': { count: 1, why: 'title fallback when no label is passed (History, Live)' },
  'src/components/Interval/FilterPanel.tsx': { count: 1, why: 'raw feed names from the layer, no ID fallback' },
  'src/components/Interval/MapCanvas.tsx': { count: 1, why: 'raw tile names, no ID fallback' },
  'src/hooks/useNearbyRoutes.ts': { count: 1, why: 'raw feed names (Near You), no ID fallback' },
  'src/utils/stopBack.ts': { count: 1, why: 'raw feed names for the stop card back link' },
  'src/apps/NightService.tsx': { count: 1, why: 'raw feed names from the night data' },
  'src/apps/History.tsx': { count: 2, why: 'History route names, and the chart window title (CIV-1128)' },
  'src/pageParts.tsx': { count: 3, why: 'agency pages (RouteNameCell), from the page data; one more for summaries that store the feed short name (CIV-984 3B)' },
  'src/components/Live/RoutePicker.tsx': { count: 1, why: 'Live route names' },
  'src/components/Live/tool/OverviewList.tsx': { count: 1, why: 'Live route list' },
};
const SRC = resolve(__dirname, '../..');
const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
  return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
});
const rel = (p: string) => relative(resolve(SRC, '..'), p);

describe('route labels come from route facts (CIV-984)', () => {
  it('every place in src that builds a route label is listed, with its reason', () => {
    const found: Record<string, number> = {};
    for (const file of sourceFiles(SRC)) {
      const calls = (readFileSync(file, 'utf8').match(/\brouteLabels\(\{|\brouteRowLabels\(\{/g) ?? []).length;
      if (calls) found[rel(file)] = calls;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED_LABEL_CALLS).map(([f, v]) => [f, v.count])));
  });
  it('no route row type keeps a second short name for its label', () => {
    for (const file of sourceFiles(SRC)) {
      const stray = readFileSync(file, 'utf8').split('\n').filter(l => /\b(route)?[lL]abelShortName\??:/.test(l));
      // SidebarControls' suggestions builder keeps one internally, to label a group once its long names are combined;
      // the suggestions panel reads it from a recent saved by an older build.
      const internal = (l: string) => (file.endsWith('SidebarControls.tsx') && (l.includes('labelShortName: string; agencySlug') || l.includes("labelShortName: slug === 'bart'")))
        || (file.endsWith('SearchSuggestionsPanel.tsx') && l.includes('RecentRoute & { labelShortName?: string }'));
      expect(stray.filter(l => !internal(l)), rel(file)).toEqual([]);
    }
  });
});
