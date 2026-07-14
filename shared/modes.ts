/**
 * Route mode classification — filter chips, map expressions, and display labels.
 */

/** Virtual mode ID for LRT routes that share route_type=0 with streetcars. */
export const VIRTUAL_LRT_MODE = 100;

export interface EffectiveModeInput {
  routeType?: number | string | null;
  routeLongName?: string | null;
  routeShortName?: string | null;
  agencySlug?: string;
}

/** Agency feeds whose route_type=0 entries are rail rather than streetcars. */
export const VIRTUAL_LRT_AGENCIES = ['calgary', 'edmonton', 'rem', 'octranspo'] as const;

const LRT_NAME_RE = /(?:CTrain|Capital Line|Metro Line|Valley Line|Valley Metro Rail|Metro [A-Za-z]+ Line)/i;
const SAN_DIEGO_RAIL_RE = /^(?:Blue|Copper|Green|Orange|Silver)$/i;

/** Coerce GeoJSON / MVT routeType to a GTFS base type (defaults to bus). */
export function normalizeRouteType(routeType: unknown): number {
  if (routeType === undefined || routeType === null || routeType === '') return 3;
  const n = typeof routeType === 'number' ? routeType : parseInt(String(routeType), 10);
  return Number.isFinite(n) ? n : 3;
}

export function isVirtualLrt(p: EffectiveModeInput): boolean {
  const rt = normalizeRouteType(p.routeType);
  const longName = p.routeLongName ?? '';
  const shortName = p.routeShortName ?? '';
  if (rt === 0 && VIRTUAL_LRT_AGENCIES.includes(p.agencySlug as typeof VIRTUAL_LRT_AGENCIES[number])) return true;
  if (rt === 0 && /^Line \d/i.test(longName)) return true;
  if (rt === 0 && LRT_NAME_RE.test(longName)) return true;
  if (rt === 0 && p.agencySlug === 'sdmts' && SAN_DIEGO_RAIL_RE.test(shortName)) return true;
  if (rt === 2 && /\bION\b/i.test(longName)) return true;
  return false;
}

export function effectiveMode(p: EffectiveModeInput): number {
  const rt = normalizeRouteType(p.routeType);
  return isVirtualLrt(p) ? VIRTUAL_LRT_MODE : rt;
}

/** Mode filter chip options (Frequency Map). */
export const FILTER_MODES = [
  { id: 1, label: 'Subway' },
  { id: VIRTUAL_LRT_MODE, label: 'LRT' },
  { id: 0, label: 'Streetcar' },
  { id: 2, label: 'Rail' },
  { id: 3, label: 'Bus' },
  { id: 4, label: 'Ferry' },
] as const;

/** GTFS base route_type → display name (pipeline catalog, agency blurbs). */
export const GTFS_BASE_MODE_LABELS: Record<number, string> = {
  0: 'Tram/Light Rail',
  1: 'Subway/Metro',
  2: 'Commuter Rail',
  3: 'Bus',
  4: 'Ferry',
  5: 'Cable Tram',
  6: 'Gondola',
  7: 'Funicular',
  11: 'Trolleybus',
  12: 'Monorail',
};

/** Rail-like base types for agency card mode summaries. */
export const GTFS_RAIL_MODE_LABELS: Record<number, string> = {
  0: 'streetcar',
  1: 'subway',
  2: 'commuter rail',
  4: 'ferry',
  5: 'cable car',
  6: 'gondola',
  7: 'funicular',
  11: 'trolleybus',
  12: 'monorail',
};

export function getGtfsModeName(routeType: string | number): string {
  const n = typeof routeType === 'number' ? routeType : parseInt(String(routeType));
  if (!Number.isNaN(n) && GTFS_BASE_MODE_LABELS[n] != null) {
    return GTFS_BASE_MODE_LABELS[n];
  }
  if (Number.isNaN(n)) return 'Transit';
  if (n >= 100 && n < 200) return 'Commuter Rail';
  if (n >= 200 && n < 400) return 'Bus';
  if (n >= 400 && n < 600) return 'Tram/Light Rail';
  if (n >= 600 && n < 700) return 'Subway/Metro';
  if (n >= 700 && n < 900) return 'Bus';
  if (n >= 900 && n < 1000) return 'Tram/Light Rail';
  if (n >= 1000 && n < 1200) return 'Ferry';
  if (n >= 1300 && n < 1500) return 'Gondola';
  return 'Transit';
}

/** MapLibre expression: compute effective mode from feature properties. */
export function buildEffectiveModeExpression(): unknown[] {
  const routeType: unknown[] = ['to-number', ['coalesce', ['get', 'routeType'], 3]];
  const longName: unknown[] = ['coalesce', ['get', 'routeLongName'], ''];
  const shortName: unknown[] = ['coalesce', ['get', 'routeShortName'], ''];
  const agency: unknown[] = ['coalesce', ['get', 'agencySlug'], ''];
  return [
    'case',
    ['any',
      ['all', ['==', routeType, 0], ['any', ...VIRTUAL_LRT_AGENCIES.map(slug => ['==', agency, slug])]],
      ['all', ['==', routeType, 0], ['==', ['slice', longName, 0, 5], 'Line ']],
      ['all', ['==', routeType, 0], ['any',
        ['>=', ['index-of', 'CTrain', longName], 0],
        ['>=', ['index-of', 'Capital Line', longName], 0],
        ['>=', ['index-of', 'Metro Line', longName], 0],
        ['>=', ['index-of', 'Valley Line', longName], 0],
        ['>=', ['index-of', 'Valley Metro Rail', longName], 0],
        ['>=', ['index-of', 'Metro ', longName], 0],
        ['>=', ['index-of', 'METRO ', longName], 0],
      ]],
      ['all', ['==', routeType, 0], ['==', agency, 'sdmts'], ['any',
        ...['Blue', 'Copper', 'Green', 'Orange', 'Silver'].map(name => ['==', shortName, name]),
      ]],
      ['all', ['==', routeType, 2], ['>=', ['index-of', 'ION', longName], 0]],
    ],
    VIRTUAL_LRT_MODE,
    routeType,
  ];
}

/** MapLibre layer filter clause for selected mode chip ids (null = no filter). */
export { buildModeFilterClause } from './tileFilterExprs.js';
