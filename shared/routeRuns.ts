/** The hours a route runs, read from its published rows (moved here from scripts/build-agency-page-summaries.ts, CIV-1840, so a Worker can import it). */
import { TIME_PERIODS } from './config';
import type { RouteDepartureSpan } from './routeProperties';
import type { AgencyPageRoute } from './agencyPages';

/** The agency page's period columns, by the map's period key. */
const COLUMN_OF_PERIOD: Partial<Record<string, 'am' | 'midday' | 'pm' | 'evening' | 'overnight'>> = { amPeak: 'am', midday: 'midday', pmPeak: 'pm', evening: 'evening', overnight: 'overnight' };

type StretchHours = { departuresByHour?: Record<string, number> | null; span?: RouteDepartureSpan | null };

/**
 * CIV-1605, CIV-1611: the weekday hours a route runs, its exact first and last times, and the exact ends of each break
 * inside its day. Read from each direction's stretches (stretchMeta main and tails) and rows: the hours with departures at
 * their reference stops, and their spans, the same times the period edges are read from. An end any list can't give
 * exactly is left out; a break end it can't give is put at the hour's edge on the break's side, so the bar never shows
 * service that isn't there. A release built before spans were published falls back to the rows' own departuresByHour,
 * with an exact end only where a period edge falls in that first or last hour, and no bar when the day has a break (its
 * ends aren't known). Null when the data has no per-hour departures.
 */
export function routeRuns(
  rows: ReadonlyArray<{ departuresByHour?: Record<string, number> | null; departureSpan?: RouteDepartureSpan | null; stretchMeta?: { main?: StretchHours | null; tails?: StretchHours[] } | null }>,
  edge: AgencyPageRoute['edge'],
): AgencyPageRoute['runs'] | null {
  // Every list a route's hours are read from: each row's own (departuresByHour with departureSpan) and its stretches'.
  const lists: StretchHours[] = rows.flatMap(p => [
    { departuresByHour: p.departuresByHour, span: p.departureSpan },
    p.stretchMeta?.main,
    ...(p.stretchMeta?.tails ?? []),
  ]).filter((s): s is StretchHours => !!s && Object.values(s.departuresByHour ?? {}).some(n => n > 0));
  if (lists.length > 0 && lists.every(s => s.span)) {
    const hoursOf = (s: StretchHours) => new Set(Object.entries(s.departuresByHour ?? {}).filter(([, n]) => n > 0).map(([h]) => Number(h)));
    const listHours = lists.map(hoursOf);
    const sorted = [...new Set(listHours.flatMap(h => [...h]))].sort((a, b) => a - b);
    const inHour = (t: number | undefined, h: number) => t != null && Math.floor(t / 60) === h ? t : undefined;
    const firsts = lists.map(s => s.span!.first);
    const lasts = lists.map(s => s.span!.last);
    const first = firsts.every(t => t != null) ? Math.min(...(firsts as number[])) : undefined;
    const last = lasts.every(t => t != null) ? Math.max(...(lasts as number[])) : undefined;
    // One break per run of empty hours: from the latest departure before it to the earliest after it, over every list.
    const gaps: Array<[number, number]> = [];
    for (let i = 1; i < sorted.length; i++) {
      const [before, after] = [sorted[i - 1], sorted[i]];
      if (after === before + 1) continue;
      // A list without an exact end there falls back to any departure it names in that hour, else the hour's edge:
      // either way the break is drawn wider, never narrower.
      const known = (s: StretchHours, h: number) => [s.span!.first, s.span!.last, ...(s.span!.gaps ?? []).flat()].filter((t): t is number => inHour(t, h) != null);
      const starts = lists.flatMap((s, k) => listHours[k].has(before)
        ? [[s.span!.last, ...(s.span!.gaps ?? []).map(g => g[0])].map(t => inHour(t, before)).find(t => t != null) ?? Math.max(before * 60, ...known(s, before))] : []);
      const ends = lists.flatMap((s, k) => listHours[k].has(after)
        ? [[s.span!.first, ...(s.span!.gaps ?? []).map(g => g[1])].map(t => inHour(t, after)).find(t => t != null) ?? Math.min(after * 60 + 60, ...known(s, after))] : []);
      gaps.push([Math.max(...starts), Math.min(...ends)]);
    }
    // Each end must sit in the first or last hour with departures, or it isn't the same fact.
    return {
      hours: sorted,
      ...(first != null && Math.floor(first / 60) === sorted[0] ? { first } : {}),
      ...(last != null && Math.floor(last / 60) === sorted[sorted.length - 1] ? { last } : {}),
      ...(gaps.length ? { gaps } : {}),
    };
  }
  const hours = new Set<number>();
  for (const p of rows) for (const [h, n] of Object.entries(p.departuresByHour ?? {})) if (n > 0) hours.add(Number(h));
  if (hours.size === 0) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  // Without spans a break's ends aren't known, and drawing it to the hour would show service that isn't there.
  if (sorted.some((h, i) => i > 0 && h > sorted[i - 1] + 1)) return null;
  const columnAt = (hour: number) => {
    const period = TIME_PERIODS.find(t => hour >= t.startHour && hour < t.endHour);
    return period ? COLUMN_OF_PERIOD[period.key] : undefined;
  };
  const firstHour = sorted[0];
  const lastHour = sorted[sorted.length - 1];
  const from = edge?.[columnAt(firstHour) ?? 'am']?.from;
  const until = edge?.[columnAt(lastHour) ?? 'am']?.until;
  return {
    hours: sorted,
    ...(columnAt(firstHour) && from != null && Math.floor(from / 60) === firstHour ? { first: from } : {}),
    ...(columnAt(lastHour) && until != null && Math.floor(until / 60) === lastHour ? { last: until } : {}),
  };
}
