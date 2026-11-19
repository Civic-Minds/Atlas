/**
 * "Now" for the schedule tools (#1627): the agency's local time, the day type and the Atlas period that time falls in, so
 * an assistant asked about "right now" passes "now" instead of guessing the period. Pure (no files, no network): the
 * hosted Worker uses it too. ATLAS_MCP_NOW_AT (unix seconds) fixes the clock for tests and checks.
 */
import { PERIOD_LABELS, PERIOD_KEYS, formatPeriodRange, type PeriodKey } from '../../shared/config';
import { dayTypeOfDow, type DayType } from '../../shared/rules/days';
import { periodKeyForHour } from '../../shared/rules/periods';
import { LIVE_AGENCY_TIMEZONES } from '../../shared/livePollingConfig';

export interface NowInfo {
  day: DayType;
  period: PeriodKey;
  /** Minutes after the service day's midnight, as the schedule writes them (1:30 AM after a weekday is 25:30). */
  minutes: number;
  timeZone: string;
  /** What was used, in words: "Weekday, Midday (9 AM–3 PM): it's 1:40 PM Tue in America/Toronto". */
  used: string;
  /** The period after this one, for "no scheduled service now". */
  next: { day: DayType; period: PeriodKey; label: string };
  holidays: string;
}

const env = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
/** The clock in milliseconds: ATLAS_MCP_NOW_AT (unix seconds) when set, else the real time. */
export const nowMs = () => (env().ATLAS_MCP_NOW_AT ? Number(env().ATLAS_MCP_NOW_AT) * 1000 : Date.now());

/** True when a period or time argument asks for "now". */
export const isNow = (v: unknown) => typeof v === 'string' && /^\s*(now|right now|currently)\s*$/i.test(v);

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The agency's "now". The time zone is the agency's own (config/agencies/<slug>.json, from its feed), else Live's table;
 * none at all throws, so an answer never uses the wrong clock. Before 6 AM counts as the previous day's service (the late
 * and overnight periods run to 6 AM, as the schedule writes 25:00 and later), so 1 AM Saturday is Friday's Weekday late period.
 */
export function agencyNow(a: { slug: string; name: string }, timeZone: string | null | undefined, ms = nowMs()): NowInfo {
  const tz = timeZone || LIVE_AGENCY_TIMEZONES[a.slug];
  if (!tz) throw new Error(`Atlas has no time zone for ${a.name}, so it can't tell what "now" is there. Ask for a part of the day instead.`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  const hour = Number(parts.hour) % 24, minute = Number(parts.minute), dow = DOW.indexOf(parts.weekday);
  const early = hour < 6;
  const day = dayTypeOfDow(early ? (dow + 6) % 7 : dow);
  const period = periodKeyForHour(hour)!;
  const clock = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  const i = PERIOD_KEYS.indexOf(period);
  const next = i < PERIOD_KEYS.length - 1
    ? { day, period: PERIOD_KEYS[i + 1] }
    : { day: dayTypeOfDow(early ? dow : (dow + 1) % 7), period: PERIOD_KEYS[0] };
  return {
    day, period, minutes: (early ? hour + 24 : hour) * 60 + minute, timeZone: tz,
    used: `${day}, ${PERIOD_LABELS[period]} (${formatPeriodRange(period)}): it's ${clock} ${parts.weekday} in ${tz}${early ? `, still the previous day's service` : ''}`,
    next: { ...next, label: `${next.day}, ${PERIOD_LABELS[next.period]} (${formatPeriodRange(next.period)})` },
    holidays: "Atlas reads the day of the week only, not holidays: on a public holiday the agency may run a Sunday or holiday schedule instead.",
  };
}
