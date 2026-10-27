/**
 * One reference-date model (plan: Atlas-worktrees/_reports/reference-date-plan-2026-10-26.md, stage 1).
 *
 * The pipeline today guesses one reference date per feed and reads each day type near it, with a
 * guard per feed shape that went wrong (#764, #921, #1019, #1038, #1050, #1082, CIV-469). This
 * module replaces the guess with a record of the feed and one rule for every agency:
 *
 * - buildServiceDayTable lists, for each real date from a week before the anchor to 8 weeks after
 *   it, the service_ids that run that date (plain GTFS rules) and the trips per route they carry.
 * - pickServiceWeek reads one real Monday-Sunday week from that table. Each day of the week takes
 *   the trips-per-route pattern seen on the most weeks of the service period in force, so a
 *   holiday, a bus bridge, a game day or a break week is a day that loses the vote, with no
 *   holiday list and no fixed window.
 *
 * Pure: no I/O, no clock (the anchor is passed in). Not wired into processing yet; nothing reads it.
 */
import { pipelineRunDateYmd } from './pipelineTimeZone.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type DayName = (typeof DAY_NAMES)[number];

/** Days before the anchor the table starts (so the anchor's own week is always whole). */
export const WINDOW_DAYS_BEFORE = 7;
/**
 * Days before the anchor read as history for a current period under two weeks long, only to tell
 * whether a thin day's services are the usual pattern or a one-off (Embark 302, stage 4). Never part
 * of the window: day selection and periods still read the 7 days before the anchor.
 */
export const HISTORY_DAYS_BEFORE = 28;
/** A current period with fewer table days than this reads the history above. */
export const SHORT_PERIOD_DAYS = 14;
/** Weeks from the anchor the table runs to: the anchor plus 55 days, 8 whole weeks. */
export const WINDOW_WEEKS_AFTER = 8;
/** Weeks a day's new pattern must hold before it counts as a new period, so a one- or two-week holiday, bridge or break is not one. */
export const MIN_NEW_PERIOD_WEEKS = 3;
/** Weeks of the old pattern needed before a change can be called. */
export const MIN_OLD_PERIOD_WEEKS = 2;
/** Share of the weeks looked at (up to 4 each side) that must carry the old and the new pattern. */
export const PERIOD_MAJORITY = 0.75;
/** A day seen on fewer weeks than this in its period has a thin vote, broken by the whole window (HSR 41, stage 4). */
export const MIN_VOTE_WEEKS = 3;
/** Weeks each of the two signatures of a two-week cycle must hold (Kingston 60's every-other-Sunday service, stage 4). */
export const MIN_CYCLE_WEEKS_EACH = 2;
/** Weeks looked at on each side of a possible period change. */
const PERIOD_LOOK_WEEKS = 4;

const DOW_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

// Date math in UTC epoch days, so the result does not depend on the machine's time zone.
function dayNumber(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86400000;
}
function ymdOf(day: number): string {
  const d = new Date(day * 86400000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** 0 = Monday ... 6 = Sunday. */
function dayIndex(day: number): number {
  return (new Date(day * 86400000).getUTCDay() + 6) % 7;
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{8}$/.test(s);

/**
 * The anchor every reading starts from: the day after the run, in the pipeline's time zone
 * (published data is in use from the next morning). Replaces the separate local and UTC
 * "today" copies (#1135).
 */
export function serviceAnchor(runDateYmd: string = pipelineRunDateYmd()): string {
  return ymdOf(dayNumber(runDateYmd) + 1);
}

export interface ServiceDay {
  date: string;
  day: DayName;
  /** Every service_id that runs this date, sorted (including any with no trips). */
  services: string[];
  /** Trips per route, `route:n` sorted by route, comma-joined. Empty when nothing with trips runs. */
  signature: string;
}

export interface ServiceDayTable {
  anchor: string;
  /** First and last date any service with trips can run, from the calendar rows (null: none). */
  span: { start: string; end: string } | null;
  /** Dates the table covers (null: no service anywhere). */
  window: { start: string; end: string } | null;
  /**
   * How the window was placed: around the anchor; around the anchor but starting earlier because
   * the feed ends inside the 8 weeks (so it still holds up to 8 weeks of service); the feed's last
   * 8 weeks with service (nothing runs from the anchor on, an archived zip); the first 8 weeks of
   * service after a gap (nothing runs in the 8 weeks from the anchor, but service resumes later);
   * or empty.
   */
  source: 'anchor' | 'anchor-feed-end' | 'last-weeks' | 'first-weeks' | 'empty';
  /** One row per date in the window, in date order. */
  days: ServiceDay[];
  /**
   * Dates from HISTORY_DAYS_BEFORE before the anchor up to the window's start, for a window placed
   * around the anchor only (source 'anchor'). Read only by pickServiceWeek's one-off check.
   */
  history?: ServiceDay[];
}

export interface ServiceDayTableInput {
  calendar: readonly GtfsCalendar[];
  calendarDates: readonly GtfsCalendarDate[];
  trips: ReadonlyArray<{ service_id: string; route_id: string }>;
  /** YYYYMMDD, normally serviceAnchor(). */
  anchor: string;
  daysBefore?: number;
  weeksAfter?: number;
}

/**
 * Builds the date-by-date service table (plan 3a). A service runs on a date when its calendar.txt
 * range covers the date and its weekday flag is set, unless calendar_dates removes it (type 2);
 * calendar_dates additions (type 1) run whatever their service's calendar row says. Unlike
 * servicesRunningOn (serviceDates.ts), additions are not filtered by day kind: the table records
 * the feed as published, and an odd day (a Sunday timetable on a holiday Wednesday) then loses the
 * vote in pickServiceWeek.
 */
export function buildServiceDayTable(input: ServiceDayTableInput): ServiceDayTable {
  const { calendar, calendarDates, trips, anchor } = input;
  const daysBefore = input.daysBefore ?? WINDOW_DAYS_BEFORE;
  const daysAfter = 7 * (input.weeksAfter ?? WINDOW_WEEKS_AFTER) - 1;

  const tripsByService = new Map<string, Map<string, number>>();
  for (const t of trips) {
    const byRoute = tripsByService.get(t.service_id) ?? new Map<string, number>();
    byRoute.set(t.route_id, (byRoute.get(t.route_id) ?? 0) + 1);
    tripsByService.set(t.service_id, byRoute);
  }
  const rows = calendar
    .filter(c => isYmd(c.start_date) && isYmd(c.end_date))
    .map(c => ({ id: c.service_id, start: dayNumber(c.start_date), end: dayNumber(c.end_date), flags: DOW_FIELDS.map(f => c[f] === '1') }));
  const changesByDay = new Map<number, Array<{ id: string; add: boolean }>>();
  for (const cd of calendarDates) {
    if (!isYmd(cd.date) || (cd.exception_type !== '1' && cd.exception_type !== '2')) continue;
    const n = dayNumber(cd.date);
    changesByDay.set(n, [...(changesByDay.get(n) ?? []), { id: cd.service_id, add: cd.exception_type === '1' }]);
  }

  const servicesOn = (n: number): string[] => {
    const dow = dayIndex(n);
    const running = new Set<string>();
    for (const r of rows) if (r.flags[dow] && r.start <= n && n <= r.end) running.add(r.id);
    const changes = changesByDay.get(n) ?? [];
    for (const c of changes) if (!c.add) running.delete(c.id);
    for (const c of changes) if (c.add) running.add(c.id);
    return [...running].sort();
  };
  const signatureOf = (services: readonly string[]): string => {
    const counts = new Map<string, number>();
    for (const id of services) for (const [route, k] of tripsByService.get(id) ?? []) counts.set(route, (counts.get(route) ?? 0) + k);
    return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([r, k]) => `${r}:${k}`).join(',');
  };
  const hasService = (n: number): boolean => signatureOf(servicesOn(n)) !== '';

  // The feed's span: rows and additions of services that carry trips. Placeholder rows with no
  // weekday flag set do not extend it.
  const bearing = (id: string) => tripsByService.has(id);
  const spanDays: number[] = [];
  for (const r of rows) if (bearing(r.id) && r.flags.some(Boolean) && r.start <= r.end) spanDays.push(r.start, r.end);
  for (const [n, changes] of changesByDay) if (changes.some(c => c.add && bearing(c.id))) spanDays.push(n);
  const anchorDay = dayNumber(anchor);
  const empty: ServiceDayTable = { anchor, span: null, window: null, source: 'empty', days: [] };
  if (spanDays.length === 0) return empty;
  const lo = Math.min(...spanDays);
  const hi = Math.max(...spanDays);
  const span = { start: ymdOf(lo), end: ymdOf(hi) };

  // Places where service can start or stop: row starts and ends, additions, and the days next to
  // removals. Searching from these (7 days each) finds the first or last date with service without
  // walking a row to its far end (Clemson runs to 2050, #1040).
  const firstServiceFrom = (from: number): number | null => {
    const points = new Set<number>([from]);
    for (const r of rows) if (r.start >= from) points.add(r.start);
    for (const [n, changes] of changesByDay) if (n >= from) points.add(changes.some(c => c.add) ? n : n + 1);
    for (const p of [...points].sort((a, b) => a - b)) {
      for (let n = p; n < p + 7 && n <= hi; n++) if (n >= lo && hasService(n)) return n;
    }
    return null;
  };
  const lastServiceBefore = (before: number): number | null => {
    const points = new Set<number>([Math.min(before, hi)]);
    for (const r of rows) if (r.end <= before) points.add(r.end);
    for (const [n, changes] of changesByDay) if (n <= before) points.add(changes.some(c => c.add) ? n : n - 1);
    for (const p of [...points].sort((a, b) => b - a)) {
      for (let n = p; n > p - 7 && n >= lo; n--) if (n <= hi && hasService(n)) return n;
    }
    return null;
  };

  let start: number;
  let end: number;
  let source: ServiceDayTable['source'];
  const aheadEnd = anchorDay + daysAfter;
  const firstAhead = firstServiceFrom(Math.max(anchorDay, lo));
  if (firstAhead != null && firstAhead <= aheadEnd) {
    // The feed's service ends inside the 8 weeks when its last date with service is a whole week
    // or more before the window's end. The rows can run on past it with every date removed (SLO
    // Transit's main services, removed daily from Oct 20 to the 2027 row end), so this is read
    // from the dates, not the rows' end_date.
    const last = lastServiceBefore(Math.min(hi, aheadEnd));
    if (last != null && last <= aheadEnd - 7) {
      // Start earlier so the vote still covers up to 8 weeks of service, as for an archived zip,
      // and stop at the last date with service. Otherwise a holiday fortnight at the feed's end
      // outvotes the one or two regular weeks left (CIV-469; New Year's Day in History's winter
      // feed), and the empty weeks after the end read as a new, empty period.
      end = last;
      start = Math.max(lo, Math.min(anchorDay - daysBefore, last - daysAfter));
      source = 'anchor-feed-end';
    } else {
      end = Math.min(hi, aheadEnd);
      start = Math.max(lo, anchorDay - daysBefore);
      source = 'anchor';
    }
  } else if (firstAhead != null) {
    // Nothing runs in the 8 weeks from the anchor but service resumes later (a seasonal pause):
    // the first 8 weeks of service from then.
    start = firstAhead;
    end = Math.min(hi, firstAhead + daysAfter);
    source = 'first-weeks';
  } else {
    // Nothing runs from the anchor on (an archived zip read after it ended): its last 8 weeks.
    const last = lastServiceBefore(anchorDay - 1);
    if (last == null) return { ...empty, span };
    start = Math.max(lo, last - daysAfter);
    end = last;
    source = 'last-weeks';
  }

  const row = (n: number): ServiceDay => {
    const services = servicesOn(n);
    return { date: ymdOf(n), day: DAY_NAMES[dayIndex(n)], services, signature: signatureOf(services) };
  };
  const days: ServiceDay[] = [];
  for (let n = start; n <= end; n++) days.push(row(n));
  const history: ServiceDay[] = [];
  if (source === 'anchor') for (let n = Math.max(lo, anchorDay - HISTORY_DAYS_BEFORE); n < start; n++) history.push(row(n));
  return { anchor, span, window: { start: ymdOf(start), end: ymdOf(end) }, source, days, history };
}

/** Weeks of the table as a grid: one row per Monday-Sunday week, a day's cell null when the table has no row for it. */
interface WeekGrid {
  mondays: number[];
  cells: Array<Array<ServiceDay | null>>;
}

function weekGrid(table: ServiceDayTable): WeekGrid {
  if (table.days.length === 0) return { mondays: [], cells: [] };
  const first = dayNumber(table.days[0].date);
  const last = dayNumber(table.days[table.days.length - 1].date);
  const firstMonday = first - dayIndex(first);
  const byDay = new Map(table.days.map(d => [dayNumber(d.date), d]));
  const mondays: number[] = [];
  const cells: Array<Array<ServiceDay | null>> = [];
  for (let m = firstMonday; m <= last; m += 7) {
    mondays.push(m);
    cells.push(DAY_NAMES.map((_, i) => byDay.get(m + i) ?? null));
  }
  return { mondays, cells };
}

/**
 * The table's periods and straddling weeks, by window week. The split also reads the history before
 * the window (CIV-1011, the manager 2026-10-27): with only the 7 days before the anchor in view, a
 * holiday fortnight at the window's start (a Dec 28 run: Dec 24 and 31 both holiday Thursdays) looked
 * like the period in force, and the map read the holiday (SEPTA weekdays at a third of their trips,
 * TriMet and King County's New Year's Day as a Friday). With the weeks before it in view, the
 * fortnight is a break inside the regular period. Votes and day selection still read the window only.
 */
function windowPeriods(table: ServiceDayTable, grid: WeekGrid): { periods: number[][]; straddling: number[]; starts: number[] } {
  const own = () => { const split = splitPeriods(grid); return { ...split, starts: split.periods.map(ws => grid.mondays[ws[0]]) }; };
  if (!table.history?.length || grid.mondays.length === 0) return own();
  const full = weekGrid({ ...table, days: [...table.history, ...table.days] });
  const offset = full.mondays.indexOf(grid.mondays[0]);
  if (offset < 0) return own();
  const split = splitPeriods(full);
  const inWindow = (w: number) => w - offset >= 0 && w - offset < grid.mondays.length;
  const kept = split.periods.filter(ws => ws.some(inWindow));
  return {
    periods: kept.map(ws => ws.filter(inWindow).map(w => w - offset)),
    straddling: split.straddling.filter(inWindow).map(w => w - offset),
    // Where each period starts, history included: a day the window cuts off reads from there.
    starts: kept.map(ws => full.mondays[ws[0]]),
  };
}

function mode(values: readonly string[]): { value: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
}

export interface ServicePeriodSplit {
  /** Mondays (YYYYMMDD) of the weeks each period holds, in order. */
  periods: string[][];
  /** Mondays of weeks that straddle a period change (part old, part new); never read. */
  straddling: string[];
}

/**
 * Splits the table into service periods (plan 3b rule 1). A period changes at a week when some day
 * of the week switches to a new pattern and keeps it: the weeks before mostly carry the old pattern
 * (at least MIN_OLD_PERIOD_WEEKS, PERIOD_MAJORITY of up to 4 weeks) and the weeks from the change
 * mostly carry the new one (at least MIN_NEW_PERIOD_WEEKS). All seven days are checked, because a
 * new schedule can keep the same weekday trips and change only the weekend (VTA, #1082). A one- or
 * two-week holiday, a bus-bridge weekend, a game day or service that alternates week by week does
 * not hold long enough, so it stays inside its period and loses the vote there. When days change
 * in neighbouring weeks (a schedule starting mid-week), the weeks between them straddle the change.
 */
function splitPeriods(grid: WeekGrid): { periods: number[][]; straddling: number[] } {
  const n = grid.mondays.length;
  const changes = new Set<number>();
  for (let d = 0; d < 7; d++) {
    const sig = grid.cells.map(week => week[d]?.signature ?? null);
    for (let b = 1; b < n; b++) {
      if (sig[b] == null || sig[b - 1] == null) continue;
      const before = sig.slice(Math.max(0, b - PERIOD_LOOK_WEEKS), b).filter((s): s is string => s != null);
      const after = sig.slice(b, b + PERIOD_LOOK_WEEKS).filter((s): s is string => s != null);
      if (before.length < MIN_OLD_PERIOD_WEEKS || after.length < MIN_NEW_PERIOD_WEEKS) continue;
      const oldMode = mode(before)!;
      const newMode = mode(after)!;
      if (oldMode.value === newMode.value || sig[b] !== newMode.value || sig[b - 1] === newMode.value) continue;
      if (oldMode.count < before.length * PERIOD_MAJORITY || newMode.count < after.length * PERIOD_MAJORITY) continue;
      changes.add(b);
    }
  }
  // Neighbouring change weeks are one change; the weeks between the first and last straddle it.
  const sorted = [...changes].sort((a, b) => a - b);
  const straddling: number[] = [];
  const starts: number[] = [0];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] - sorted[j] <= 1) j++;
    for (let w = sorted[i]; w < sorted[j]; w++) straddling.push(w);
    starts.push(sorted[j]);
    i = j + 1;
  }
  const periods: number[][] = [];
  for (let k = 0; k < starts.length; k++) {
    const weeks: number[] = [];
    const stop = k + 1 < starts.length ? starts[k + 1] : n;
    for (let w = starts[k]; w < stop; w++) if (!straddling.includes(w)) weeks.push(w);
    if (weeks.length > 0) periods.push(weeks);
  }
  return { periods, straddling };
}

/** The table's service periods and straddling weeks, by Monday (exported for tests and the shadow report). */
export function splitServicePeriods(table: ServiceDayTable): ServicePeriodSplit {
  const grid = weekGrid(table);
  const { periods, straddling } = windowPeriods(table, grid);
  return {
    periods: periods.map(weeks => weeks.map(w => ymdOf(grid.mondays[w]))),
    straddling: straddling.map(w => ymdOf(grid.mondays[w])),
  };
}

export interface SkippedDate {
  date: string;
  day: DayName;
  /** lost-vote: the date's trips differ from its day's usual pattern. period-change: its week straddles a period change. */
  reason: 'lost-vote' | 'period-change';
  detail: string;
}

export interface DayVote {
  /** The winning trips-per-route signature ('' = no service is usual on this day). */
  signature: string;
  /** Weeks of the period with that signature, and weeks with any row for this day. */
  weeks: number;
  of: number;
}

export interface ServiceWeek {
  /** Monday of the real week read; null when the period holds no whole week (a feed a few days long). */
  weekStart: string | null;
  /** The real date read for each day; null when the period has no such day (the day type stays empty). */
  dates: Record<DayName, string | null>;
  /** Service_ids running on each of those dates (empty when the date is null). */
  services: Record<DayName, string[]>;
  /** Days read from another date of the period because no whole week has every day on its usual pattern (rule 5). */
  substituted: DayName[];
  /** First and last table dates of the period read (null: empty table). */
  period: { start: string; end: string } | null;
  votes: Record<DayName, DayVote | null>;
  skipped: SkippedDate[];
}

const byDayName = <T>(f: (day: DayName, i: number) => T): Record<DayName, T> =>
  Object.fromEntries(DAY_NAMES.map((day, i) => [day, f(day, i)])) as Record<DayName, T>;

/**
 * The anchor week's vote when a day runs a two-week cycle in the period: the day has exactly two
 * signatures there, each on at least MIN_CYCLE_WEEKS_EACH weeks, and one of them falls on every
 * other week with no break (its weeks exactly two apart, every week between them present), with
 * the anchor's week inside that stretch or next to it. Kingston 60 runs on alternate Sundays; a
 * game day that repeats a week later, a holiday, or a third pattern breaks the cycle (CATA's
 * game-day Saturdays stay dropped). Null when there is no such cycle.
 */
function twoWeekCycle(grid: WeekGrid, weeks: readonly number[], anchorWeek: number, d: number): DayVote | null {
  const own = weeks.includes(anchorWeek) ? grid.cells[anchorWeek][d]?.signature : undefined;
  if (own == null) return null;
  const weeksBySig = new Map<string, number[]>();
  let present = 0;
  for (const w of weeks) {
    const c = grid.cells[w][d];
    if (!c) continue;
    present++;
    weeksBySig.set(c.signature, [...(weeksBySig.get(c.signature) ?? []), w]);
  }
  if (weeksBySig.size !== 2) return null;
  for (const ws of weeksBySig.values()) {
    if (ws.length < MIN_CYCLE_WEEKS_EACH || present - ws.length < MIN_CYCLE_WEEKS_EACH) return null;
  }
  for (const ws of weeksBySig.values()) {
    const everyOther = ws.every((w, i) => i === 0 || w - ws[i - 1] === 2);
    const between = Array.from({ length: ws[ws.length - 1] - ws[0] + 1 }, (_, i) => ws[0] + i);
    const unbroken = between.every(w => weeks.includes(w) && grid.cells[w][d] != null);
    if (everyOther && unbroken && anchorWeek >= ws[0] - 1 && anchorWeek <= ws[ws.length - 1] + 1) {
      return { signature: own, weeks: weeksBySig.get(own)!.length, of: present };
    }
  }
  return null;
}

/**
 * Picks one real week from the table (plan 3b, rules 1-5 and 7).
 *
 * 1. The service period in force on the anchor, read whole until its last day, so an old Saturday
 *    is never paired with new weekdays. A new timetable is never read before it starts (plan
 *    question 5, Ryan 2026-10-27: "why would we show anything other than what is running today").
 *    An anchor in the week a timetable changes reads the period its own day runs. With the anchor
 *    outside the table (an archived or not-yet-started feed), the nearest period.
 * 2. Each day of the week takes the signature seen on the most weeks of that period. When that
 *    vote is tied or thin (fewer than MIN_VOTE_WEEKS weeks of the day in the period), it goes to the
 *    period's signature seen on the most weeks of that day from the period's start to the table's
 *    end, so a one-off never beats a pattern that recurs (HSR 41: a two-Monday period tied a
 *    one-off 1:1, and the regular Monday continues after it); then to the signature
 *    seen nearest the anchor (the later date when two are equally near). A day on a two-week
 *    cycle in the period (two signatures, one on every other week with no break, the anchor's
 *    week inside it; see twoWeekCycle) takes the anchor week's own signature instead of the
 *    majority (Kingston 60, every other Sunday); rule 3 then reads a week of that same phase.
 * 3. The week read is the whole week of the period nearest the anchor where every day carries its
 *    vote (the later week on a tie). Days that lose the vote are logged as skipped: holidays, bus
 *    bridges, game days and break weeks, judged from the feed's own pattern only.
 * 4. Only whole weeks inside the feed's span and the table qualify, and straddling weeks never do.
 * 5. When no whole week has every day on its vote (a short feed), the whole week with the most
 *    such days is read and each other day reads the period's date nearest the anchor with its
 *    vote. A day with no date at all stays empty.
 * 7. Each day reads its own date, so per-day service_ids never stack and part-week routes stay
 *    part-week.
 */
export function pickServiceWeek(table: ServiceDayTable): ServiceWeek {
  const grid = weekGrid(table);
  const { periods, straddling, starts } = windowPeriods(table, grid);
  const emptyWeek: ServiceWeek = {
    weekStart: null, dates: byDayName(() => null), services: byDayName(() => []), substituted: [],
    period: null, votes: byDayName(() => null), skipped: [],
  };
  if (periods.length === 0) return emptyWeek;

  const anchorDay = dayNumber(table.anchor);
  const anchorMonday = anchorDay - dayIndex(anchorDay);
  const anchorWeek = (anchorMonday - grid.mondays[0]) / 7;

  // Rule 1: the period in force on the anchor. An anchor in a straddling week (the timetable
  // changes mid-week) reads the earlier period while its own day still runs the earlier pattern.
  let k = periods.findIndex(weeks => weeks[weeks.length - 1] >= anchorWeek);
  if (k < 0) k = periods.length - 1;
  if (k > 0 && periods[k][0] > anchorWeek && straddling.includes(anchorWeek)) {
    const d = dayIndex(anchorDay);
    const own = grid.cells[anchorWeek]?.[d]?.signature;
    const earlier = mode(periods[k - 1].map(w => grid.cells[w][d]?.signature).filter((s): s is string => s != null));
    if (own == null || own === earlier?.value) k--;
  }
  const weeks = periods[k];
  const distance = (n: number) => Math.abs(n - anchorDay);
  /** Nearer the anchor first; on a tie, the later one. */
  const nearer = (a: number, b: number) => distance(a) - distance(b) || b - a;

  // Rule 2: the vote per day.
  const anchorInPeriod = weeks.includes(anchorWeek);
  const votes = byDayName((_, d): DayVote | null => {
    const cells = weeks.map(w => grid.cells[w][d]).filter((c): c is ServiceDay => c != null);
    if (cells.length === 0) return null;
    const cycle = anchorInPeriod ? twoWeekCycle(grid, weeks, anchorWeek, d) : null;
    if (cycle) return cycle;
    const counts = new Map<string, { weeks: number; nearest: number }>();
    for (const c of cells) {
      const n = dayNumber(c.date);
      const prev = counts.get(c.signature);
      counts.set(c.signature, { weeks: (prev?.weeks ?? 0) + 1, nearest: prev && nearer(prev.nearest, n) <= 0 ? prev.nearest : n });
    }
    const ranked = [...counts].sort(([, a], [, b]) => b.weeks - a.weeks || nearer(a.nearest, b.nearest));
    const tied = ranked.length > 1 && ranked[0][1].weeks === ranked[1][1].weeks;
    if (tied || cells.length < MIN_VOTE_WEEKS) {
      // The table's weeks of this day from the period's start on decide among the period's leading
      // signatures (only signatures seen in the period are candidates). Earlier periods are an older
      // timetable and do not count: VTA's archived zip has six different Thursdays in its last
      // period, and a bus bridge on Sep 10 (the period before) and Sep 17 must not win as a repeat.
      const inWindow = new Map<string, number>();
      for (const week of grid.cells.slice(weeks[0])) {
        const c = week[d];
        if (c) inWindow.set(c.signature, (inWindow.get(c.signature) ?? 0) + 1);
      }
      const top = cells.length < MIN_VOTE_WEEKS ? ranked : ranked.filter(([, v]) => v.weeks === ranked[0][1].weeks);
      top.sort(([sa, a], [sb, b]) => (inWindow.get(sb) ?? 0) - (inWindow.get(sa) ?? 0) || nearer(a.nearest, b.nearest));
      const [signature, best] = top[0];
      return { signature, weeks: best.weeks, of: cells.length };
    }
    const [signature, best] = ranked[0];
    return { signature, weeks: best.weeks, of: cells.length };
  });

  // Rule 2, short current period: a thin day whose only pattern is seen on no other week of the
  // table nor of the history before it, while the history repeats another pattern for that day, is a
  // one-off; the day reads the history's pattern (Embark 302: an extra Monday service on Oct 26, in
  // a period of 1.5 weeks because Friday changes on Nov 6). A day matching its history (the last days
  // of a timetable that still runs, Dutchess and Blacksburg) keeps its vote.
  const currentDays = weeks.reduce((n, w) => n + grid.cells[w].filter(c => c != null).length, 0);
  const historyFill = new Map<DayName, ServiceDay[]>();
  if (anchorInPeriod && currentDays < SHORT_PERIOD_DAYS && table.history?.length) {
    for (const [d, day] of DAY_NAMES.entries()) {
      const vote = votes[day];
      if (!vote || vote.of >= MIN_VOTE_WEEKS) continue;
      const tableWeeks = grid.cells.filter(week => week[d]?.signature === vote.signature).length;
      const past = table.history.filter(c => c.day === day);
      if (tableWeeks > 1 || past.some(c => c.signature === vote.signature)) continue;
      const usual = mode(past.map(c => c.signature));
      if (!usual || usual.count < 2 || usual.count < past.length * PERIOD_MAJORITY) continue;
      votes[day] = { signature: usual.value, weeks: usual.count, of: past.length };
      historyFill.set(day, past.filter(c => c.signature === usual.value));
    }
  }

  // Rules 3 and 4: the nearest whole week where every day carries its vote, counted in weeks from
  // the anchor's week (the later week on a tie).
  const matches = (w: number) => DAY_NAMES.filter((day, d) => grid.cells[w][d]?.signature === votes[day]?.signature).length;
  const whole = weeks.filter(w => grid.cells[w].every(c => c != null));
  const ranked = whole
    .map(w => ({ w, matched: matches(w) }))
    .sort((a, b) => b.matched - a.matched || Math.abs(a.w - anchorWeek) - Math.abs(b.w - anchorWeek) || b.w - a.w);
  const picked = ranked.length > 0 ? ranked[0].w : null;

  // A day of the period in force with no date in the window (its start lies in the history: an
  // anchor in a week the timetable changes mid-week) reads the period's latest date of that day.
  if (table.history?.length) {
    for (const day of DAY_NAMES) {
      if (votes[day]) continue;
      const own = table.history.filter(c => c.day === day && dayNumber(c.date) >= starts[k] && c.signature !== '');
      const latest = own[own.length - 1];
      if (!latest) continue;
      votes[day] = { signature: latest.signature, weeks: 1, of: 1 };
      historyFill.set(day, [latest]);
    }
  }

  // Rule 5: a day whose vote is not in the picked week reads the period's nearest date with it.
  const substituted: DayName[] = [];
  const chosen = byDayName((day, d): ServiceDay | null => {
    const vote = votes[day];
    if (!vote) return null;
    const own = picked != null ? grid.cells[picked][d] : null;
    if (own && own.signature === vote.signature) return own;
    let options = weeks.map(w => grid.cells[w][d]).filter((c): c is ServiceDay => c?.signature === vote.signature);
    // A one-off's usual pattern (above) is read from the table's nearest date with it, or from history.
    if (options.length === 0 && historyFill.has(day)) {
      options = grid.cells.map(week => week[d]).filter((c): c is ServiceDay => c?.signature === vote.signature);
      if (options.length === 0) options = historyFill.get(day)!;
    }
    options.sort((a, b) => nearer(dayNumber(a.date), dayNumber(b.date)));
    substituted.push(day);
    return options[0];
  });

  const skipped: SkippedDate[] = [];
  for (const w of weeks) {
    DAY_NAMES.forEach((day, d) => {
      const c = grid.cells[w][d];
      const vote = votes[day];
      if (!c || !vote || c.signature === vote.signature) return;
      skipped.push({ date: c.date, day, reason: 'lost-vote', detail: `differs from the usual ${day} (seen on ${vote.weeks} of ${vote.of} weeks)` });
    });
  }
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  for (const w of straddling) {
    if (w !== first - 1 && w !== last + 1) continue;
    DAY_NAMES.forEach((day, d) => {
      const c = grid.cells[w][d];
      if (c) skipped.push({ date: c.date, day, reason: 'period-change', detail: 'week straddles a change of schedule period' });
    });
  }
  skipped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const periodDays = weeks.flatMap(w => grid.cells[w]).filter((c): c is ServiceDay => c != null);
  return {
    weekStart: picked != null ? ymdOf(grid.mondays[picked]) : null,
    dates: byDayName(day => chosen[day]?.date ?? null),
    services: byDayName(day => chosen[day]?.services ?? []),
    substituted,
    period: { start: periodDays[0].date, end: periodDays[periodDays.length - 1].date },
    votes,
    skipped,
  };
}

/**
 * Reference-date safeguard (CIV-1011, Ryan 2026-10-27): most of an agency's scheduled service stopped
 * being listed, and nothing replaced it. The map keeps the last full listed week and the agency shows
 * "This agency's scheduled service for most routes ended <date>, and they have not released updated
 * data." Dutchess: 11 main calendar rows end 2026-10-28 while its other rows run to placeholder years,
 * so the whole file never runs out and the "timetable ended" notice never shows.
 *
 * Read by service (calendar row or calendar_dates service): a service stopped being listed on D when D
 * is its last listed date on or before the end of the anchor week and it is not listed again: no later
 * date within RETURN_GAP_DAYS, and after a longer gap fewer than MIN_RETURN_DAYS days (SLO Transit's
 * weekday services stop on Aug 14 and come back only for Dec 14 to Jan 1, the file's last 19 days; a
 * break that returns for a term still counts as listed). Services, not route names: Dutchess' routes C, D and K keep a few trips each, but the
 * services that end on Oct 28 take 714 weekday trips down to 81. The listing ended on D when the
 * services that stopped on or before D carried more than LISTING_END_TRIP_SHARE of all trips in the 7
 * days ending D (the last full listed week), and other services bring back under
 * REPLACEMENT_TRIP_SHARE of those trips, both in the week after D and in the anchor week (a new
 * timetable, a renumbered board or a service already running that takes over replaces them), and the
 * file is no newer than D (fileDate; the manager 2026-10-27: an agency that publishes a file after the
 * routes stopped dropped them on purpose). Routes listed again later in the file (a seasonal pause)
 * are not stopped. Any age counts (the manager,
 * 2026-10-27): trips, not route counts, keep a few discontinued school expresses (Marathon County
 * X1-X9) from tripping it. A whole file that runs out (the rest of the service stops within
 * CONTINUING_DAYS of D, or nothing runs from the anchor on) keeps the "timetable ended" notice instead.
 */
export const LISTING_END_TRIP_SHARE = 0.5;
export const REPLACEMENT_TRIP_SHARE = 0.5;
/** A service listed again within this many days was only paused (a weekend, a holiday week). */
export const RETURN_GAP_DAYS = 28;
/** After a longer gap, the days it must be listed again to count (not a fragment at the file's end). */
export const MIN_RETURN_DAYS = 28;
/** Days the rest of the service must keep running past the end, so a file that simply runs out is not flagged. */
export const CONTINUING_DAYS = 14;
/** How far back from the anchor week a listing end is looked for. */
const LISTING_LOOKBACK_DAYS = 730;
/** A service's last active day is searched at most this far back from its row's end (removals). */
const LAST_DAY_SEARCH_DAYS = 800;

export interface ListingEnd {
  /** The last date the ended routes are listed (YYYYMMDD). */
  date: string;
  endedRoutes: string[];
  /** Share of the trips in the 7 days ending `date` carried by the ended routes (0-1). */
  tripShare: number;
}

interface ServiceCalendar {
  servicesOn(day: number): string[];
  lastActiveDay(serviceId: string): number | null;
}

function serviceCalendar(calendar: readonly GtfsCalendar[], calendarDates: readonly GtfsCalendarDate[]): ServiceCalendar {
  const rows = calendar
    .filter(c => isYmd(c.start_date) && isYmd(c.end_date))
    .map(c => ({ id: c.service_id, start: dayNumber(c.start_date), end: dayNumber(c.end_date), flags: DOW_FIELDS.map(f => c[f] === '1') }));
  const changesByDay = new Map<number, Array<{ id: string; add: boolean }>>();
  const removed = new Set<string>();
  const lastAdded = new Map<string, number>();
  for (const cd of calendarDates) {
    if (!isYmd(cd.date) || (cd.exception_type !== '1' && cd.exception_type !== '2')) continue;
    const n = dayNumber(cd.date);
    const add = cd.exception_type === '1';
    changesByDay.set(n, [...(changesByDay.get(n) ?? []), { id: cd.service_id, add }]);
    if (add) lastAdded.set(cd.service_id, Math.max(lastAdded.get(cd.service_id) ?? -Infinity, n));
    else removed.add(`${cd.service_id}|${n}`);
  }
  const servicesOn = (n: number): string[] => {
    const dow = dayIndex(n);
    const running = new Set<string>();
    for (const r of rows) if (r.flags[dow] && r.start <= n && n <= r.end) running.add(r.id);
    const changes = changesByDay.get(n) ?? [];
    for (const c of changes) if (!c.add) running.delete(c.id);
    for (const c of changes) if (c.add) running.add(c.id);
    return [...running].sort();
  };
  const lastActiveDay = (id: string): number | null => {
    let last = lastAdded.get(id) ?? null;
    for (const r of rows) {
      if (r.id !== id || !r.flags.some(Boolean)) continue;
      for (let n = r.end; n >= r.start && n > r.end - LAST_DAY_SEARCH_DAYS; n--) {
        if (last != null && n <= last) break;
        if (r.flags[dayIndex(n)] && !removed.has(`${id}|${n}`)) { last = n; break; }
      }
    }
    return last;
  };
  return { servicesOn, lastActiveDay };
}

/** Routes by their public name, so a route_id renumbered each board (Calgary "1-20795") is one route. */
export type ListingRoutes = ReadonlyArray<{ route_id: string; route_short_name?: string; route_long_name?: string }>;

/** The safeguard's listing end for a feed at an anchor, or null (see LISTING_END_TRIP_SHARE). */
/**
 * A feed_version that is a date (SLO "2026-03-27T18:13:21Z", Trillium "UTC: 02-Jun-2026 18:30",
 * Connexionz "20250617") as YYYYMMDD, or null when it is not one ("124", "FY27 Blacksburg 1.8A", "1").
 */
export function feedVersionDate(version: string | null | undefined): string | null {
  const v = (version ?? '').trim();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = v.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m && months.includes(m[2].toLowerCase())) return `${m[3]}${String(months.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}${m[1].padStart(2, '0')}`;
  m = v.match(/^(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  if (m) return v;
  return null;
}

export function findListingEnd(
  input: Pick<ServiceDayTableInput, 'calendar' | 'calendarDates' | 'trips' | 'anchor'> & {
    routes?: ListingRoutes;
    /**
     * When the file was published or first obtained (YYYYMMDD): the earliest of a date-like
     * feed_version and Atlas's first copy (archive upload). The safeguard trips only for a file older
     * than the end (Ryan's "they have not released updated data"); a file published after the routes
     * stopped dropped them on purpose. Unknown: it does not trip.
     */
    fileDate?: string | null;
  },
  /** The trip share that trips it; lower only to report cases near the line. */
  minShare: number = LISTING_END_TRIP_SHARE,
): ListingEnd | null {
  const cal = serviceCalendar(input.calendar, input.calendarDates);
  const nameOf = new Map((input.routes ?? []).map(r => [r.route_id, r.route_short_name?.trim() || r.route_long_name?.trim() || r.route_id]));
  const tripsOfService = new Map<string, number>();
  const routesOfService = new Map<string, Set<string>>();
  for (const t of input.trips) {
    tripsOfService.set(t.service_id, (tripsOfService.get(t.service_id) ?? 0) + 1);
    const set = routesOfService.get(t.service_id) ?? new Set<string>();
    set.add(nameOf.get(t.route_id) ?? t.route_id);
    routesOfService.set(t.service_id, set);
  }
  const serviceLast = new Map<string, number>();
  for (const id of tripsOfService.keys()) {
    const last = cal.lastActiveDay(id);
    if (last != null) serviceLast.set(id, last);
  }
  if (serviceLast.size === 0) return null;
  const feedLast = Math.max(...serviceLast.values());
  const anchorDay = dayNumber(input.anchor);
  if (feedLast < anchorDay) return null;
  const anchorWeekEnd = anchorDay - dayIndex(anchorDay) + 6;

  const dayCache = new Map<number, string[]>();
  const servicesOn = (n: number): string[] => {
    let ids = dayCache.get(n);
    if (!ids) { ids = cal.servicesOn(n).filter(id => tripsOfService.has(id)); dayCache.set(n, ids); }
    return ids;
  };
  /** Trips per service over [from, to]. */
  const tripsIn = (from: number, to: number): Map<string, number> => {
    const counts = new Map<string, number>();
    for (let n = from; n <= to; n++) for (const id of servicesOn(n)) counts.set(id, (counts.get(id) ?? 0) + tripsOfService.get(id)!);
    return counts;
  };

  // Each service's last listed day on or before the anchor week, and whether it is listed afterwards.
  const lastBefore = new Map<string, number>();
  for (let n = anchorWeekEnd; n > anchorWeekEnd - LISTING_LOOKBACK_DAYS; n--) {
    for (const id of servicesOn(n)) if (!lastBefore.has(id)) lastBefore.set(id, n);
    if (lastBefore.size === serviceLast.size) break;
  }
  // Listed again later: a next listing within RETURN_GAP_DAYS (a weekend, a holiday week), or one
  // after a longer gap that lasts MIN_RETURN_DAYS (a term after a break). SLO's weekday services come
  // back after four months for 19 days at the file's end, which is not listed again.
  const listedAgain = (id: string, from: number): boolean => {
    const last = serviceLast.get(id) ?? -Infinity;
    let next: number | null = null;
    let days = 0;
    for (let n = from + 1; n <= last; n++) {
      if (!servicesOn(n).includes(id)) continue;
      if (next == null) { next = n; if (n - from <= RETURN_GAP_DAYS) return true; }
      if (++days >= MIN_RETURN_DAYS) return true;
    }
    return false;
  };
  const stoppedOn = new Map<string, number>();
  for (const [id, n] of lastBefore) if (n < anchorWeekEnd && !listedAgain(id, n)) stoppedOn.set(id, n);

  let best: (ListingEnd & { endedTrips: number }) | null = null;
  const fileDay = input.fileDate && isYmd(input.fileDate) ? dayNumber(input.fileDate) : null;
  if (fileDay == null) return null;
  for (const d of [...new Set(stoppedOn.values())].sort((a, b) => b - a)) {
    if (feedLast < d + CONTINUING_DAYS || fileDay > d) continue;
    const week = tripsIn(d - 6, d);
    const total = [...week.values()].reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const ended = [...week.keys()].filter(id => (stoppedOn.get(id) ?? Infinity) <= d);
    const endedTrips = ended.reduce((n, id) => n + (week.get(id) ?? 0), 0);
    const share = endedTrips / total;
    if (share <= minShare) continue;
    // Replaced: in the week after D, or in the anchor week riders face now, other services (new ones,
    // a renumbered board, or ones already running that take over, Pierce Transit's service 3 on Sep
    // 28) bring back at least REPLACEMENT_TRIP_SHARE of the ended services' trips.
    const totalIn = (from: number) => [...tripsIn(from, from + 6).values()].reduce((a, b) => a + b, 0);
    const after = Math.max(totalIn(d + 1), anchorWeekEnd - 6 > d + 1 ? totalIn(anchorWeekEnd - 6) : 0);
    if (after - (total - endedTrips) >= REPLACEMENT_TRIP_SHARE * endedTrips) continue;
    // The end that took the most trips (SLO Transit: its weekday services in August, not its one
    // trolley in October); the latest on a tie.
    if (!best || endedTrips > best.endedTrips) {
      const routes = new Set(ended.flatMap(id => [...(routesOfService.get(id) ?? [])]));
      best = { date: ymdOf(d), endedRoutes: [...routes].sort(), tripShare: share, endedTrips };
    }
  }
  if (!best) return null;
  const { endedTrips: _endedTrips, ...end } = best;
  return end;
}

export interface RiderWeek {
  week: ServiceWeek;
  /** The anchor the week was picked at: the run's, or the last full listed week's (listingEnd). */
  anchor: string;
  listingEnd: ListingEnd | null;
  /**
   * The picked week as calendar.txt rows (each service flagged on the days it runs that week, over
   * a range around `referenceDate`, with no calendar_dates), so every reader of the calendar
   * (getActiveServiceIds, phase 1, corridors, converging origins) reads exactly this week.
   */
  calendar: GtfsCalendar[];
  referenceDate: string;
}

/** Days either side of the picked week's reference date that its calendar rows cover. */
const RIDER_WEEK_RANGE_DAYS = 14;

/**
 * The week the map reads (stage 4): pickServiceWeek at the anchor, or, when most routes stopped
 * being listed (findListingEnd), in the last full listed week before that end. Input: the feed's
 * own calendar.txt (none for a calendar_dates-only feed, never parseGtfs' synthesized rows) and
 * calendar_dates, after the agency's filters.
 */
export function pickRiderWeek(input: Pick<ServiceDayTableInput, 'calendar' | 'calendarDates' | 'trips' | 'anchor'> & { routes?: ListingRoutes; fileDate?: string | null }): RiderWeek {
  const listingEnd = findListingEnd(input);
  const anchor = listingEnd ? ymdOf(dayNumber(listingEnd.date) - 6) : input.anchor;
  const week = pickServiceWeek(buildServiceDayTable({ calendar: input.calendar, calendarDates: input.calendarDates, trips: input.trips, anchor }));
  const dated = DAY_NAMES.map(day => week.dates[day]).filter((d): d is string => d != null);
  const referenceDate = week.dates.Wednesday ?? dated[Math.floor(dated.length / 2)] ?? anchor;
  const ids = [...new Set(DAY_NAMES.flatMap(day => week.services[day]))].sort();
  const flag = (id: string, day: DayName) => (week.services[day].includes(id) ? '1' : '0');
  const ref = dayNumber(referenceDate);
  const calendar: GtfsCalendar[] = ids.map(id => ({
    service_id: id,
    monday: flag(id, 'Monday'), tuesday: flag(id, 'Tuesday'), wednesday: flag(id, 'Wednesday'), thursday: flag(id, 'Thursday'),
    friday: flag(id, 'Friday'), saturday: flag(id, 'Saturday'), sunday: flag(id, 'Sunday'),
    start_date: ymdOf(ref - RIDER_WEEK_RANGE_DAYS),
    end_date: ymdOf(ref + RIDER_WEEK_RANGE_DAYS),
  }));
  return { week, anchor, listingEnd, calendar, referenceDate };
}
