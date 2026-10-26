import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CIV-984: route lists show the label from route facts (`facts.label`), never a label built from `shortName`, which is
 * the route's identity and is the route ID when the feed has none (#1099). Every other place in the list code that still
 * builds a label is listed here with why; a new one fails this test until it is checked and added.
 */
const ALLOWED_LABEL_CALLS: Record<string, { count: number; why: string }> = {
  'src/utils/routeFacts.ts': { count: 1, why: 'builds facts.label, the one label every row carries' },
  'src/utils/mapContext.ts': { count: 1, why: 'the map-context list label, from the feed names (labelShortNameOf)' },
  'src/components/Interval/SidebarControls.tsx': { count: 4, why: 'suggestions after combining long names (labelShortNameOf); the chooser fallback row for a route with no feature; the chooser dedupe key (identity-based on purpose, two calls)' },
  'src/components/Interval/SearchSuggestionsPanel.tsx': { count: 1, why: 'a recent saved by an older build has no label' },
  'src/components/Interval/panels/RouteCardHeadway.tsx': { count: 1, why: 'title fallback when the route card data has no label (the map always sets it)' },
  'src/components/Interval/FilterPanel.tsx': { count: 1, why: 'raw feed names from the layer, no ID fallback' },
  'src/components/Interval/MapCanvas.tsx': { count: 1, why: 'raw tile names, no ID fallback' },
};
const LIST_FILES = [
  ...Object.keys(ALLOWED_LABEL_CALLS),
  'src/utils/searchResults.ts', 'src/components/Interval/AgencyCard.tsx', 'src/components/Interval/SearchResultsList.tsx',
  'src/components/Interval/MapContextPanel.tsx', 'src/components/Interval/panels/StopCard.tsx', 'src/components/Interval/panels/StopRouteGroup.tsx',
  'src/components/Interval/panels/DisambiguationPanel.tsx',
];
const read = (f: string) => readFileSync(resolve(__dirname, '../../..', f), 'utf8');

describe('route lists take their label from route facts (CIV-984)', () => {
  for (const file of LIST_FILES) {
    it(file, () => {
      const src = read(file);
      const calls = (src.match(/\brouteLabels\(\{|\brouteRowLabels\(\{/g) ?? []).length;
      expect(calls, ALLOWED_LABEL_CALLS[file]?.why ?? 'rows should use route facts\' label').toBe(ALLOWED_LABEL_CALLS[file]?.count ?? 0);
      // The old second short name for labels is gone from every row type (a legacy recent may still carry it).
      const stray = src.split('\n').filter(l => /\b(route)?[lL]abelShortName\??:/.test(l));
      // SidebarControls' suggestions builder keeps one internally, to label a group once its long names are combined.
      // The suggestions panel reads it from a recent saved by an older build.
      const internal = (l: string) => (file.endsWith('SidebarControls.tsx') && (l.includes('labelShortName: string; agencySlug') || l.includes("labelShortName: slug === 'bart'")))
        || (file.endsWith('SearchSuggestionsPanel.tsx') && l.includes('RecentRoute & { labelShortName?: string }'));
      expect(stray.filter(l => !internal(l))).toEqual([]);
    });
  }
});
