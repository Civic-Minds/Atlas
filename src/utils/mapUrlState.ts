import { PERIOD_KEYS } from '../../shared/config';
import type { DayType, TimePeriod } from '../hooks/useIntervalStats';
import { DAY_TYPES } from '../../shared/dayTypes';

/**
 * The map view's link parameters, declared once (CIV-1011 #11): each one's key, the older names a
 * shared link may still use, how a value is read (an unusable value counts as absent) and how it is
 * written. Every read and write of these goes through here. Saved preferences stay with their
 * settings: a value read here only says what the link asked for.
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

export const MAP_URL = {
  /** Frequency filter in minutes; Infinity is "All". 60 is the default and is left out of the URL. */
  headway: {
    key: 'h', aliases: ['headway', 'max'], presence: 'nonEmpty',
    parse: raw => {
      if (raw === 'all' || raw === 'inf' || raw === 'Infinity') return Infinity;
      const n = Number(raw);
      return isFinite(n) && n > 0 ? n : undefined;
    },
    serialize: value => (value === Infinity ? 'all' : value !== 60 ? String(value) : null),
  } satisfies UrlParam<number>,
  /** Time period; "all" is left out of the URL. */
  period: {
    key: 'p', aliases: ['period'], presence: 'nonEmpty',
    parse: raw => (raw === 'all' || (PERIOD_KEYS as readonly string[]).includes(raw) ? raw as TimePeriod : undefined),
    serialize: value => (value !== 'all' ? value : null),
  } satisfies UrlParam<TimePeriod>,
  day: {
    key: 'day', aliases: ['d'], presence: 'nonEmpty',
    parse: raw => ((DAY_TYPES as readonly string[]).includes(raw) ? raw as DayType : undefined),
    serialize: value => value,
  } satisfies UrlParam<DayType>,
  /** Irregular service hidden (the default) unless the link says span=0. */
  hideSpan: {
    key: 'span', presence: 'any',
    parse: raw => raw !== '0',
    serialize: value => (value ? null : '0'),
  } satisfies UrlParam<boolean>,
  /** Part-time service hidden (the default) unless the link says limited=0. */
  hideLimited: {
    key: 'limited', presence: 'any',
    parse: raw => raw !== '0',
    serialize: value => (value ? null : '0'),
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
