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
    const multiStarts = sortedStarts.filter(s => groups.get(s)!.length > 1);

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
            const datesMid = new Date((new Date(fsy, fsm, fsd).getTime() + new Date(fey, fem, fed).getTime()) / 2);
            const calendarRefMs = mid.getTime();
            const datesMidMs = datesMid.getTime();
            const diffDays = Math.abs(calendarRefMs - datesMidMs) / 86400000;
            if (diffDays > 90 && datesMidMs < calendarRefMs) {
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

    // Step 1: calendar.txt
    // For single-day services (start_date === end_date) the normal range check
    // would only match when referenceDate is the exact service date. Instead use
    // a ±90-day proximity window — the same tolerance used for calendar_dates in
    // Step 2. This handles feeds like Washington State Ferries which encode every
    // operating day as a separate one-day service_id in calendar.txt.
    for (const cal of calendar) {
        if (cal[field] !== '1') continue;
        if (referenceDate) {
            if (cal.start_date === cal.end_date) {
                const sy = parseInt(cal.start_date.substring(0, 4)), sm = parseInt(cal.start_date.substring(4, 6)) - 1, sd = parseInt(cal.start_date.substring(6, 8));
                const ry = parseInt(referenceDate.substring(0, 4)), rm = parseInt(referenceDate.substring(4, 6)) - 1, rd = parseInt(referenceDate.substring(6, 8));
                const diffDays = Math.abs(new Date(sy, sm, sd).getTime() - new Date(ry, rm, rd).getTime()) / 86400000;
                if (diffDays > 90) continue;
            } else {
                if (referenceDate < cal.start_date || referenceDate > cal.end_date) continue;
            }
        }
        active.add(cal.service_id);
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

    for (const cd of calendarDates) {
        if (calendarServiceIds.has(cd.service_id)) continue;
        if (cd.exception_type !== '1') continue;

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
            continue;
        }
        if (count === 1) {
            // Single-date services: include unconditionally. One occurrence within
            // the 90-day window has negligible impact on frequency analysis (1 trip
            // vs. dozens of regular trips) and is required for one-off services to
            // be visible when the pipeline is analysing a specific reference date.
            active.add(serviceId);
        }
    }

    return active;
}
