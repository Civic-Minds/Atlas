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
 */
export function detectReferenceDate(calendar: GtfsCalendar[], calendarDates?: GtfsCalendarDate[]): string {
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

    // Pick the group with the most entries (dominant schedule period).
    // Break ties by latest start_date to avoid holiday-only entries winning.
    // Special case: if every group has exactly one entry (e.g. WSF-style feeds
    // where each service covers a single calendar day), fall back to the median
    // of all service start_dates rather than the latest — the latest date may be
    // a weekend or outside the bulk of the service window.
    const groups = new Map<string, GtfsCalendar[]>();
    for (const cal of calendar) {
        const grp = groups.get(cal.start_date) ?? [];
        grp.push(cal);
        groups.set(cal.start_date, grp);
    }
    let bestStartDate = '';
    let bestCount = 0;
    for (const [startDate, entries] of groups) {
        if (entries.length > bestCount || (entries.length === bestCount && startDate > bestStartDate)) {
            bestCount = entries.length;
            bestStartDate = startDate;
        }
    }

    // If all groups are singletons, use the median start_date as the anchor
    // instead of the latest — avoids picking a weekend or outlier as reference.
    if (bestCount === 1) {
        const sortedStarts = Array.from(groups.keys()).sort();
        bestStartDate = sortedStarts[Math.floor(sortedStarts.length / 2)];
    }

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
    // more than 90 days from the calendar-derived reference, the calendar has
    // placeholder entries (year-long ranges) that don't reflect the actual
    // service window. Fall back to the calendarDates midpoint so that Step 2
    // in getActiveServiceIds can actually find services within its 90-day window.
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
            if (diffDays > 90) {
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
    const DOW_NAMES: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
            active.add(cd.service_id);
        }
    }

    return active;
}
