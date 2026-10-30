import { PERIOD_KEYS } from '../../shared/config';
import type { DayType, TimePeriod } from '../hooks/useIntervalStats';
import { DAY_TYPES } from '../../shared/dayTypes';
import type { DashboardBand } from '../../shared/liveDashboard';
import type { NightServiceFrequency } from '../../shared/nightService';
import { parseFrequentServiceDays, type FrequentServiceFrequency, type FrequentServiceWindow } from '../../shared/frequentService';
import type { MapMeasure } from '../components/Live/routeMapModel';

/**
 * Every view's link parameters, declared once (CIV-1011 #11, CIV-1139): each one's key, the older names a shared
 * link may still use, how a value is read (an unusable value counts as absent) and how it is written (null leaves
 * it out). Views read their link with `readLink` and write it with `linkUpdate`, so two views that share a key
 * share its meaning. Saved preferences stay with their settings: a value read here only says what the link asked for.
 *
 * The map's agency, mode, Compare, card and History codecs need more than one key or the catalog, so they live in
 * shareUrlState.ts; the share-link builders import their key names from there.
 */
export interface UrlParam<T> {
  /** The key written to the URL. */
  key: string;
  /** Older keys still read, after `key` (e.g. ?headway= and ?max= for ?h=). */
  aliases?: readonly string[];
  /** 'nonEmpty': `?h=` with no value is absent. 'any': the key alone counts (?span=). */
  presence: 'nonEmpty' | 'any';
  parse: (raw: string) => T | undefined;
  serialize: (value: T) => string | null;
}

const identity = (raw: string) => raw;

/** A value from a fixed list; `fallback` is the default, left out of the link. */
function oneOf<T extends string>(key: string, values: readonly T[], fallback: T | null, aliases?: readonly string[]): UrlParam<T> {
  return {
    key, aliases, presence: 'nonEmpty',
    parse: raw => ((values as readonly string[]).includes(raw) ? raw as T : undefined),
    serialize: value => (value === fallback ? null : value),
  };
}

/** Frequency in minutes; Infinity is "All" (all, inf or Infinity in a link). */
const headwayValue = {
  parse: (raw: string) => {
    if (raw === 'all' || raw === 'inf' || raw === 'Infinity') return Infinity;
    const n = Number(raw);
    return isFinite(n) && n > 0 ? n : undefined;
  },
  serialize: (value: number) => (value === Infinity ? 'all' : String(value)),
};

/** A direction id: a number. */
const direction: UrlParam<number> = {
  key: 'dir', presence: 'nonEmpty',
  parse: raw => (Number.isNaN(Number(raw)) ? undefined : Number(raw)),
  serialize: value => String(value),
};

/** Live's time bands: all day and the four daytime periods (late night and overnight have too few trips). */
export const LIVE_BAND_IDS: readonly DashboardBand[] = ['all', 'amPeak', 'midday', 'pmPeak', 'evening'];
export const LIVE_MEASURE_IDS: readonly MapMeasure[] = ['late', 'runTime', 'extraWait', 'bunching'];
export const LIVE_SORT_IDS = ['late', 'runTime', 'bunching', 'delivered'] as const;
export type LiveSort = typeof LIVE_SORT_IDS[number];

/** The map (Frequency and Frequent Service; it stays mounted under every other view). */
export const MAP_URL = {
  /**
   * Frequency filter in minutes; Infinity is "All". Always written, 60 included: without it a link opens on
   * the viewer's saved frequency, not the sender's (#1141).
   */
  headway: { key: 'h', aliases: ['headway', 'max'], presence: 'nonEmpty', ...headwayValue } satisfies UrlParam<number>,
  /** Time period. Always written, "all" included: without it a link opens on the current period (#1141). */
  period: {
    key: 'p', aliases: ['period'], presence: 'nonEmpty',
    parse: raw => (raw === 'all' || (PERIOD_KEYS as readonly string[]).includes(raw) ? raw as TimePeriod : undefined),
    serialize: value => value,
  } satisfies UrlParam<TimePeriod>,
  day: {
    key: 'day', aliases: ['d'], presence: 'nonEmpty',
    parse: raw => ((DAY_TYPES as readonly string[]).includes(raw) ? raw as DayType : undefined),
    serialize: value => value,
  } satisfies UrlParam<DayType>,
  /**
   * Irregular service hidden unless the link says span=0. Always written (span=1 when hidden): without it a
   * link opens on the viewer's saved choice (#1141).
   */
  hideSpan: {
    key: 'span', presence: 'any',
    parse: raw => raw !== '0',
    serialize: value => (value ? '1' : '0'),
  } satisfies UrlParam<boolean>,
  /** Part-time service hidden unless the link says limited=0. Always written (limited=1 when hidden), as span (#1141). */
  hideLimited: {
    key: 'limited', presence: 'any',
    parse: raw => raw !== '0',
    serialize: value => (value ? '1' : '0'),
  } satisfies UrlParam<boolean>,
  /** The open route card: agency::route[::branch:x]. */
  route: { key: 'route', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** The open stop card: agency::stopId. */
  stop: { key: 'stop', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** The open on-demand card: agency, or agency::zoneId. */
  onDemand: { key: 'ondemand', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** Debug only: extra routes drawn in distinct colours. Read on load, never written. */
  highlight: {
    key: 'highlight', presence: 'nonEmpty',
    parse: raw => raw.split(',').map(s => s.trim()).filter(Boolean),
    serialize: () => null,
  } satisfies UrlParam<string[]>,
  /** The shared view: all three or none (regionView.parseUrlView). Written as the map moves. */
  lat: { key: 'lat', presence: 'nonEmpty', parse: raw => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : undefined), serialize: value => value.toFixed(5) } satisfies UrlParam<number>,
  lon: { key: 'lon', presence: 'nonEmpty', parse: raw => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : undefined), serialize: value => value.toFixed(5) } satisfies UrlParam<number>,
  zoom: { key: 'z', presence: 'nonEmpty', parse: raw => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : undefined), serialize: value => value.toFixed(2) } satisfies UrlParam<number>,
} as const;

/**
 * History's own Frequency and Time, in the map's keys and format (CIV-392, CIV-389), so a map link and a History
 * link read the same. History has no all-day view (CIV-1097): p=all reads as absent.
 */
export const HISTORY_VIEW_URL = {
  headway: MAP_URL.headway,
  period: {
    ...MAP_URL.period,
    parse: raw => ((PERIOD_KEYS as readonly string[]).includes(raw) ? raw as TimePeriod : undefined),
  } satisfies UrlParam<TimePeriod>,
} as const;

/** App-wide settings a link can carry. */
export const APP_URL = {
  /** Low-quality feeds hidden: written as 1 when on, left out when off. */
  hideLowQuality: { key: 'quality', presence: 'any', parse: raw => raw === '1', serialize: value => (value ? '1' : null) } satisfies UrlParam<boolean>,
} as const;

/** Night Service (/research/night). Written while Night is open; 60 is the default and left out. */
export const NIGHT_URL = {
  frequency: {
    key: 'nightFrequency', presence: 'nonEmpty',
    parse: (raw): NightServiceFrequency | undefined => (raw === '30' ? 30 : undefined),
    serialize: value => (value === 60 ? null : String(value)),
  } satisfies UrlParam<NightServiceFrequency>,
} as const;

/** Frequent Service (/research/frequent-service). Defaults (weekdays, every 15, daytime) are left out. */
export const FREQUENT_URL = {
  days: {
    key: 'days', presence: 'nonEmpty',
    parse: raw => { const days = parseFrequentServiceDays(raw); return days.length ? days : undefined; },
    serialize: value => (value.length === 1 && value[0] === 'Weekday' ? null : value.join(',')),
  } satisfies UrlParam<DayType[]>,
  frequency: {
    key: 'frequency', presence: 'nonEmpty',
    parse: (raw): FrequentServiceFrequency | undefined => (raw === '30' ? 30 : undefined),
    serialize: value => (value === 15 ? null : String(value)),
  } satisfies UrlParam<FrequentServiceFrequency>,
  window: oneOf<FrequentServiceWindow>('window', ['daytime', 'extended'], 'daytime'),
} as const;

/**
 * Live on the map (/apps/live). The map underneath owns route for its own card, but closes it in Live; Live's
 * band shares p with the map's period, since its values are the map's period names (CIV-1139).
 */
export const LIVE_MAP_URL = {
  route: { key: 'route', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  vehicle: { key: 'vehicle', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  group: { key: 'group', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** The route's time band. Always written while a route is open (no default: it opens on the current band). */
  band: { ...oneOf<DashboardBand>('p', LIVE_BAND_IDS, null) } satisfies UrlParam<DashboardBand>,
  dir: direction,
  /** A stretch of the line: fromStopId~toStopId. */
  stretch: { key: 'stretch', presence: 'nonEmpty', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** The route's details screen. */
  details: { key: 'view', presence: 'nonEmpty', parse: (raw): boolean | undefined => (raw === 'details' ? true : undefined), serialize: value => (value ? 'details' : null) } satisfies UrlParam<boolean>,
} as const;

/** A Live route page (/live/...): its direction and which view of it. Explore is its own page under view=explore. */
export const LIVE_ROUTE_URL = {
  dir: direction,
  view: oneOf<'lite' | 'dashboard' | 'analysis' | 'explore'>('view', ['dashboard', 'analysis', 'explore'], 'lite'),
  /** Explore's day and band, cleared when the route page opens without them. */
  day: oneOf<'all' | 'weekday' | 'weekend'>('day', ['weekday', 'weekend'], 'all'),
  band: oneOf<DashboardBand>('band', LIVE_BAND_IDS, 'all'),
} as const;

/** The Live tool page: its route, direction, band, measure and the picked stop or stretch. */
export const LIVE_TOOL_URL = {
  route: { key: 'route', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  dir: direction,
  band: LIVE_ROUTE_URL.band,
  measure: oneOf<MapMeasure>('measure', LIVE_MEASURE_IDS, 'late'),
  stop: { key: 'stop', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** A stretch: fromStopId>toStopId. */
  segment: { key: 'seg', presence: 'any', parse: identity, serialize: value => value || null } satisfies UrlParam<string>,
  /** Older keys the tool page clears. */
  view: { key: 'view', presence: 'any', parse: () => undefined, serialize: () => null } satisfies UrlParam<never>,
  tab: { key: 'tab', presence: 'any', parse: () => undefined, serialize: () => null } satisfies UrlParam<never>,
} as const;

/** A Live agency page: its routes table's sort. */
export const LIVE_AGENCY_URL = {
  sort: oneOf<LiveSort>('sort', LIVE_SORT_IDS, 'late'),
} as const;

type AnyUrlParam = Pick<UrlParam<never>, 'key' | 'aliases' | 'presence'>;

function rawValue(search: string | URLSearchParams, param: AnyUrlParam): string | null {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  for (const key of [param.key, ...(param.aliases ?? [])]) {
    const raw = sp.get(key);
    if (raw == null) continue;
    if (param.presence === 'any' || raw !== '') return raw;
  }
  return null;
}

/** Whether the link names this parameter at all (even with a value it can't use). */
export function urlParamPresent(search: string | URLSearchParams, param: AnyUrlParam): boolean {
  return rawValue(search, param) != null;
}

/** The link's value for a parameter; undefined when absent or unusable. */
export function readUrlParam<T>(search: string | URLSearchParams, param: UrlParam<T>): T | undefined {
  const raw = rawValue(search, param);
  return raw == null ? undefined : param.parse(raw);
}

/** The URL update for a value: its key set, or removed when the value is the default. */
export function urlParamUpdate<T>(param: UrlParam<T>, value: T | null | undefined): Record<string, string | null> {
  return { [param.key]: value == null ? null : param.serialize(value) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParamTable = Record<string, UrlParam<any>>;
type ParamValue<P> = P extends UrlParam<infer T> ? T : never;
export type LinkValues<Table extends ParamTable> = { [K in keyof Table]: ParamValue<Table[K]> | undefined };
export type LinkUpdate<Table extends ParamTable> = { [K in keyof Table]?: ParamValue<Table[K]> | null };

/** Every parameter of a view's table read from a link; each undefined when absent or unusable. */
export function readLink<Table extends ParamTable>(search: string | URLSearchParams, table: Table): LinkValues<Table> {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out = {} as LinkValues<Table>;
  for (const name of Object.keys(table) as (keyof Table)[]) out[name] = readUrlParam(sp, table[name]) as LinkValues<Table>[typeof name];
  return out;
}

/** The URL update for the given values of a view's table; a value given as null or at its default is removed. */
export function linkUpdate<Table extends ParamTable>(table: Table, values: LinkUpdate<Table>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const name of Object.keys(values) as (keyof Table)[]) Object.assign(out, urlParamUpdate(table[name], values[name]));
  return out;
}

/** The current page's link (empty outside a browser). */
export function currentSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}
