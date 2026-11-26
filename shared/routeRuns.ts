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
/** The trips a route's rows run in a period, from their departures by hour (GTFS hours, so 25 is 1 AM). */
export function departuresInPeriod(rows: ReadonlyArray<{ departuresByHour?: Record<string, number> | null }>, period: string): number {
  const p = TIME_PERIODS.find(t => t.key === period);
  if (!p) return 0;
  let n = 0;
  for (const row of rows) for (const [h, c] of Object.entries(row.departuresByHour ?? {})) if (+h >= p.startHour && +h < p.endHour) n += c;
  return n;
}

/** The Night Service verdict: a route runs through the night when any of its rows runs its Overnight period (routeRunsByPeriod). */
export function runsAllNight(rows: ReadonlyArray<{ routeRunsByPeriod?: Partial<Record<string, boolean>> | null }>): boolean {
  return rows.some(p => p.routeRunsByPeriod?.overnight === true);
}

export function routeRuns(
  rows: ReadonlyArray<{ departuresByHour?: Record<string, number> | null; departureSpan?: RouteDepartureSpan | null; tripStartFirst?: number | null; tripStartLast?: number | null; routeRunsByPeriod?: Partial<Record<string, boolean>> | null; stretchMeta?: { main?: StretchHours | null; tails?: StretchHours[] } | null }>,
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
    let sorted = [...new Set(listHours.flatMap(h => [...h]))].sort((a, b) => a - b);
    const inHour = (t: number | undefined, h: number) => t != null && Math.floor(t / 60) === h ? t : undefined;
    const firsts = lists.map(s => s.span!.first);
    const lasts = lists.map(s => s.span!.last);
    let first = firsts.every(t => t != null) ? Math.min(...(firsts as number[])) : undefined;
    let last = lasts.every(t => t != null) ? Math.max(...(lasts as number[])) : undefined;
    // CIV-2229 (#1772, Ryan "1"): the first time is read where trips start (each trip's first stop), when a rider can first
    // board, not at the reference stops. Only when every row that gives
    // the bar a list (its own or a stretch's) has it; a trip before the day window (null) leaves the first out. A reference
    // stop's departure earlier than every counted start (a list holding trips the starts don't) stays the first.
    const hasList = (s: StretchHours | null | undefined) => !!s && Object.values(s.departuresByHour ?? {}).some(n => n > 0);
    const listRows = rows.filter(p => hasList(p) || hasList(p.stretchMeta?.main) || (p.stretchMeta?.tails ?? []).some(hasList));
    const boardings = listRows.map(p => p.tripStartFirst);
    // #1791: the last time is read where trips start too: the last boarding of the day's trips, none where a row has none (a
    // trip after the window, or a day that runs on into the night). Data without the field keeps the reference stops' last.
    const lastBoardings = listRows.map(p => p.tripStartLast);
    let lastBoardingHour: number | undefined;
    // A route that runs through the night (the Night Service verdict, routeRunsByPeriod's Overnight) has no last boarding:
    // its last trip before the morning isn't one (CTA 9, AC Transit 800).
    const allNight = runsAllNight(rows);
    if (allNight && lastBoardings.some(t => t !== undefined)) last = undefined;
    else if (lastBoardings.length > 0 && lastBoardings.every(t => t !== undefined)) {
      // A row with none of its own (its only trips leave before the day window, or it has no trips that day) doesn't hide
      // the others' last boarding (b-line 50: one 4:50 AM trip one way, the last boarding 3:40 PM the other way).
      const known = lastBoardings.filter((t): t is number => t != null);
      last = known.length > 0 ? Math.max(...known) : undefined;
      // The bar ends at the last boarding: the hours after it are a trip on its way, not service a rider can board. A last
      // boarding in an hour no list counts (a trip that leaves after the reference stops' last, or reaches them in a later
      // hour) ends the bar there, after a break.
      if (last != null) {
        const hi = Math.floor(last / 60);
        sorted = sorted.filter(h => h <= hi);
        if (sorted[sorted.length - 1] !== hi) { sorted.push(hi); lastBoardingHour = hi; }
      }
    }
    if (boardings.length > 0 && boardings.every(t => t !== undefined)) {
      const start = boardings.every(t => t != null) ? Math.min(...(boardings as number[])) : undefined;
      first = start == null ? undefined : first != null ? Math.min(start, first) : start;
      // The bar starts at the first boarding: the hours before the reference stops' first hour are service on the way
      // there, not a break.
      const lo = first != null ? Math.floor(first / 60) : undefined;
      if (lo != null && sorted.length > 0 && lo < sorted[0]) sorted = [...Array.from({ length: sorted[0] - lo }, (_, i) => lo + i), ...sorted];
    }
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
      // #1791: a bar ended at a last boarding no list counts: the break ends at that boarding.
      if (after === lastBoardingHour && ends.length === 0 && last != null) ends.push(last);
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
