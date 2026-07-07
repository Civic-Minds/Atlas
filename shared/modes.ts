/**
 * Route mode classification — filter chips, map expressions, and display labels.
 */

/** Virtual mode ID for LRT routes that share route_type=0 with streetcars. */
export const VIRTUAL_LRT_MODE = 100;

export interface EffectiveModeInput {
  routeType?: number;
  routeLongName?: string | null;
  agencySlug?: string;
}

export function effectiveMode(p: EffectiveModeInput): number {
  if (p.routeType === 0 && p.routeLongName && /^Line \d/i.test(p.routeLongName)) return VIRTUAL_LRT_MODE;
  if (p.routeType === 0 && p.agencySlug === 'octranspo') return VIRTUAL_LRT_MODE;
  if (p.routeType === 2 && p.routeLongName && /\bION\b/i.test(p.routeLongName)) return VIRTUAL_LRT_MODE;
  return p.routeType ?? 3;
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
  0: 'light rail',
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
  return [
    'coalesce',
    [
      'case',
      ['all', ['==', ['get', 'routeType'], 0], ['==', ['coalesce', ['get', 'agencySlug'], ''], 'octranspo']],
      VIRTUAL_LRT_MODE,
      ['all', ['==', ['get', 'routeType'], 0], ['==', ['slice', ['coalesce', ['get', 'routeLongName'], ''], 0, 5], 'Line ']],
      VIRTUAL_LRT_MODE,
      ['all', ['==', ['get', 'routeType'], 2], ['in', 'ION', ['coalesce', ['get', 'routeLongName'], '']]],
      VIRTUAL_LRT_MODE,
      ['get', 'routeType'],
    ],
    3,
  ];
}
