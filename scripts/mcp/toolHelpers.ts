/**
 * Helpers the MCP's tool handlers share (CIV-1864): reading an agency, a period or a time window from the arguments,
 * map links, and the notes answers carry.
 */
import { clockTime } from '../../shared/timeText';
import * as data from './atlasData';
import { agencyNow, isNow, type NowInfo } from './nowClock';
import type { PeriodKey } from '../../shared/config';
import type { DayType } from '../../shared/rules/days';
import { PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';
import { SITE_URL } from '../../shared/rules/paths';
import { TIME_PERIODS } from '../../shared/rules/periods';
import { MAP_URL } from '../../src/utils/urlSchema';
import { AGENCIES_PARAM } from '../../src/utils/shareUrlState';
import { buildRouteKey } from '../../src/utils/routeKey';
import { isoDate } from '../../shared/dateText';
import { FEED_EXPIRING_DAYS } from '../../shared/rules/limits';
import { PERIODS } from './toolDefs';

export type Args = Record<string, unknown>;

/**
 * A link to the same view on the Atlas map, built from the map's own link parameters (src/utils/urlSchema.ts): the
 * route card, or the agencies with a frequency filter, a day and a part of the day. The map always shows the live
 * release, so a link opens on the newest schedule; the answer's scheduleValidThrough says which one that is.
 */
export function mapLink(view: { route?: { agency: string; routeId: string }; agencies?: string[]; day?: string; period?: string; every?: number }): string {
  const q = new URLSearchParams();
  if (view.agencies?.length) q.set(AGENCIES_PARAM, view.agencies.join('.'));
  if (view.route) q.set(MAP_URL.route.key, buildRouteKey(view.route.agency, view.route.routeId));
  if (view.every != null && (PUBLIC_TIER_MAXES as readonly number[]).includes(view.every)) q.set(MAP_URL.headway.key, MAP_URL.headway.serialize(view.every));
  if (view.period) q.set(MAP_URL.period.key, view.period);
  if (view.day) q.set(MAP_URL.day.key, view.day);
  return `${SITE_URL}/?${q.toString()}`;
}

/**
 * A time window for the service day. A clock window that starts before the first part of the day (12 AM–3 AM) can mean
 * the hours after midnight that belong to the day's late night (24:00–27:00), where the schedule writes them, or the
 * hours at its start (5 AM). Both are read: the starts that fall in the window shifted a day, folded into it.
 */
export function startsInWindow(starts: readonly number[], w: { start: number; end: number }): number[] {
  return starts.filter(t => windowHas(t, w)).map(t => (t >= w.end ? t - 1440 : t));
}

/** Whether a departure (minutes in the service day) falls in a window, reading an early-morning window both ways (see startsInWindow). */
export function windowHas(t: number, w: { start: number; end: number }): boolean {
  if (t >= w.start && t < w.end) return true;
  return w.start < TIME_PERIODS[0].startHour * 60 && w.end <= 1440 && t >= w.start + 1440 && t < w.end + 1440;
}
export const validThrough = (a: { lastFeedExpiry?: string | null }) => isoDate(a.lastFeedExpiry);

/**
 * CIV-2081: an answer whose schedule ends within FEED_EXPIRING_DAYS (scheduleValidThrough, YYYY-MM-DD) carries a
 * warning beside it, so the figures aren't read as lasting. Every tool's answer passes through here on both servers.
 */
export function scheduleEndsSoon(result: unknown, today = new Date().toISOString().slice(0, 10)): unknown {
  const end = (result as { scheduleValidThrough?: unknown } | null)?.scheduleValidThrough;
  if (typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today) return result;
  const days = Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
  if (days > FEED_EXPIRING_DAYS) return result;
  return { ...(result as object), scheduleEndsSoon: `This schedule ends ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} (${end}). Atlas has no figures past that date until the agency publishes its next schedule; say so beside the figures.` };
}

export function withScheduleWarning<T extends Record<string, (args: Args) => unknown | Promise<unknown>>>(handlers: T): T {
  return Object.fromEntries(Object.entries(handlers).map(([name, h]) => [name, async (args: Args) => scheduleEndsSoon(await h(args))])) as T;
}
export const SOURCE = "Atlas's published schedule data for this agency.";

export async function needAgency(q: unknown) {
  const a = await data.findAgency(String(q ?? ''));
  if (!a) {
    const elsewhere = await data.agencyNotOnThisServer(String(q ?? ''));
    if (elsewhere) throw new Error(await data.notOnThisServerNote([elsewhere.name]));
    throw new Error(`No agency matching "${q}" has data here. Use list_agencies to search.`);
  }
  return a;
}
export function needPeriod(p: unknown) {
  const k = data.parsePeriod(p);
  if (!k) throw new Error(`Unknown period "${p}". Use one of: ${PERIODS.join(', ')}.`);
  return k;
}
/** A time window from from_time/to_time, or null when neither is given. */
export function window(args: Args): { start: number; end: number; label: string; periods: string[] } | null {
  if (args.from_time == null && args.to_time == null) return null;
  const start = data.parseClock(args.from_time ?? '0:00'), clockEnd = data.parseClock(args.to_time ?? '24:00');
  // A window that ends earlier on the clock runs past midnight (10 PM to 4 AM), read as the schedule writes it (to 28:00).
  const end = clockEnd != null && start != null && clockEnd <= start && clockEnd + 1440 - start <= 1440 ? clockEnd + 1440 : clockEnd;
  if (start == null || end == null || end <= start) throw new Error('Give the window as from_time and to_time, such as "10:00" and "18:00", or "22:00" and "04:00" past midnight.');
  return { start, end, label: `${clockTime(start)}–${clockTime(end)}`, periods: data.periodsIn(start, end) };
}
/** The asked agency plus any also_agencies, each once. */
export async function withAlso(a: Awaited<ReturnType<typeof needAgency>>, args: Args) {
  const more = await Promise.all((Array.isArray(args.also_agencies) ? args.also_agencies : []).map(q => needAgency(q)));
  return [a, ...more].filter((x, i, all) => all.findIndex(y => y.slug === x.slug) === i);
}
/** Trip times read the schedule file on this Mac, which can be older than the schedule behind the map's figures: say so first. */
export const staleNote = (a: { lastFeedExpiry?: string | null }, ends: string | null) => (ends && a.lastFeedExpiry && ends < a.lastFeedExpiry
  ? { scheduleWarning: `These trip times come from an older schedule file on this Mac (service to ${isoDate(ends)}); the map's figures use the current one (to ${validThrough(a)}). Times may have changed since.` }
  : {});
export const windowNote = (w: { label: string; periods: string[] }) => `The window ${w.label} overlaps these Atlas periods: ${w.periods.join(', ')}. Hourly figures are the typical wait in trips leaving that hour.`;

/** The agency's "now" (#1627): its local time, day type and Atlas period, from its own time zone. */
export async function nowAt(a: { slug: string; name: string }): Promise<NowInfo> { return agencyNow(a, await data.timeZoneOf(a.slug)); }
/** What "now" used, for the answer, plus a no-service note when nothing is scheduled in this period. */
export const nowBlock = (n: NowInfo, noService = false) => ({
  now: { used: n.used, holidays: n.holidays },
  ...(noService ? { nowNote: `No scheduled service in this part of the day now. The next part of the day is ${n.next.label}; ask about it for the next service.` } : {}),
});
/** A period argument that may be "now": the period and day to read, and the "now" used, if any. */
export async function periodOrNow(a: { slug: string; name: string }, p: unknown, d: unknown): Promise<{ key: PeriodKey; dayType: DayType; now: NowInfo | null }> {
  if (!isNow(p)) return { key: needPeriod(p), dayType: data.parseDay(d), now: null };
  const now = await nowAt(a);
  return { key: now.period, dayType: d != null ? data.parseDay(d) : now.day, now };
}
/** A time window that may start "now": the hour from the agency's current time, on the service day's clock (1:30 AM after a weekday is 25:30). */
export async function windowOrNow(a: { slug: string; name: string }, args: Args): Promise<{ w: ReturnType<typeof window>; now: NowInfo | null }> {
  if (!isNow(args.from_time) && !isNow(args.to_time)) return { w: window(args), now: null };
  const now = await nowAt(a);
  const start = now.minutes, end = now.minutes + 60;
  return { w: { start, end, label: `${clockTime(start)}–${clockTime(end)}`, periods: data.periodsIn(start, end) }, now };
}

/**
 * CIV-2087 (#1685), Ryan picked option 1: each answer says which figure it gives. The frequency tools give the typical
 * wait; History and Changes give the map's grade. The numbers are unchanged.
 */
export const FIGURE_LABELS = {
  typical: 'the typical wait',
  grade: 'the slowest regular wait in this part of the day (the map\'s grade)',
} as const;
