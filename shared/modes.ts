/**
 * Route mode classification — filter chips, map expressions, and display labels.
 *
 * Modes come from the agency's GTFS route_type; known ambiguities are corrected by the per-route
 * `modeOverrides` listed in config/agencies/<slug>.json (collected into shared/data/mode-overrides.json by
 * `npm run build:agency-index`), never guessed. See docs/product/DECISIONS.md.
 */
import modeOverrideData from './data/mode-overrides.json';
import {
  EXTENDED_BUS_RANGE, FILTER_MODE_IDS, GTFS_BASE_MODE_LABELS, GTFS_EXTENDED_EXACT_MODE_LABELS, GTFS_EXTENDED_MODE_LABELS,
  GTFS_OTHER_MODE_LABEL, MODE_DEFINITIONS, ON_DEMAND_MODE, RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE, VIRTUAL_LRT_MODE,
} from './rules/modes';

// The tables moved to shared/rules/modes.ts (rules audit 4.1, move 9); these re-exports stay until no file imports them here.
export { GTFS_BASE_MODE_LABELS, MODE_DEFINITIONS, ON_DEMAND_MODE, VIRTUAL_LRT_MODE };

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
  /**
   * The site shows `mode`, but the pipeline keeps reading the route by its published type. For a correction whose
   * pipeline effect is not ready yet: CapMetro 550 reads as commuter rail, while rail processing waits on #1138.
   */
  labelOnly?: boolean;
}

/**
 * The listed overrides, with their names trimmed once here. The app (findModeOverride) and the map expression then both
 * compare a route's names to these exactly, so they always pick the same routes (#1132); a map expression cannot trim.
 */
export const MODE_OVERRIDES: readonly ModeOverride[] = (modeOverrideData as { overrides: ModeOverride[] }).overrides.map(o => ({
  ...o,
  ...(o.routeShortName !== undefined ? { routeShortName: o.routeShortName.trim() } : {}),
  ...(o.routeLongName !== undefined ? { routeLongName: o.routeLongName.trim() } : {}),
}));

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
  // Compared exactly, as the map expression does (#1132): it cannot trim, so trimming here would match routes the map misses.
  const shortName = p.routeShortName ?? '';
  const longName = p.routeLongName ?? '';
  return list.find(o => o.routeType === rt
    && (o.routeShortName === undefined || o.routeShortName === shortName)
    && (o.routeLongName === undefined || o.routeLongName === longName));
}

export interface EffectiveModeInput {
  routeType?: number | string | null;
  routeLongName?: string | null;
  routeShortName?: string | null;
  agencySlug?: string;
  /** CIV-1006: riders must book ahead (pipeline/bookedRoutes.ts); such a route reads as on-demand. */
  bookingRequired?: boolean | null;
}

/** Agency feeds whose route_type=0 entries are rail rather than streetcars. */
export const VIRTUAL_LRT_AGENCIES = ['calgary', 'edmonton', 'gcrta', 'rem', 'octranspo', 'sacrt'] as const;

/**
 * The light-rail name rules (CIV-993): one table that both isVirtualLrt and the map expression are built from, written
 * only with tests a MapLibre expression can do exactly (lower-cased prefix, suffix and substring checks), so the two never
 * drift. A route_type 0 route is light rail when its long name:
 * - starts "Line " and a digit (TTC "Line 5 Eglinton"),
 * - contains one of LRT_NAME_PHRASES, or
 * - is "Metro <one word> Line" (LA "Metro A Line", Minneapolis "METRO Blue Line").
 * A route_type 2 route is light rail when ION is a word of its long name (GRT "ION light rail").
 * All comparisons ignore case.
 */
const LRT_NAME_PHRASES = ['ctrain', 'capital line', 'metro line', 'valley line', 'valley metro rail'] as const;
const LRT_LINE_PREFIX = 'line ';
const LRT_METRO_PREFIX = 'metro ';
const LRT_METRO_SUFFIX = ' line';
const LRT_RAIL_WORD = 'ion';
const DIGITS = '0123456789';

function isLightRailName(longName: string): boolean {
  const n = longName.toLowerCase();
  const afterLine = n.charAt(LRT_LINE_PREFIX.length);
  if (n.startsWith(LRT_LINE_PREFIX) && afterLine !== '' && DIGITS.includes(afterLine)) return true;
  if (LRT_NAME_PHRASES.some(phrase => n.includes(phrase))) return true;
  if (n.startsWith(LRT_METRO_PREFIX) && n.endsWith(LRT_METRO_SUFFIX)) {
    const word = n.slice(LRT_METRO_PREFIX.length, n.length - LRT_METRO_SUFFIX.length);
    return word.length > 0 && !word.includes(' ');
  }
  return false;
}

function isLightRailRegionalName(longName: string): boolean {
  const n = longName.toLowerCase();
  const w = LRT_RAIL_WORD;
  return n === w || n.startsWith(`${w} `) || n.endsWith(` ${w}`) || n.includes(` ${w} `);
}

/** Coerce GeoJSON / MVT routeType to a GTFS base type (defaults to bus). */
export function normalizeRouteType(routeType: unknown): number {
  if (routeType === undefined || routeType === null || routeType === '') return ROUTE_TYPE.BUS;
  const n = typeof routeType === 'number' ? routeType : parseInt(String(routeType), 10);
  if (!Number.isFinite(n)) return ROUTE_TYPE.BUS;
  if (n >= EXTENDED_BUS_RANGE[0] && n < EXTENDED_BUS_RANGE[1]) return ROUTE_TYPE.BUS;
  return n;
}

export function isVirtualLrt(p: EffectiveModeInput): boolean {
  const rt = normalizeRouteType(p.routeType);
  const longName = p.routeLongName ?? '';
  if (rt === ROUTE_TYPE.TRAM && VIRTUAL_LRT_AGENCIES.includes(p.agencySlug as typeof VIRTUAL_LRT_AGENCIES[number])) return true;
  if (rt === ROUTE_TYPE.TRAM && isLightRailName(longName)) return true;
  if (rt === ROUTE_TYPE.RAIL && isLightRailRegionalName(longName)) return true;
  return false;
}

/** True for subway, commuter rail, monorail, and explicitly identified LRT routes. */
export function isRailLikeRoute(p: EffectiveModeInput): boolean {
  // Rail-like decides pipeline processing only, so a label-only correction is skipped here.
  const mode = findModeOverride(p)?.labelOnly ? publishedMode(p) : effectiveMode(p);
  return RAIL_LIKE_ROUTE_TYPES.includes(mode);
}

export function effectiveMode(p: EffectiveModeInput): number {
  if (p.bookingRequired === true) return ON_DEMAND_MODE;
  const override = findModeOverride(p);
  if (override) return override.mode;
  return publishedMode(p);
}

/** The mode before any listed per-route correction. */
function publishedMode(p: EffectiveModeInput): number {
  const rt = normalizeRouteType(p.routeType);
  return isVirtualLrt(p) ? VIRTUAL_LRT_MODE : rt;
}

/** True when a bus route is explicitly published as replacing rail service. */
export function isRailReplacementBus(p: EffectiveModeInput): boolean {
  return normalizeRouteType(p.routeType) === ROUTE_TYPE.BUS && /replacement\s+bus/i.test(p.routeLongName ?? '');
}

/** Mode filter chip options (Frequency Map), in the shared order. On-demand is added by the menus that offer it. */
export const FILTER_MODES = MODE_DEFINITIONS.filter(m => FILTER_MODE_IDS.includes(m.id));

/** The menu's mode options with On-demand last, when the on-demand feature is on. */
export function filterModeOptions(includeOnDemand: boolean): ReadonlyArray<{ id: number; label: string }> {
  return includeOnDemand ? MODE_DEFINITIONS.filter(m => FILTER_MODE_IDS.includes(m.id) || m.id === ON_DEMAND_MODE) : FILTER_MODES;
}

export function getGtfsModeName(routeType: string | number): string {
  const n = typeof routeType === 'number' ? routeType : parseInt(String(routeType));
  if (!Number.isNaN(n) && GTFS_BASE_MODE_LABELS[n] != null) {
    return GTFS_BASE_MODE_LABELS[n];
  }
  if (Number.isNaN(n)) return GTFS_OTHER_MODE_LABEL;
  if (GTFS_EXTENDED_EXACT_MODE_LABELS[n] != null) return GTFS_EXTENDED_EXACT_MODE_LABELS[n];
  return GTFS_EXTENDED_MODE_LABELS.find(([from, to]) => n >= from && n < to)?.[2] ?? GTFS_OTHER_MODE_LABEL;
}

const startsWith = (s: unknown[], prefix: string): unknown[] => ['==', ['slice', s, 0, prefix.length], prefix];
const endsWith = (s: unknown[], suffix: string): unknown[] =>
  ['all', ['>=', ['length', s], suffix.length], ['==', ['slice', s, ['-', ['length', s], suffix.length]], suffix]];
const contains = (s: unknown[], part: string): unknown[] => ['>=', ['index-of', part, s], 0];

/** isLightRailName as a MapLibre expression over the lower-cased long name (same table, same tests). */
function lightRailNameExpression(n: unknown[]): unknown[] {
  const metroWord: unknown[] = ['slice', n, LRT_METRO_PREFIX.length, ['-', ['length', n], LRT_METRO_SUFFIX.length]];
  return ['any',
    ['all', startsWith(n, LRT_LINE_PREFIX), ['>', ['length', n], LRT_LINE_PREFIX.length],
      ['in', ['slice', n, LRT_LINE_PREFIX.length, LRT_LINE_PREFIX.length + 1], DIGITS]],
    ...LRT_NAME_PHRASES.map(phrase => contains(n, phrase)),
    ['all', startsWith(n, LRT_METRO_PREFIX), endsWith(n, LRT_METRO_SUFFIX),
      ['>', ['length', n], LRT_METRO_PREFIX.length + LRT_METRO_SUFFIX.length],
      ['!', ['in', ' ', metroWord]]],
  ];
}

/** isLightRailRegionalName as a MapLibre expression over the lower-cased long name. */
function lightRailRegionalNameExpression(n: unknown[]): unknown[] {
  const w = LRT_RAIL_WORD;
  return ['any', ['==', n, w], startsWith(n, `${w} `), endsWith(n, ` ${w}`), contains(n, ` ${w} `)];
}

/** MapLibre expression: compute effective mode from feature properties. */
export function buildEffectiveModeExpression(): unknown[] {
  const routeType: unknown[] = ['to-number', ['coalesce', ['get', 'routeType'], ROUTE_TYPE.BUS]];
  const normalizedRouteType: unknown[] = ['case',
    ['all', ['>=', routeType, EXTENDED_BUS_RANGE[0]], ['<', routeType, EXTENDED_BUS_RANGE[1]]], ROUTE_TYPE.BUS,
    routeType,
  ];
  const longName: unknown[] = ['coalesce', ['get', 'routeLongName'], ''];
  const lowerName: unknown[] = ['downcase', longName];
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
    ['==', ['get', 'bookingRequired'], true], ON_DEMAND_MODE,
    ...overrideBranches,
    ['any',
      ['all', ['==', routeType, ROUTE_TYPE.TRAM], ['any', ...VIRTUAL_LRT_AGENCIES.map(slug => ['==', agency, slug])]],
      ['all', ['==', routeType, ROUTE_TYPE.TRAM], lightRailNameExpression(lowerName)],
      ['all', ['==', routeType, ROUTE_TYPE.RAIL], lightRailRegionalNameExpression(lowerName)],
    ],
    VIRTUAL_LRT_MODE,
    normalizedRouteType,
  ];
}

/** MapLibre layer filter clause for selected mode chip ids (null = no filter). */
