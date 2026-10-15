/**
 * Share-URL encoding for the agency selection and the transit-mode filter (CIV-72).
 *
 * Agencies: with ~500 agencies the URL has to stay short, so:
 *   - everything on (the default)          -> nothing in the URL
 *   - a few on                             -> ?agencies=a.b.c   (include list)
 *   - most on, a few hidden                -> ?hide=x.y         (exclude list)
 *   - exactly one metro area's agencies         -> ?area=<slug>   (slugs from config/areas)
 *   - whichever of the two is shorter wins; if even that is over AGENCY_URL_MAX_SLUGS
 *     slugs, the selection is left out of the URL entirely.
 * Slugs are [a-z0-9-], so `.` is used as the separator: URLSearchParams leaves it
 * unencoded (a `,` would become `%2C`). Commas are still accepted when reading.
 *
 * A URL rule is kept as a rule (include/exclude), not resolved to a set at mount, because
 * the agency catalog loads after the map mounts. Unknown or removed slugs simply never
 * match, so they are ignored.
 */
import { AREA_INDEX, AREA_PARAM, areaMatchingSelection, lookupArea, type AreaIndex } from '../../shared/areaIndex';
import { FEATURES } from '../../shared/config';
import { filterModeOptions } from '../../shared/modes';

export const AGENCY_URL_MAX_SLUGS = 60;
export const AGENCIES_PARAM = 'agencies';
export const HIDE_AGENCIES_PARAM = 'hide';
export const MODES_PARAM = 'm';
const SEP = '.';

/** Modes offered in the filter UI. On-demand is internal-only. */
export const AVAILABLE_FILTER_MODES: ReadonlyArray<{ id: number; label: string }> = filterModeOptions(FEATURES.onDemand);

export type AgencyUrlRule =
  | { kind: 'include'; slugs: ReadonlySet<string> }
  | { kind: 'exclude'; slugs: ReadonlySet<string> };

function splitList(raw: string): string[] {
  return raw.split(/[.,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
}

/**
 * Read the agency rule from a query string. `agencies` wins over `hide`, and both win over
 * `area`. An unknown area slug is ignored.
 */
export function parseAgencyUrlRule(search: string | URLSearchParams, areas: AreaIndex = AREA_INDEX): AgencyUrlRule | null {
  const sp = toSearchParams(search);
  const include = sp.get(AGENCIES_PARAM);
  if (include != null) {
    const slugs = splitList(include);
    if (slugs.length > 0) return { kind: 'include', slugs: new Set(slugs) };
  }
  const exclude = sp.get(HIDE_AGENCIES_PARAM);
  if (exclude != null) {
    const slugs = splitList(exclude);
    if (slugs.length > 0) return { kind: 'exclude', slugs: new Set(slugs) };
  }
  const area = lookupArea(sp.get(AREA_PARAM), areas);
  if (area && area.agencies.length > 0) return { kind: 'include', slugs: new Set(area.agencies) };
  return null;
}

/** The area bounds a link asks the map to fit to, when it names a known area. */
export function parseAreaBounds(
  search: string | URLSearchParams,
  areas: AreaIndex = AREA_INDEX,
): [number, number, number, number] | null {
  return lookupArea(toSearchParams(search).get(AREA_PARAM), areas)?.bbox ?? null;
}

/**
 * Whether an agency starts off. A URL rule, when present, overrides the stored off-list.
 */
export function isAgencyOff(slug: string, rule: AgencyUrlRule | null, savedOff: ReadonlySet<string>): boolean {
  if (!rule) return savedOff.has(slug);
  return rule.kind === 'include' ? !rule.slugs.has(slug) : rule.slugs.has(slug);
}

/**
 * Once the catalog is known, drop an include rule that matches no real agency (every slug
 * unknown or removed) so the link falls back to the viewer's own selection instead of an
 * empty map. An exclude rule with unknown slugs is harmless and kept.
 */
export function settleAgencyUrlRule(rule: AgencyUrlRule | null, catalogSlugs: readonly string[]): AgencyUrlRule | null {
  if (!rule || rule.kind === 'exclude') return rule;
  return catalogSlugs.some(s => rule.slugs.has(s)) ? rule : null;
}

/**
 * The stored selection is only rewritten when no URL rule is in effect, or the viewer has
 * changed the selection themselves. Opening a shared link must not replace their own prefs.
 */
export function shouldPersistAgencySelection(rule: AgencyUrlRule | null, userChanged: boolean): boolean {
  return !rule || userChanged;
}

/** URL params for the current selection. Both null = leave it out of the URL. */
export function encodeAgencySelection(
  selected: ReadonlySet<string>,
  catalogSlugs: readonly string[],
): { agencies: string | null; hide: string | null } {
  const none = { agencies: null, hide: null };
  if (catalogSlugs.length === 0) return none;
  const on: string[] = [];
  const off: string[] = [];
  for (const slug of catalogSlugs) (selected.has(slug) ? on : off).push(slug);
  if (off.length === 0) return none;
  // Nothing on is not a view worth sharing (and can't be written as an include list).
  if (on.length === 0) return none;
  on.sort();
  off.sort();
  const includeStr = on.join(SEP);
  const excludeStr = off.join(SEP);
  const useInclude = includeStr.length <= excludeStr.length;
  const count = useInclude ? on.length : off.length;
  if (count > AGENCY_URL_MAX_SLUGS) return none;
  return useInclude ? { agencies: includeStr, hide: null } : { agencies: null, hide: excludeStr };
}

/**
 * URL params for the current selection, preferring `area=` when the selection is exactly one
 * metro area's agencies. Always sets all three keys so the stale ones are cleared.
 */
export function encodeSelectionParams(
  selected: ReadonlySet<string>,
  catalogSlugs: readonly string[],
  areas: AreaIndex = AREA_INDEX,
): { area: string | null; agencies: string | null; hide: string | null } {
  const base = encodeAgencySelection(selected, catalogSlugs);
  // Everything on is the default and stays out of the URL even if an area covers the whole catalog.
  if (base.agencies == null && base.hide == null) return { area: null, ...base };
  const area = areaMatchingSelection(selected, catalogSlugs, areas);
  return area ? { area, agencies: null, hide: null } : { area: null, ...base };
}

/** Mode filter from the URL. Unknown ids are dropped; empty means no restriction. */
export function parseModesParam(
  search: string | URLSearchParams,
  allowed: ReadonlyArray<{ id: number }> = AVAILABLE_FILTER_MODES,
): Set<number> {
  const raw = toSearchParams(search).get(MODES_PARAM);
  if (!raw) return new Set();
  const ok = new Set(allowed.map(m => m.id));
  const out = new Set<number>();
  for (const part of raw.split(/[.,]/)) {
    if (!/^-?\d+$/.test(part.trim())) continue;
    const id = Number(part);
    if (ok.has(id)) out.add(id);
  }
  return out;
}

export function encodeModesParam(modes: ReadonlySet<number>): string | null {
  if (modes.size === 0) return null;
  return [...modes].sort((a, b) => a - b).join(SEP);
}

/**
 * Compare mode, side B (CIV-19). Side A uses the normal `h` / `p` / `day` params; side B has its
 * own day (`cday`), time (`cp`) and frequency (`ch`). `ch` is always written while comparing so a
 * shared link reproduces B exactly; links made before B had its own frequency have no `ch`, and B
 * then copies A's frequency.
 *
 * Sharing: the page URL is the share link, so copying it reproduces both maps (A from `h`/`p`/
 * `day`, B from these). Compare links go through withShareTags like every other share link; the
 * compare params need no special handling and survive tagging untouched.
 */
export const COMPARE_DAY_PARAM = 'cday';
export const COMPARE_PERIOD_PARAM = 'cp';
export const COMPARE_HEADWAY_PARAM = 'ch';

export interface CompareSideParams<Day extends string = string, Period extends string = string> {
  day: Day;
  period: Period;
  maxHeadway: number;
}

/** Frequency value from a URL (`h` or `ch`): a positive number of minutes, or "all" for no limit. */
export function parseHeadwayValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  if (raw === 'all' || raw === 'inf' || raw === 'Infinity') return Infinity;
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : null;
}

export function encodeHeadwayValue(maxHeadway: number): string {
  return maxHeadway === Infinity ? 'all' : String(maxHeadway);
}

/** Side B from the URL, or null when the link isn't a compare link (or names an unknown day). */
export function parseCompareSideParams<Day extends string, Period extends string>(
  search: string | URLSearchParams,
  options: { days: readonly Day[]; periods: readonly Period[]; allPeriod: Period; fallbackHeadway: number },
): CompareSideParams<Day, Period> | null {
  const sp = toSearchParams(search);
  const day = sp.get(COMPARE_DAY_PARAM);
  if (!day || !(options.days as readonly string[]).includes(day)) return null;
  const cp = sp.get(COMPARE_PERIOD_PARAM);
  const period = cp && (options.periods as readonly string[]).includes(cp) ? cp as Period : options.allPeriod;
  const maxHeadway = parseHeadwayValue(sp.get(COMPARE_HEADWAY_PARAM)) ?? options.fallbackHeadway;
  return { day: day as Day, period, maxHeadway };
}

/** URL params for side B; all null when compare is off. */
export function encodeCompareSideParams(side: CompareSideParams | null): Record<'cday' | 'cp' | 'ch', string | null> {
  if (!side) return { cday: null, cp: null, ch: null };
  return { cday: side.day, cp: side.period, ch: encodeHeadwayValue(side.maxHeadway) };
}

/**
 * History app (/apps/history). These have their own names because the frequency map stays
 * mounted underneath History and owns `route` (an `agency::routeId` key) and `agencies`;
 * sharing those names would let the map's own sync delete History's values.
 * Defaults (nothing chosen, newest year, no filters) stay out of the URL.
 * Region names can contain spaces and dots, so regions are joined with `,`.
 */
export const HISTORY_AGENCY_PARAM = 'agency';
export const HISTORY_ROUTE_PARAM = 'hroute';
export const HISTORY_YEAR_PARAM = 'year';
export const HISTORY_REGION_PARAM = 'region';
export const HISTORY_ROUTE_QUERY_PARAM = 'rq';
export const HISTORY_ROUTE_MODE_PARAM = 'rmode';

export interface HistoryUrlState {
  agency: string | null;
  route: string | null;
  /** 0 = no year in the link (the newest year is used). */
  year: number;
  regions: string[];
  routeQuery: string;
  routeMode: string | null;
}

export type HistoryUrlParams = Record<'agency' | 'hroute' | 'year' | 'region' | 'rq' | 'rmode', string | null>;

const HISTORY_ROUTE_MODE_RE = /^(mode:\d+|subtype:brt|subtype:express)$/;

export function parseHistoryUrlState(search: string | URLSearchParams): HistoryUrlState {
  const sp = toSearchParams(search);
  const agency = sp.get(HISTORY_AGENCY_PARAM)?.trim() || null;
  const yearRaw = Number(sp.get(HISTORY_YEAR_PARAM));
  const mode = sp.get(HISTORY_ROUTE_MODE_PARAM);
  return {
    agency,
    // A route only means something inside an agency.
    route: agency ? sp.get(HISTORY_ROUTE_PARAM) || null : null,
    year: agency && Number.isInteger(yearRaw) && yearRaw > 1900 ? yearRaw : 0,
    regions: [...new Set((sp.get(HISTORY_REGION_PARAM) ?? '').split(',').map(r => r.trim()).filter(Boolean))],
    routeQuery: agency ? sp.get(HISTORY_ROUTE_QUERY_PARAM) ?? '' : '',
    routeMode: agency && mode && HISTORY_ROUTE_MODE_RE.test(mode) ? mode : null,
  };
}

/** URL params for History. `latestYear` is the default year, which is left out. */
export function encodeHistoryUrlState(state: HistoryUrlState, latestYear: number): HistoryUrlParams {
  const inAgency = state.agency != null;
  return {
    agency: state.agency,
    hroute: inAgency ? state.route : null,
    year: inAgency && state.year > 0 && state.year !== latestYear ? String(state.year) : null,
    region: state.regions.length ? [...state.regions].sort().join(',') : null,
    rq: inAgency && state.routeQuery ? state.routeQuery : null,
    rmode: inAgency ? state.routeMode : null,
  };
}

/** Every History param cleared. */
export const EMPTY_HISTORY_URL_PARAMS: HistoryUrlParams = { agency: null, hroute: null, year: null, region: null, rq: null, rmode: null };

/**
 * The route card's full-day chart (beta). `fullday=1` opens it; `fdir` is the direction pill,
 * written only when it differs from the default (the slower direction).
 */
export const FULL_DAY_OPEN_PARAM = 'fullday';
export const FULL_DAY_DIRECTION_PARAM = 'fdir';

export interface FullDayUrlState {
  open: boolean;
  direction: string | null;
}

export function parseFullDayUrlState(search: string | URLSearchParams): FullDayUrlState {
  const sp = toSearchParams(search);
  return {
    open: sp.get(FULL_DAY_OPEN_PARAM) === '1',
    direction: sp.get(FULL_DAY_DIRECTION_PARAM) || null,
  };
}

export function encodeFullDayUrlState(state: FullDayUrlState, defaultDirection: string | null): Record<'fullday' | 'fdir', string | null> {
  if (!state.open) return { fullday: null, fdir: null };
  return {
    fullday: '1',
    fdir: state.direction && state.direction !== defaultDirection ? state.direction : null,
  };
}
