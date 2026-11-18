/**
 * Helpers the MCP's tool handlers share (CIV-1864): reading an agency, a period or a time window from the arguments,
 * map links, and the notes answers carry.
 */
import { clockTime } from '../../shared/timeText';
import * as data from './atlasData';
import { PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';
import { SITE_URL } from '../../shared/rules/paths';
import { TIME_PERIODS } from '../../shared/rules/periods';
import { MAP_URL } from '../../src/utils/urlSchema';
import { AGENCIES_PARAM } from '../../src/utils/shareUrlState';
import { buildRouteKey } from '../../src/utils/routeKey';
import { isoDate } from '../../shared/dateText';
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
export const SOURCE = "Atlas's published schedule data for this agency.";

export async function needAgency(q: unknown) {
  const a = await data.findAgency(String(q ?? ''));
  if (!a) throw new Error(`No agency matching "${q}" has data here. Use list_agencies to search.`);
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
