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
/** Weeks from the anchor the table runs to: the anchor plus 55 days, 8 whole weeks. */
export const WINDOW_WEEKS_AFTER = 8;
/** A new period is read when it starts no more than this many days after the anchor (VTA, #1082; plan question 5). */
export const NEW_PERIOD_LEAD_DAYS = 7;
/** Weeks a day's new pattern must hold before it counts as a new period, so a one- or two-week holiday, bridge or break is not one. */
export const MIN_NEW_PERIOD_WEEKS = 3;
/** Weeks of the old pattern needed before a change can be called. */
export const MIN_OLD_PERIOD_WEEKS = 2;
/** Share of the weeks looked at (up to 4 each side) that must carry the old and the new pattern. */
export const PERIOD_MAJORITY = 0.75;
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
   * How the window was placed: around the anchor; the feed's last 8 weeks with service (nothing
   * runs from the anchor on, an archived zip); the first 8 weeks of service after a gap (nothing
   * runs in the 8 weeks from the anchor, but service resumes later); or empty.
   */
  source: 'anchor' | 'last-weeks' | 'first-weeks' | 'empty';
  /** One row per date in the window, in date order. */
  days: ServiceDay[];
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
    start = Math.max(lo, anchorDay - daysBefore);
    end = Math.min(hi, aheadEnd);
    source = 'anchor';
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

  const days: ServiceDay[] = [];
  for (let n = start; n <= end; n++) {
    const services = servicesOn(n);
    days.push({ date: ymdOf(n), day: DAY_NAMES[dayIndex(n)], services, signature: signatureOf(services) });
  }
  return { anchor, span, window: { start: ymdOf(start), end: ymdOf(end) }, source, days };
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
  const { periods, straddling } = splitPeriods(grid);
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

export interface PickServiceWeekOptions {
  /** Read the next period when it starts within this many days of the anchor (default NEW_PERIOD_LEAD_DAYS). */
  newPeriodLeadDays?: number;
}

/**
 * Picks one real week from the table (plan 3b, rules 1-5 and 7).
 *
 * 1. The service period in force on the anchor, or the next one when it starts within
 *    NEW_PERIOD_LEAD_DAYS of the anchor, so an old Saturday is never paired with new weekdays.
 *    With the anchor outside the table (an archived or not-yet-started feed), the nearest period.
 * 2. Each day of the week takes the signature seen on the most weeks of that period. A tie goes to
 *    the signature seen nearest the anchor (the later date when two are equally near).
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
export function pickServiceWeek(table: ServiceDayTable, options: PickServiceWeekOptions = {}): ServiceWeek {
  const leadDays = options.newPeriodLeadDays ?? NEW_PERIOD_LEAD_DAYS;
  const grid = weekGrid(table);
  const { periods, straddling } = splitPeriods(grid);
  const emptyWeek: ServiceWeek = {
    weekStart: null, dates: byDayName(() => null), services: byDayName(() => []), substituted: [],
    period: null, votes: byDayName(() => null), skipped: [],
  };
  if (periods.length === 0) return emptyWeek;

  const anchorDay = dayNumber(table.anchor);
  const anchorMonday = anchorDay - dayIndex(anchorDay);
  const anchorWeek = (anchorMonday - grid.mondays[0]) / 7;

  // Rule 1: the period in force on the anchor (or the one after a straddling week it falls in).
  let k = periods.findIndex(weeks => weeks[weeks.length - 1] >= anchorWeek);
  const anchorInside = k >= 0 && periods[k][0] <= anchorWeek;
  if (k < 0) k = periods.length - 1;
  if (anchorInside && k + 1 < periods.length) {
    // The first week after this period that differs (a straddling week or the next period's first).
    const nextChange = grid.mondays[periods[k][periods[k].length - 1] + 1];
    if (nextChange - anchorDay <= leadDays) k++;
  }
  const weeks = periods[k];
  const distance = (n: number) => Math.abs(n - anchorDay);
  /** Nearer the anchor first; on a tie, the later one. */
  const nearer = (a: number, b: number) => distance(a) - distance(b) || b - a;

  // Rule 2: the vote per day.
  const votes = byDayName((_, d): DayVote | null => {
    const cells = weeks.map(w => grid.cells[w][d]).filter((c): c is ServiceDay => c != null);
    if (cells.length === 0) return null;
    const counts = new Map<string, { weeks: number; nearest: number }>();
    for (const c of cells) {
      const n = dayNumber(c.date);
      const prev = counts.get(c.signature);
      counts.set(c.signature, { weeks: (prev?.weeks ?? 0) + 1, nearest: prev && nearer(prev.nearest, n) <= 0 ? prev.nearest : n });
    }
    const [signature, best] = [...counts].sort(([, a], [, b]) => b.weeks - a.weeks || nearer(a.nearest, b.nearest))[0];
    return { signature, weeks: best.weeks, of: cells.length };
  });

  // Rules 3 and 4: the nearest whole week where every day carries its vote, counted in weeks from
  // the anchor's week (the later week on a tie).
  const matches = (w: number) => DAY_NAMES.filter((day, d) => grid.cells[w][d]?.signature === votes[day]?.signature).length;
  const whole = weeks.filter(w => grid.cells[w].every(c => c != null));
  const ranked = whole
    .map(w => ({ w, matched: matches(w) }))
    .sort((a, b) => b.matched - a.matched || Math.abs(a.w - anchorWeek) - Math.abs(b.w - anchorWeek) || b.w - a.w);
  const picked = ranked.length > 0 ? ranked[0].w : null;

  // Rule 5: a day whose vote is not in the picked week reads the period's nearest date with it.
  const substituted: DayName[] = [];
  const chosen = byDayName((day, d): ServiceDay | null => {
    const vote = votes[day];
    if (!vote) return null;
    const own = picked != null ? grid.cells[picked][d] : null;
    if (own && own.signature === vote.signature) return own;
    const options = weeks.map(w => grid.cells[w][d]).filter((c): c is ServiceDay => c?.signature === vote.signature);
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
