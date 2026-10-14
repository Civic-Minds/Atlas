/**
 * Route mode classification — filter chips, map expressions, and display labels.
 *
 * Modes come from the agency's GTFS route_type; known ambiguities are corrected by the per-route
 * `modeOverrides` listed in config/agencies/<slug>.json (collected into shared/data/mode-overrides.json by
 * `npm run build:agency-index`), never guessed. See docs/product/DECISIONS.md.
 */
import modeOverrideData from './data/mode-overrides.json';

/** Virtual mode ID for LRT routes that share route_type=0 with streetcars. */
export const VIRTUAL_LRT_MODE = 100;

/** One mode, one label and one place in every list that shows modes (menu, pages, sentences, counters). */
export const ON_DEMAND_MODE = -1;

export const MODE_DEFINITIONS = [
  { id: 1, label: 'Subway/Metro' },
  { id: VIRTUAL_LRT_MODE, label: 'Light rail' },
  { id: 0, label: 'Streetcar' },
  { id: 2, label: 'Commuter rail' },
  { id: 12, label: 'Monorail' },
  { id: 3, label: 'Bus' },
  { id: 11, label: 'Trolleybus' },
  { id: 4, label: 'Ferry' },
  { id: 5, label: 'Cable car' },
  { id: 6, label: 'Gondola/aerial tram' },
  { id: 7, label: 'Funicular' },
  { id: ON_DEMAND_MODE, label: 'On-demand' },
] as const;

/** Display name for an effective mode id ("Other" for an id with no definition). */
export function modeLabel(mode: number): string {
  return MODE_DEFINITIONS.find(m => m.id === mode)?.label ?? 'Other';
}

/** Label for a defined mode, or null when the id has none (extended types such as taxis get no chip). */
export function knownModeLabel(mode: number): string | null {
  return MODE_DEFINITIONS.find(m => m.id === mode)?.label ?? null;
}

/** Position in the shared mode order; unknown modes sort last, by id. */
export function modeSortIndex(mode: number): number {
  const i = MODE_DEFINITIONS.findIndex(m => m.id === mode);
  return i < 0 ? MODE_DEFINITIONS.length : i;
}

/** Same order, looked up by display label (for lists already keyed by label). */
export function modeLabelSortIndex(label: string): number {
  const i = MODE_DEFINITIONS.findIndex(m => m.label === label);
  return i < 0 ? MODE_DEFINITIONS.length : i;
}

/** Sort modes (ids) into the shared order. */
export function sortModes<T>(items: Iterable<T>, getMode: (item: T) => number): T[] {
  return [...items].sort((a, b) => modeSortIndex(getMode(a)) - modeSortIndex(getMode(b)) || getMode(a) - getMode(b));
}

export interface ModeOverride {
  agencySlug: string;
  /** The GTFS route_type the feed publishes; the override applies only while the feed still says this. */
  routeType: number;
  routeShortName?: string;
  routeLongName?: string;
  mode: number;
  reason: string;
}

export const MODE_OVERRIDES: readonly ModeOverride[] = (modeOverrideData as { overrides: ModeOverride[] }).overrides;

const OVERRIDES_BY_AGENCY = new Map<string, ModeOverride[]>();
for (const o of MODE_OVERRIDES) {
  const list = OVERRIDES_BY_AGENCY.get(o.agencySlug) ?? [];
  list.push(o);
  OVERRIDES_BY_AGENCY.set(o.agencySlug, list);
}

/** The agency's listed correction for this route, if any. Needs agencySlug; callers without it get none. */
export function findModeOverride(p: EffectiveModeInput): ModeOverride | undefined {
  const list = p.agencySlug ? OVERRIDES_BY_AGENCY.get(p.agencySlug) : undefined;
  if (!list) return undefined;
  const rt = normalizeRouteType(p.routeType);
  const shortName = (p.routeShortName ?? '').trim();
  const longName = (p.routeLongName ?? '').trim();
  return list.find(o => o.routeType === rt
    && (o.routeShortName === undefined || o.routeShortName === shortName)
    && (o.routeLongName === undefined || o.routeLongName === longName));
}

export interface EffectiveModeInput {
  routeType?: number | string | null;
  routeLongName?: string | null;
  routeShortName?: string | null;
  agencySlug?: string;
}

/** Agency feeds whose route_type=0 entries are rail rather than streetcars. */
export const VIRTUAL_LRT_AGENCIES = ['calgary', 'edmonton', 'gcrta', 'rem', 'octranspo', 'sacrt'] as const;

const LRT_NAME_RE = /(?:CTrain|Capital Line|Metro Line|Valley Line|Valley Metro Rail|Metro [A-Za-z]+ Line)/i;

/** Coerce GeoJSON / MVT routeType to a GTFS base type (defaults to bus). */
export function normalizeRouteType(routeType: unknown): number {
  if (routeType === undefined || routeType === null || routeType === '') return 3;
  const n = typeof routeType === 'number' ? routeType : parseInt(String(routeType), 10);
  if (!Number.isFinite(n)) return 3;
  // HVT extended bus types (700–799) still belong under Atlas's Bus mode.
  if (n >= 700 && n < 800) return 3;
  return n;
}

export function isVirtualLrt(p: EffectiveModeInput): boolean {
  const rt = normalizeRouteType(p.routeType);
  const longName = p.routeLongName ?? '';
  if (rt === 0 && VIRTUAL_LRT_AGENCIES.includes(p.agencySlug as typeof VIRTUAL_LRT_AGENCIES[number])) return true;
  if (rt === 0 && /^Line \d/i.test(longName)) return true;
  if (rt === 0 && LRT_NAME_RE.test(longName)) return true;
  if (rt === 2 && /\bION\b/i.test(longName)) return true;
  return false;
}

/** True for subway, commuter rail, monorail, and explicitly identified LRT routes. */
export function isRailLikeRoute(p: EffectiveModeInput): boolean {
  const mode = effectiveMode(p);
  return mode === 1 || mode === 2 || mode === 12 || mode === VIRTUAL_LRT_MODE;
}

export function effectiveMode(p: EffectiveModeInput): number {
  const override = findModeOverride(p);
  if (override) return override.mode;
  const rt = normalizeRouteType(p.routeType);
  return isVirtualLrt(p) ? VIRTUAL_LRT_MODE : rt;
}

/** True when a bus route is explicitly published as replacing rail service. */
export function isRailReplacementBus(p: EffectiveModeInput): boolean {
  return normalizeRouteType(p.routeType) === 3 && /replacement\s+bus/i.test(p.routeLongName ?? '');
}

/** Mode filter chip options (Frequency Map), in the shared order. On-demand is added by the menus that offer it. */
const FILTER_MODE_IDS: readonly number[] = [1, VIRTUAL_LRT_MODE, 0, 2, 3, 4, 6];
export const FILTER_MODES = MODE_DEFINITIONS.filter(m => FILTER_MODE_IDS.includes(m.id));

/** The menu's mode options with On-demand last, when the on-demand feature is on. */
export function filterModeOptions(includeOnDemand: boolean): ReadonlyArray<{ id: number; label: string }> {
  return includeOnDemand ? MODE_DEFINITIONS.filter(m => FILTER_MODE_IDS.includes(m.id) || m.id === ON_DEMAND_MODE) : FILTER_MODES;
}

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
  const normalizedRouteType: unknown[] = ['case',
    ['all', ['>=', routeType, 700], ['<', routeType, 800]], 3,
    routeType,
  ];
  const longName: unknown[] = ['coalesce', ['get', 'routeLongName'], ''];
  const shortName: unknown[] = ['coalesce', ['get', 'routeShortName'], ''];
  const agency: unknown[] = ['coalesce', ['get', 'agencySlug'], ''];
  // Listed per-route corrections come first, grouped by agency and target mode to keep the expression short.
  const overrideBranches: unknown[] = [];
  const groups = new Map<string, ModeOverride[]>();
  for (const o of MODE_OVERRIDES) {
    const key = `${o.agencySlug}|${o.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  for (const list of groups.values()) {
    overrideBranches.push(
      ['all', ['==', agency, list[0].agencySlug], ['any', ...list.map(o => ['all',
        ['==', routeType, o.routeType],
        ...(o.routeShortName !== undefined ? [['==', shortName, o.routeShortName]] : []),
        ...(o.routeLongName !== undefined ? [['==', longName, o.routeLongName]] : []),
      ])]],
      list[0].mode,
    );
  }
  return [
    'case',
    ...overrideBranches,
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
      ['all', ['==', routeType, 2], ['>=', ['index-of', 'ION', longName], 0]],
    ],
    VIRTUAL_LRT_MODE,
    normalizedRouteType,
  ];
}

/** MapLibre layer filter clause for selected mode chip ids (null = no filter). */
export { buildModeFilterClause } from './tileFilterExprs.js';
