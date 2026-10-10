import { GtfsCalendar, GtfsCalendarDate, DayName } from '../types/gtfs';
import { DAY_FIELD_MAP } from './transit-utils';

/**
 * Auto-detect a reference date from the feed's calendar data.
 * Returns the midpoint of the dominant service period, formatted as YYYYMMDD.
 *
 * When the synthesized calendar is empty (all services below threshold),
 * falls back to the midpoint of the calendar_dates date range so the 90-day
 * window in getActiveServiceIds doesn't silently drop everything.
 * Final fallback: today's date.
 *
 * When trips are provided, the dominant-period calculation is restricted to
 * service_ids that are actually referenced by trips. This prevents long-running
 * placeholder calendar entries (e.g. year-long scaffolding blocks with no trips)
 * from pulling the reference date into a future "dead zone" where real short-period
 * trip blocks have already ended (Prague PID Czech pattern).
 */
export function detectReferenceDate(
    calendar: GtfsCalendar[],
    calendarDates?: GtfsCalendarDate[],
    trips?: Array<{ service_id: string }>
): string {
    if (!calendar || calendar.length === 0) {
        if (calendarDates && calendarDates.length > 0) {
            const added = calendarDates
                .filter(cd => cd.exception_type === '1')
                .map(cd => cd.date)
                .sort();
            if (added.length > 0) {
                const first = added[0];
                const last = added[added.length - 1];
                const sy = parseInt(first.substring(0, 4)), sm = parseInt(first.substring(4, 6)) - 1, sd = parseInt(first.substring(6, 8));
                const ey = parseInt(last.substring(0, 4)), em = parseInt(last.substring(4, 6)) - 1, ed = parseInt(last.substring(6, 8));
                const mid = new Date((new Date(sy, sm, sd).getTime() + new Date(ey, em, ed).getTime()) / 2);
                return `${mid.getFullYear()}${String(mid.getMonth() + 1).padStart(2, '0')}${String(mid.getDate()).padStart(2, '0')}`;
            }
        }
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    }

    // Pick the most recently started period that has multiple service entries.
    // Transit agencies always publish the current schedule last, so the latest
    // start_date is the most representative period. Single-entry groups are
    // excluded to prevent a small holiday or special-event block from winning.
    // Special case: if every group is a singleton (e.g. WSF-style feeds where
    // each service covers a single calendar day), fall back to the median
    // start_date — the latest date may be a weekend or outlier.
    //
    // If trips are provided, restrict to service_ids with actual trips so that
    // year-long placeholder entries (no trips attached) don't skew the result.
    const tripServiceIds = trips && trips.length > 0
        ? new Set(trips.map(t => t.service_id))
        : null;
    const calendarForRef = tripServiceIds
        ? calendar.filter(c => tripServiceIds.has(c.service_id))
        : calendar;
    const effectiveCalendar = calendarForRef.length > 0 ? calendarForRef : calendar;

    const groups = new Map<string, GtfsCalendar[]>();
    for (const cal of effectiveCalendar) {
        const grp = groups.get(cal.start_date) ?? [];
        grp.push(cal);
        groups.set(cal.start_date, grp);
    }
    const sortedStarts = Array.from(groups.keys()).sort();
    const rawMultiStarts = sortedStarts.filter(s => groups.get(s)!.length > 1);

    // Trip-volume floor: a multi-entry group can still be pure noise if its total
    // trip count is negligible (e.g. a 2-trip placeholder block), the same class
    // of noise a singleton entry already gets excluded for above. Without this,
    // Dutchess County's near-empty placeholder (2 services x 2 trips, open-ended
    // "no expiry" end_date) beat its real 585-trip dominant weekday service
    // purely on having a later start_date, computing a reference date past the
    // placeholder's own service window entirely.
    const MIN_GROUP_TRIPS = 5;
    const tripCountByServiceId = tripServiceIds
        ? trips!.reduce((m, t) => m.set(t.service_id, (m.get(t.service_id) ?? 0) + 1), new Map<string, number>())
        : null;
    const substantialMultiStarts = tripCountByServiceId
        ? rawMultiStarts.filter(s => groups.get(s)!.reduce((sum, c) => sum + (tripCountByServiceId.get(c.service_id) ?? 0), 0) >= MIN_GROUP_TRIPS)
        : rawMultiStarts;
    // Only apply the floor if it doesn't eliminate every candidate — preserves
    // existing behavior for feeds where every period is genuinely small.
    const multiStarts = substantialMultiStarts.length > 0 ? substantialMultiStarts : rawMultiStarts;

    // Prefer the most recently started multi-entry period that has already begun
    // (start_date ≤ today). This prevents future schedule blocks published months
    // in advance from pulling the reference date into a window where current trips
    // are excluded (Prague PID Czech rolling-schedule pattern: latest multi-entry
    // group starts October 2026, but current service is in March 2026).
    // Falls back to the overall latest if all multi-entry periods are in the future
    // (handles feeds that only contain upcoming schedule data).
    const todayStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    })();
    const pastOrPresentMultiStarts = multiStarts.filter(s => s <= todayStr);
    const bestStartDate = pastOrPresentMultiStarts.length > 0
        ? pastOrPresentMultiStarts[pastOrPresentMultiStarts.length - 1]
        : multiStarts.length > 0
            ? multiStarts[multiStarts.length - 1]
            : sortedStarts[Math.floor(sortedStarts.length / 2)];

    const bestGroup = groups.get(bestStartDate)!;
    const bestEndDate = bestGroup.reduce((max, c) => c.end_date > max ? c.end_date : max, bestGroup[0].end_date);

    const sy = parseInt(bestStartDate.substring(0, 4));
    const sm = parseInt(bestStartDate.substring(4, 6)) - 1;
    const sd = parseInt(bestStartDate.substring(6, 8));
    const ey = parseInt(bestEndDate.substring(0, 4));
    const em = parseInt(bestEndDate.substring(4, 6)) - 1;
    const ed = parseInt(bestEndDate.substring(6, 8));

    const mid = new Date((new Date(sy, sm, sd).getTime() + new Date(ey, em, ed).getTime()) / 2);
    const calendarRef = `${mid.getFullYear()}${String(mid.getMonth() + 1).padStart(2, '0')}${String(mid.getDate()).padStart(2, '0')}`;

    // Sanity-check: if calendarDates type-1 entries exist and their midpoint is
    // more than 90 days from the calendar-derived reference, the calendar may have
    // placeholder entries that don't reflect the actual service window. Override
    // with the calendarDates midpoint — but ONLY when the calendarDates midpoint
    // is EARLIER than the calendar reference. This handles the Foothill Transit
    // pattern: a year-long calendar.txt pulls the reference late (e.g. September)
    // while the actual calendarDates entries are all in April → use April.
    //
    // When the calendarDates midpoint is LATER than the calendar reference (e.g.
    // Kingston Transit: a phantom year-long calendar_dates service skews the
    // calendarDates midpoint to September while the real services run March–May),
    // the calendar-derived reference is already anchored in the correct early
    // window — do not override it.
    //
    // Require the added dates themselves to span less than a year: the Foothill
    // pattern is a tight cluster of dates (e.g. all in April) whose midpoint is
    // meaningful. A feed with recurring annual holiday exceptions (e.g. Dec 24/31
    // recorded across 2023, 2024, and 2026) has no such cluster — its "midpoint"
    // is an arbitrary date roughly halfway between the earliest and latest year,
    // not a real service window, and trusting it pulled Emery Go-Round's
    // reference date back a full year, excluding every currently-active trip.
    if (calendarDates && calendarDates.length > 0) {
        const added = calendarDates
            .filter(cd => cd.exception_type === '1')
            .map(cd => cd.date)
            .sort();
        if (added.length > 0) {
            const first = added[0];
            const last = added[added.length - 1];
            const fsy = parseInt(first.substring(0, 4)), fsm = parseInt(first.substring(4, 6)) - 1, fsd = parseInt(first.substring(6, 8));
            const fey = parseInt(last.substring(0, 4)), fem = parseInt(last.substring(4, 6)) - 1, fed = parseInt(last.substring(6, 8));
            const addedSpanDays = (new Date(fey, fem, fed).getTime() - new Date(fsy, fsm, fsd).getTime()) / 86400000;
            const datesMid = new Date((new Date(fsy, fsm, fsd).getTime() + new Date(fey, fem, fed).getTime()) / 2);
            const calendarRefMs = mid.getTime();
            const datesMidMs = datesMid.getTime();
            const diffDays = Math.abs(calendarRefMs - datesMidMs) / 86400000;
            if (diffDays > 90 && datesMidMs < calendarRefMs && addedSpanDays < 365) {
                return `${datesMid.getFullYear()}${String(datesMid.getMonth() + 1).padStart(2, '0')}${String(datesMid.getDate()).padStart(2, '0')}`;
            }
        }
    }

    return calendarRef;
}

/**
 * Determines which service_ids are active on a specific day, accounting for
 * both calendar.txt and calendar_dates.txt.
 *
 * Step 1: calendar.txt entries whose date range contains the referenceDate.
 * Step 2: calendar_dates-only services (not in calendar.txt) whose exception
 *         dates fall on the target day-of-week within 90 days of referenceDate.
 *
 * The referenceDate filter prevents merging trips from non-overlapping schedule
 * periods (e.g. summer + winter service).
 */
/**
 * Nearest date to referenceDate (in either direction, within the same week) whose
 * day-of-week matches `day`. getActiveServiceIds is called with ONE referenceDate
 * shared across all three DayNames (Weekday/Saturday/Sunday use the same detected
 * date), so referenceDate itself often isn't a `day`-matching date — e.g. a Sunday
 * referenceDate when checking Monday activity. calendar_dates.txt exceptions are
 * per-exact-date, so an exact match against referenceDate would silently miss every
 * weekday's own exceptions whenever referenceDate lands on a different day.
 */
function nearestDateForDayName(referenceDate: string, day: DayName): string {
    const DOW_NAMES: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDow = DOW_NAMES.indexOf(day);
    const ry = parseInt(referenceDate.substring(0, 4));
    const rm = parseInt(referenceDate.substring(4, 6)) - 1;
    const rd = parseInt(referenceDate.substring(6, 8));
    const ref = new Date(ry, rm, rd);
    let diff = targetDow - ref.getDay();
    if (diff > 3) diff -= 7;
    if (diff < -3) diff += 7;
    const result = new Date(ry, rm, rd + diff);
    return `${result.getFullYear()}${String(result.getMonth() + 1).padStart(2, '0')}${String(result.getDate()).padStart(2, '0')}`;
}

function ymdToDate(ymd: string): Date {
    return new Date(parseInt(ymd.substring(0, 4)), parseInt(ymd.substring(4, 6)) - 1, parseInt(ymd.substring(6, 8)));
}

function addDaysYmd(ymd: string, days: number): string {
    const d = ymdToDate(ymd);
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    return `${r.getFullYear()}${String(r.getMonth() + 1).padStart(2, '0')}${String(r.getDate()).padStart(2, '0')}`;
}

/** Same-weekday dates looked at on each side of the reference week. */
const TYPICAL_WINDOW_WEEKS = 4;
const ALL_DAY_NAMES: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface RepresentativeWeek {
    /** Days added to every day's nearest date to reach the representative week (multiple of 7). */
    shiftDays: number;
    /** Days whose nearest date had an untypical service set (usually a holiday). */
    atypicalDays: Set<DayName>;
    /** Days with calendar.txt service in range on the reference date. */
    analyzedDays: Set<DayName>;
    /** Days whose calendar.txt services are removed on most dates (placeholder calendars). */
    emptyIsTypical: Set<DayName>;
}

/**
 * Chooses the week whose calendar_dates removals (exception_type 2) stand for the
 * feed's typical service (#658).
 *
 * The reference date used to be the only input: each day read the removals on the
 * nearest date with that weekday. When that date is a holiday (TTC Thanksgiving
 * Monday, Labour Day), the regular service is removed, the day empties, and the
 * single-occurrence fallback picks the holiday service, which the Weekday union then
 * merged with the regular Tue-Fri service, roughly halving weekday headways.
 *
 * For each day, the calendar.txt services in range on the reference date are taken,
 * and each same-weekday date within ±4 weeks that lies inside all of their ranges
 * yields the set still running after that date's removals. A set is typical when no
 * other set occurs more often. A date is holiday-like when its set is not typical,
 * services in a typical set were removed, and anything running instead runs on no
 * other date in the window. A superseded overlapping period (TAG Grenoble), removed
 * on most dates, stays removed because its removal is part of the typical set.
 *
 * When no day of the reference week is holiday-like, nothing changes. Otherwise the
 * whole week moves by the fewest weeks (later first on ties) to a week where every
 * day is typical and keeps service. The whole week moves, not single days, so all
 * days describe the same week and the Weekday union never mixes a university-break
 * week with a term week. No hardcoded holiday list: the feed's own pattern decides.
 * If no such week exists (a short feed), the shift is 0.
 */
function representativeWeek(
    calendar: GtfsCalendar[],
    removalsByDate: ReadonlyMap<string, ReadonlySet<string>>,
    referenceDate: string,
): RepresentativeWeek {
    const result: RepresentativeWeek = { shiftDays: 0, atypicalDays: new Set(), analyzedDays: new Set(), emptyIsTypical: new Set() };
    if (removalsByDate.size === 0) return result;

    type DayInfo = {
        nearest: string;
        ranges: Array<{ id: string; start: string; end: string }>;
        /** How many window dates had each surviving set. */
        counts: Map<string, number>;
        best: number;
        /** How many window dates each service survived on. */
        runs: Map<string, number>;
    };
    const days = new Map<DayName, DayInfo>();
    const survivingKey = (info: DayInfo, date: string) => {
        const removed = removalsByDate.get(date);
        return info.ranges.filter(r => !removed?.has(r.id)).map(r => r.id).sort().join('\u0000');
    };
    const insideAll = (info: DayInfo, date: string) => info.ranges.every(r => date >= r.start && date <= r.end);

    for (const day of ALL_DAY_NAMES) {
        const field = DAY_FIELD_MAP[day];
        const rangeById = new Map<string, { id: string; start: string; end: string }>();
        for (const c of calendar) {
            if (c[field] !== '1' || c.start_date === c.end_date) continue;
            if (referenceDate < c.start_date || referenceDate > c.end_date) continue;
            const r = rangeById.get(c.service_id);
            rangeById.set(c.service_id, r
                ? { id: c.service_id, start: c.start_date < r.start ? c.start_date : r.start, end: c.end_date > r.end ? c.end_date : r.end }
                : { id: c.service_id, start: c.start_date, end: c.end_date });
        }
        if (rangeById.size === 0) continue;
        const info: DayInfo = { nearest: nearestDateForDayName(referenceDate, day), ranges: [...rangeById.values()], counts: new Map(), best: 0, runs: new Map() };
        for (let k = -TYPICAL_WINDOW_WEEKS; k <= TYPICAL_WINDOW_WEEKS; k++) {
            const date = addDaysYmd(info.nearest, 7 * k);
            if (!insideAll(info, date)) continue;
            const key = survivingKey(info, date);
            info.counts.set(key, (info.counts.get(key) ?? 0) + 1);
            for (const id of key.split('\u0000').filter(Boolean)) info.runs.set(id, (info.runs.get(id) ?? 0) + 1);
        }
        info.best = Math.max(0, ...info.counts.values());
        days.set(day, info);
        result.analyzedDays.add(day);
        const samples = [...info.counts.values()].reduce((a, b) => a + b, 0);
        if (samples >= 2 && (info.counts.get('') ?? 0) * 2 > samples) result.emptyIsTypical.add(day);
    }

    const isTypical = (info: DayInfo, date: string) => insideAll(info, date) && (info.counts.get(survivingKey(info, date)) ?? 0) === info.best;
    // Holiday-like: the date removes services that normally run, and anything it runs
    // instead runs on no other date in the window (a one-day replacement, like OC
    // Transpo's Thanksgiving service). A set that recurs (a seasonal or term change,
    // a school-holiday fortnight in Grenoble) is not a holiday and keeps the existing
    // behavior.
    const isHolidayLike = (info: DayInfo, date: string) => {
        if (!insideAll(info, date) || isTypical(info, date)) return false;
        const ids = survivingKey(info, date).split('\u0000').filter(Boolean);
        return [...info.counts].some(([key, count]) => {
            if (count !== info.best) return false;
            const typical = new Set(key.split('\u0000').filter(Boolean));
            const missing = [...typical].some(id => !ids.includes(id));
            const extrasAreOneOff = ids.every(id => typical.has(id) || info.runs.get(id) === 1);
            return missing && extrasAreOneOff;
        });
    };
    for (const [day, info] of days) {
        if (isHolidayLike(info, info.nearest)) result.atypicalDays.add(day);
    }
    if (result.atypicalDays.size === 0) return result;

    for (let k = 1; k <= TYPICAL_WINDOW_WEEKS; k++) {
        for (const shift of [7 * k, -7 * k]) {
            const ok = [...days.values()].every(info => {
                const date = addDaysYmd(info.nearest, shift);
                // A day that has service in the reference week must keep it.
                return isTypical(info, date) && (survivingKey(info, date) !== '' || survivingKey(info, info.nearest) === '');
            });
            if (ok) { result.shiftDays = shift; return result; }
        }
    }
    return result;
}

export function getActiveServiceIds(
    calendar: GtfsCalendar[],
    calendarDates: GtfsCalendarDate[],
    day: DayName,
    referenceDate?: string
): Set<string> {
    const field = DAY_FIELD_MAP[day];
    const active = new Set<string>();
    // Only services with at least one active day-of-week block Step 2.
    // All-zero placeholder entries (Wellington Metlink pattern) are treated
    // as calendar_dates-only so their exception_type=1 dates are processed.
    const DOW_FIELDS: (keyof GtfsCalendar)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const calendarServiceIds = new Set(
        calendar.filter(c => DOW_FIELDS.some(f => c[f] === '1')).map(c => c.service_id)
    );

    // Step 1: calendar.txt — two passes, same logic as Step 2's holiday handling.
    //
    // Pass A: multi-day services (start_date !== end_date). These are the regular
    //   scheduled services; include them if the reference date falls in their range.
    //
    // Pass B: single-day services (start_date === end_date). These are holiday
    //   overrides (e.g. Burlington Transit Victoria Day service with all DOW=1) or
    //   WSF-style feeds where every operating day is a separate service_id. Use a
    //   ±90-day proximity window like Step 2. Only include them when Pass A found
    //   nothing — otherwise the holiday trips get merged with the regular weekday
    //   pool, halving the apparent headway (Burlington Route 1: 30m→10m).
    const singleDayCalEntries: GtfsCalendar[] = [];
    for (const cal of calendar) {
        if (cal[field] !== '1') continue;
        if (cal.start_date === cal.end_date) {
            if (referenceDate) {
                const sy = parseInt(cal.start_date.substring(0, 4)), sm = parseInt(cal.start_date.substring(4, 6)) - 1, sd = parseInt(cal.start_date.substring(6, 8));
                const ry = parseInt(referenceDate.substring(0, 4)), rm = parseInt(referenceDate.substring(4, 6)) - 1, rd = parseInt(referenceDate.substring(6, 8));
                const diffDays = Math.abs(new Date(sy, sm, sd).getTime() - new Date(ry, rm, rd).getTime()) / 86400000;
                if (diffDays <= 90) singleDayCalEntries.push(cal);
            } else {
                singleDayCalEntries.push(cal);
            }
        } else {
            if (referenceDate && (referenceDate < cal.start_date || referenceDate > cal.end_date)) continue;
            active.add(cal.service_id);
        }
    }
    // Pass B: only include single-day calendar entries when no multi-day service was found
    if (active.size === 0) {
        for (const cal of singleDayCalEntries) active.add(cal.service_id);
    }

    // calendar_dates.txt can override a calendar.txt service_id for a specific date
    // (exception_type '2' = removed), not just add calendar_dates-only services (Step 2
    // below). Sequential French schedule exports commonly publish several overlapping
    // calendar.txt weekday periods (e.g. two months each saying "active Mon-Fri") and
    // rely on calendar_dates.txt to cancel the superseded one for nearly every date in
    // the overlap. Without this, both periods' trips get merged on the same reference
    // date, doubling apparent departures and halving the computed headway (confirmed on
    // TAG Grenoble Tram A: real 10 min, computed 5 min from two overlapping services).
    //
    // The removals are read from a representative week, not always the literal
    // nearest date: a holiday (TTC Thanksgiving Monday, Labour Day) removes the regular
    // service on that one date only, and checking it emptied the day so the
    // single-occurrence fallback below picked the holiday service, which then merged
    // with the regular Tue-Fri service in the Weekday union and roughly halved weekday
    // headways (#658). See representativeWeek.
    let unresolvedHolidayRemoval = false;
    // Set when a holiday date was swapped for the typical week: calendar_dates-only
    // services added on the holiday but not on the typical date are holiday
    // replacements (WMATA's break-week weekday service), so Step 2 leaves them out.
    let holidaySwap: { holiday: string; typical: string } | null = null;
    if (referenceDate) {
        const removalsByDate = new Map<string, Set<string>>();
        for (const cd of (calendarDates ?? [])) {
            if (cd.exception_type !== '2') continue;
            const set = removalsByDate.get(cd.date) ?? new Set<string>();
            set.add(cd.service_id);
            removalsByDate.set(cd.date, set);
        }
        const nearest = nearestDateForDayName(referenceDate, day);
        const week = representativeWeek(calendar, removalsByDate, referenceDate);
        const checkDate = addDaysYmd(nearest, week.shiftDays);
        const atypical = week.atypicalDays.has(day);
        if (atypical && week.shiftDays !== 0) holidaySwap = { holiday: nearest, typical: checkDate };
        const hadActive = active.size > 0;
        for (const id of removalsByDate.get(checkDate) ?? []) active.delete(id);
        // The removals emptied a day whose calendar.txt service normally runs (a holiday
        // with no typical week to use instead, e.g. a one-week feed): skip the
        // single-occurrence fallback below rather than pick the holiday service.
        unresolvedHolidayRemoval = week.analyzedDays.has(day) && !week.emptyIsTypical.has(day)
            && hadActive && active.size === 0;
    }

    // Step 2: calendar_dates-only services (and all-zero placeholder calendar entries)
    // A service_id is included if it meets either condition:
    //   A) count >= MIN_OCCURRENCES (4) — catches high-frequency regular services
    //   B) count >= MIN_WEEKLY_OCCURRENCES (3) AND all consecutive date gaps are
    //      exactly 7 days — catches short-period services (e.g. 3-week schedule
    //      blocks) that would otherwise be excluded by the raw count threshold.
    //      This distinguishes a real weekly service (gaps: 7,7) from holiday
    //      replacements like Thanksgiving/Christmas/New Year's (gaps: 28,7).
    const MIN_OCCURRENCES = 4;
    const MIN_WEEKLY_OCCURRENCES = 3;
    const DOW_NAMES: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const candidateDates = new Map<string, number[]>();
    const addedOnHoliday = new Set<string>();
    const addedOnTypical = new Set<string>();

    for (const cd of (calendarDates ?? [])) {
        if (calendarServiceIds.has(cd.service_id)) continue;
        if (cd.exception_type !== '1') continue;
        if (holidaySwap && cd.date === holidaySwap.holiday) addedOnHoliday.add(cd.service_id);
        if (holidaySwap && cd.date === holidaySwap.typical) addedOnTypical.add(cd.service_id);

        if (referenceDate) {
            const cy = parseInt(cd.date.substring(0, 4));
            const cm = parseInt(cd.date.substring(4, 6)) - 1;
            const cDay = parseInt(cd.date.substring(6, 8));
            const ry = parseInt(referenceDate.substring(0, 4));
            const rm = parseInt(referenceDate.substring(4, 6)) - 1;
            const rDay = parseInt(referenceDate.substring(6, 8));
            const diffDays = Math.abs(new Date(cy, cm, cDay).getTime() - new Date(ry, rm, rDay).getTime()) / 86400000;
            if (diffDays > 90) continue;
        }

        const y = parseInt(cd.date.substring(0, 4));
        const m = parseInt(cd.date.substring(4, 6)) - 1;
        const d = parseInt(cd.date.substring(6, 8));
        if (DOW_NAMES[new Date(y, m, d).getDay()] === day) {
            const ts = new Date(y, m, d).getTime();
            const existing = candidateDates.get(cd.service_id) ?? [];
            existing.push(ts);
            candidateDates.set(cd.service_id, existing);
        }
    }

    for (const id of addedOnHoliday) {
        if (!addedOnTypical.has(id)) candidateDates.delete(id);
    }

    // First pass: add regular and weekly services.
    for (const [serviceId, dates] of candidateDates) {
        const count = dates.length;
        if (count >= MIN_OCCURRENCES) {
            active.add(serviceId);
            continue;
        }
        if (count >= MIN_WEEKLY_OCCURRENCES) {
            // Only include sub-threshold services if all consecutive gaps are exactly
            // 7 days — a regular weekly service. Distinguishes a real 3-week schedule
            // (gaps: 7,7) from irregular holiday replacements (e.g. gaps: 28,7).
            const sorted = dates.slice().sort((a, b) => a - b);
            const isWeekly = sorted.every((ts, i) => i === 0 || Math.round((ts - sorted[i - 1]) / 86400000) === 7);
            if (isWeekly) active.add(serviceId);
        }
    }

    // Second pass: single-occurrence services.
    // Only include them if no regular service was found yet — this handles WSF-style
    // feeds where every operating day is its own service_id (all counts are 1).
    // When a regular weekday service already exists, a count-1 service is almost
    // always a holiday replacement (e.g. GRT Holiday1 on Family Day / Good Friday)
    // that runs instead of the normal service, not in addition to it. Merging it in
    // adds spurious unique departure times and understates the typical headway.
    //
    // For GO-Transit-style feeds where each calendar date has its own service_id, the
    // ±90-day window can produce 20+ single-occurrence entries for the same day-of-week.
    // Merging all of them together creates thousands of near-duplicate departure times
    // (slightly different schedules each week) that collapse the median headway to ~1 min.
    // Fix: when a reference date is available, pick just the ONE service_id closest to
    // it rather than all of them. Correct representative-day behaviour is preserved; the
    // WSF/daily-service_id pattern still works because each selected service_id still
    // contains all trips for that operating day.
    //
    // Not when removals emptied a day whose calendar.txt service normally runs and no
    // typical week could be used instead (very short feeds): the closest
    // single-occurrence service is then the holiday replacement itself. Leaving the day
    // empty is safe because the other days still carry the regular service; merging
    // the holiday is not (#658).
    if (active.size === 0 && !unresolvedHolidayRemoval) {
        const singles = [...candidateDates.entries()].filter(([, dates]) => dates.length === 1);
        if (referenceDate && singles.length > 0) {
            const refMs = (() => {
                const ry = parseInt(referenceDate.substring(0, 4));
                const rm = parseInt(referenceDate.substring(4, 6)) - 1;
                const rd = parseInt(referenceDate.substring(6, 8));
                return new Date(ry, rm, rd).getTime();
            })();
            let bestId = '';
            let bestDiff = Infinity;
            for (const [serviceId, [ts]] of singles) {
                const diff = Math.abs(ts - refMs);
                if (diff < bestDiff) { bestDiff = diff; bestId = serviceId; }
            }
            if (bestId) active.add(bestId);
        } else {
            for (const [serviceId] of singles) active.add(serviceId);
        }
    }

    return active;
}
