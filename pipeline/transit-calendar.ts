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
    trips?: Array<{ service_id: string; route_id?: string }>
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
    // A run on a holiday must give the same reference as the next day (#742). Agencies
    // publish a holiday as a one-day period: several services that all start and end on
    // that date (CDTA and MBTA on Oct 12, 2026). On that day it is the newest period
    // running, so it became the reference and the regular weekend timetables, which are
    // not in range on that date, dropped. When today is the date of such a one-day
    // period, the reference is chosen as of the next day that isn't one.
    const oneDayPeriodStarts = new Set(multiStarts.filter(s => groups.get(s)!.every(c => c.start_date === c.end_date)));
    // Published data is in use from the next morning, so the reference is chosen as of the
    // day after the run: a period that ends on the run date is already over (PART's summer
    // period ended Oct 12; a run that day published a timetable that was wrong from Oct 13),
    // and one that starts the next day is already in force (#743).
    const todayStr = (() => {
        const d = new Date();
        const runDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        const nextDay = addDaysYmd(runDate, 1);
        let today = nextDay;
        for (let k = 0; k < 7 && oneDayPeriodStarts.has(today); k++) today = addDaysYmd(today, 1);
        // Every date a one-day period (a whole week of them): nothing to step over, so keep
        // the next day rather than land a week out (#743 review).
        return oneDayPeriodStarts.has(today) ? nextDay : today;
    })();
    const pastOrPresentMultiStarts = multiStarts.filter(s => s <= todayStr);
    const groupEnd = (start: string): string => {
        const grp = groups.get(start)!;
        return grp.reduce((max, c) => c.end_date > max ? c.end_date : max, grp[0].end_date);
    };
    const daysBetween = (a: string, b: string): number =>
        (new Date(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8)).getTime()
            - new Date(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8)).getTime()) / 86400000;
    // Prefer the newest period that is still running today (start <= today <= end). The
    // newest started period can already be over: RCT's 2026 summer period (Jun 12-Aug 23)
    // started after the regular period (Dec 2025-Dec 2026), which is the one running in
    // October. Taking the ended period put the reference inside it, where both timetables
    // are active, and hourly loops 1-3 minutes apart pooled into a 4-minute headway (#734).
    // Only an ended newest period is replaced; a newest period still running today is kept
    // as before. The replacement skips short running periods (under 28 days, e.g. a
    // one-week holiday block) when a longer one is also running.
    const MIN_RUNNING_PERIOD_DAYS = 28;
    /** The running period must keep at least this share of the routes (see below). */
    const MIN_RUNNING_ROUTE_SHARE = 0.5;
    const newestStarted = pastOrPresentMultiStarts.length > 0 ? pastOrPresentMultiStarts[pastOrPresentMultiStarts.length - 1] : undefined;
    const runningStarts = pastOrPresentMultiStarts.filter(s => groupEnd(s) >= todayStr);
    const longRunningStarts = runningStarts.filter(s => daysBetween(s, groupEnd(s)) >= MIN_RUNNING_PERIOD_DAYS);
    // All-singleton calendars (every service starts on its own date, so there are no
    // multi-entry periods) fall back to the median start below, which the running-period
    // choice above never sees. Avon's two services are a year-long main calendar
    // (Mar 31-Nov 25) and a summer-only one nested in it (May 23-Sep 13); the median is
    // the summer start, so the reference landed in July and the ended BC Express showed
    // every day in October (#767). Only when that median service spans several days and
    // has ended, take the newest multi-day service of 28+ days still running instead.
    // A one-day median (WSF-style feeds, holiday entries) keeps the fallback. The
    // route-share guard below still applies: a running service carrying under half the
    // routes in range on the old reference keeps the old reference.
    const singletonMultiDayStarts = rawMultiStarts.length === 0
        ? sortedStarts.filter(s => groupEnd(s) > s)
        : [];
    // A one-day median (Mont-Tremblant's Thanksgiving Saturday, Oct 10, between periods that end
    // Oct 3-9 and start Oct 16-17) is a holiday, not a timetable: when a multi-day service is
    // running today, the newest running one (28+ days preferred, as below) stands in for it
    // (#764). Running, not the median of all multi-day starts, which can be a future service
    // (a winter calendar from Nov 1). This holds before, on and after the holiday, so the result
    // does not depend on the build date. WSF-style feeds (every service one day) and stale feeds
    // with no multi-day service running keep the plain median.
    const overallMedianStart = sortedStarts[Math.floor(sortedStarts.length / 2)];
    const runningMultiDayStarts = singletonMultiDayStarts.filter(s => s <= todayStr && groupEnd(s) >= todayStr);
    const longRunningMultiDayStarts = runningMultiDayStarts.filter(s => daysBetween(s, groupEnd(s)) >= MIN_RUNNING_PERIOD_DAYS);
    const medianStart = rawMultiStarts.length === 0 && overallMedianStart != null
        && groupEnd(overallMedianStart) === overallMedianStart && runningMultiDayStarts.length > 0
        ? (longRunningMultiDayStarts.at(-1) ?? runningMultiDayStarts.at(-1)!)
        : overallMedianStart;
    const singletonRunningStart = rawMultiStarts.length === 0 && medianStart != null
        && groupEnd(medianStart) > medianStart && groupEnd(medianStart) < todayStr
        ? singletonMultiDayStarts
            .filter(s => s <= todayStr && groupEnd(s) >= todayStr && daysBetween(s, groupEnd(s)) >= MIN_RUNNING_PERIOD_DAYS)
            .pop()
        : undefined;
    // The newest started period still running today is kept unless it is a replacement block:
    // short (under MIN_RUNNING_PERIOD_DAYS), with a long period also running, and under
    // MIN_RUNNING_ROUTE_SHARE of its routes run by the long periods' services. Sound Transit's
    // Oct 17-18 Link bus bridge (2 services, only its Shuttle routes) replaced weekend rail; as
    // the reference it dropped the 1 Line and 2 Line (#921). A short period of the current
    // timetable's own routes is kept: Embark's Oct 7-21 group is its regular Wednesday service.
    // Without route ids the period is kept, as before.
    const routesOfStarts = (starts: readonly string[]): Set<string> => {
        const services = new Set(starts.flatMap(s => groups.get(s)!.map(c => c.service_id)));
        return new Set((trips ?? []).filter(t => t.route_id != null && services.has(t.service_id)).map(t => t.route_id!));
    };
    const newestRunningIsReplacement = (() => {
        if (newestStarted == null || longRunningStarts.length === 0 || longRunningStarts.includes(newestStarted)) return false;
        if (daysBetween(newestStarted, groupEnd(newestStarted)) >= MIN_RUNNING_PERIOD_DAYS) return false;
        const own = routesOfStarts([newestStarted]);
        if (own.size === 0) return false;
        const long = routesOfStarts(longRunningStarts);
        return [...own].filter(r => long.has(r)).length < own.size * MIN_RUNNING_ROUTE_SHARE;
    })();
    const runningStart = newestStarted != null && groupEnd(newestStarted) >= todayStr && !newestRunningIsReplacement
        ? newestStarted
        : longRunningStarts.length > 0
        ? longRunningStarts[longRunningStarts.length - 1]
        : runningStarts.length > 0 ? runningStarts[runningStarts.length - 1]
        : singletonRunningStart;
    // The period chosen before #734: the newest started, else the newest, else the median.
    const previousStart = newestStarted != null
        ? newestStarted
        : multiStarts.length > 0
            ? multiStarts[multiStarts.length - 1]
            : medianStart;
    const removalsByDate = new Map<string, Set<string>>();
    for (const cd of (calendarDates ?? [])) {
        if (cd.exception_type !== '2') continue;
        const set = removalsByDate.get(cd.date) ?? new Set<string>();
        set.add(cd.service_id);
        removalsByDate.set(cd.date, set);
    }
    const additionDates = new Set((calendarDates ?? []).filter(cd => cd.exception_type === '1').map(cd => cd.date));

    const referenceFor = (bestStartDate: string, switched: boolean): string => {
        const bestGroup = groups.get(bestStartDate)!;
        const bestEndDate = groupEnd(bestStartDate);
        // A reference date inside an ended period nested in the running one (RCT: a July
        // midpoint of the Dec-Dec regular period lands in the ended Jun-Aug summer period)
        // still activates both timetables. Move it to the day after that period ends, kept
        // inside the running period.
        const outsideEndedOverlay = (ref: string): string => {
            let result = ref;
            for (const s of singletonRunningStart != null ? singletonMultiDayStarts : multiStarts) {
                const end = groupEnd(s);
                if (s > bestStartDate && end < todayStr && s <= result && result <= end) {
                    const next = addDaysYmd(end, 1);
                    result = next > bestEndDate ? bestEndDate : next;
                }
            }
            return result;
        };
        // The reference week (the 3 days on each side, see nearestDateForDayName) must not
        // hold a day whose running-period services are all removed in calendar_dates. A
        // partial removal (GCRTA's weekly rotating service ids) is left to the holiday
        // check in getActiveServiceIds (#678). The day after an
        // ended summer period is often still inside the regular period's summer removals:
        // Clallam Transit's and RABA's regular Sat/Sun services are removed through Sep 5/6
        // (and weekdays through Labor Day, Sep 7), so a reference of Sep 7/8 read the last
        // summer weekend, where the regular weekend service is removed and the summer one is
        // out of range. The ±4-week holiday check (#678) then saw more removed weekends
        // than running ones, took the empty set as typical, and dropped every weekend
        // route. The reference moves forward to the first such clear week, inside the
        // period; if none is found within 8 weeks it stays.
        const weekClear = (ref: string): boolean => {
            for (let k = -3; k <= 3; k++) {
                const date = addDaysYmd(ref, k);
                const removed = removalsByDate.get(date);
                if (!removed) continue;
                const field = DOW_FIELDS[ymdToDate(date).getDay()];
                const running = bestGroup.filter(c => c[field] === '1');
                if (running.length > 0 && running.every(c => removed.has(c.service_id))) return false;
            }
            return true;
        };
        const clearReferenceWeek = (ref: string): string => {
            for (let k = 0; k <= 56; k++) {
                const date = addDaysYmd(ref, k);
                // The whole reference week stays inside the period.
                if (addDaysYmd(date, 3) > bestEndDate) break;
                if (weekClear(date)) return date;
            }
            return ref;
        };
        const finish = (ref: string): string => switched ? clearReferenceWeek(outsideEndedOverlay(ref)) : ref;

        const sy = parseInt(bestStartDate.substring(0, 4));
        const sm = parseInt(bestStartDate.substring(4, 6)) - 1;
        const sd = parseInt(bestStartDate.substring(6, 8));
        const ey = parseInt(bestEndDate.substring(0, 4));
        const em = parseInt(bestEndDate.substring(4, 6)) - 1;
        const ed = parseInt(bestEndDate.substring(6, 8));

        const midpoint = new Date((new Date(sy, sm, sd).getTime() + new Date(ey, em, ed).getTime()) / 2);
        const midpointRef = `${midpoint.getFullYear()}${String(midpoint.getMonth() + 1).padStart(2, '0')}${String(midpoint.getDate()).padStart(2, '0')}`;
        // A typical week around a date (3 days each side, the window getActiveServiceIds reads):
        // no one-day service in it, and no day where calendar_dates removes most of the running
        // multi-day service.
        const multiDay = effectiveCalendar.filter(c => c.start_date < c.end_date);
        const oneDayDates = new Set(effectiveCalendar.filter(c => c.start_date === c.end_date).map(c => c.start_date));
        const typicalWeek = (ref: string): boolean => {
            for (let k = -3; k <= 3; k++) {
                const date = addDaysYmd(ref, k);
                if (oneDayDates.has(date)) return false;
                const field = DOW_FIELDS[ymdToDate(date).getDay()];
                const running = multiDay.filter(c => c[field] === '1' && c.start_date <= date && date <= c.end_date);
                // getActiveServiceIds reads calendar.txt ranges at the reference itself, so a day
                // with a running service whose block does not cover the reference (Calgary's
                // Saturday and LRT Sunday blocks starting after it) makes the week atypical.
                if (running.some(c => !(c.start_date <= ref && ref <= c.end_date))) return false;
                const removed = removalsByDate.get(date);
                if (running.length === 0 || !removed) continue;
                // Atypical when the removals take out most of the day's service: all of the
                // running services, or (with trip counts) at least half of their trips (RTS:
                // the 40-trip term service is removed over the break, a 15-trip reduced one runs).
                if (running.every(c => removed.has(c.service_id))) return false;
                // A day that removes running services and adds others is a holiday swap (VTA's
                // Oct 12 Indigenous Peoples' Day: 16 school-day services out, 11 in).
                if (additionDates.has(date) && running.some(c => removed.has(c.service_id))) return false;
                if (tripCountByServiceId) {
                    const total = running.reduce((n, c) => n + (tripCountByServiceId.get(c.service_id) ?? 0), 0);
                    const gone = running.filter(c => removed.has(c.service_id)).reduce((n, c) => n + (tripCountByServiceId.get(c.service_id) ?? 0), 0);
                    if (total > 0 && gone * 2 >= total) return false;
                }
            }
            return true;
        };
        // When the midpoint lands in a holiday or removed week and the period is running, read
        // the first typical week from the day after the run instead. RTS Gainesville's
        // academic-year period (Aug 20-Apr 30) has its midpoint on Dec 24, Christmas break, when
        // the term service is removed (#686). Otherwise the midpoint stays as before.
        const periodRunning = bestStartDate <= todayStr && todayStr <= bestEndDate;
        const nearRunRef = (): string => {
            for (let k = 0; k <= 56; k++) {
                const d = addDaysYmd(todayStr, k);
                if (d > bestEndDate) break;
                if (typicalWeek(d)) return d;
            }
            return midpointRef;
        };
        // Not for feeds that also run trips on all-zero calendar.txt rows (services defined only
        // by calendar_dates additions): getActiveServiceIds admits those by a ±90-day occurrence
        // count, so near the run date a school-holiday block later in the window pools with the
        // term timetable (Auch, cal2-43). They keep the midpoint.
        const hasPlaceholderServices = effectiveCalendar.some(c => DOW_FIELDS.every(f => c[f] !== '1'));
        const calendarRef = periodRunning && !hasPlaceholderServices && !typicalWeek(midpointRef) ? nearRunRef() : midpointRef;
        const mid = ymdToDate(calendarRef);

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
                    const datesRef = `${datesMid.getFullYear()}${String(datesMid.getMonth() + 1).padStart(2, '0')}${String(datesMid.getDate()).padStart(2, '0')}`;
                    // Never land before the period this reference date stands for. SCT's
                    // calendar runs to the open-ended 20991231, so the calendar midpoint is
                    // decades out and holiday exceptions (May-Dec) win, but their midpoint
                    // (Sep 9) is before the newest period starts (Oct 1), which dropped all
                    // 15 routes that only run in that period (#658).
                    //
                    // The clamp target is the newest period still running today, not simply the
                    // newest period that has started: RCT's 2026 summer period (Jun 12-Aug 23,
                    // over by October) is the newest, but the regular period (Dec 2025-Dec 2026)
                    // is still running. Clamping to the summer start put the reference inside
                    // summer, where both timetables are active, and hourly loops 2-3 minutes apart
                    // were pooled into a 4-minute headway. When no period is running (a stale
                    // feed), the newest started period is still the target.
                    // The date is clamped into that period's whole start-end window.
                    // The end clamp only applies to the running period chosen for #734.
                    const clamped = datesRef < bestStartDate ? bestStartDate : switched && datesRef > bestEndDate ? bestEndDate : datesRef;
                    return finish(clamped);
                }
            }
        }
        return finish(calendarRef);
    };

    const previousRef = referenceFor(previousStart, false);
    if (runningStart == null || runningStart === previousStart) return outsideHolidayWeek(previousRef, calendar, calendarDates, trips);
    const runningRef = referenceFor(runningStart, true);
    // Never switch to a running period that carries far fewer routes than the ended one:
    // in a stale feed the ended period is usually the main timetable and the one still
    // running is a small side service. CARTA's main period ended Aug 15 and only the
    // TriCounty Link period still runs (8 of 32 routes). Miami-Dade's bus periods ended
    // Jul 19; the running periods (Nov 2023-Dec 2026 and 2021-2027) put the reference at
    // their midpoint, Jun 7 2025, before the bus periods start (47 of 122 routes, and
    // commuter rail lost). Routes are counted from the calendar.txt services in range on
    // each reference date. Without route ids the switch is kept.
    if (trips && trips.length > 0 && trips[0].route_id != null) {
        const routesByService = new Map<string, Set<string>>();
        for (const t of trips) {
            if (t.route_id == null) continue;
            const set = routesByService.get(t.service_id) ?? new Set<string>();
            set.add(t.route_id);
            routesByService.set(t.service_id, set);
        }
        const routesOn = (date: string): number => {
            const routes = new Set<string>();
            for (const c of effectiveCalendar) {
                if (date < c.start_date || date > c.end_date) continue;
                for (const r of routesByService.get(c.service_id) ?? []) routes.add(r);
            }
            return routes.size;
        };
        const before = routesOn(previousRef);
        if (before > 0 && routesOn(runningRef) < before * MIN_RUNNING_ROUTE_SHARE) return outsideHolidayWeek(previousRef, calendar, calendarDates, trips);
    }
    return outsideHolidayWeek(runningRef, calendar, calendarDates, trips);
}

/** A day is thin when it has under this share of its busiest same-weekday trips nearby. */
const HOLIDAY_WEEK_TRIP_SHARE = 0.5;
/** Weeks looked at on each side of the reference week. */
const HOLIDAY_WEEK_WINDOW = 4;

/**
 * True when the calendar is the one synthesizeCalendarFromDates built from a
 * calendar_dates-only feed: every entry spans exactly its service's first to last added date.
 */
function isSynthesizedCalendar(calendar: GtfsCalendar[], calendarDates: GtfsCalendarDate[] | undefined): boolean {
    if (calendar.length === 0 || !calendarDates || calendarDates.length === 0) return false;
    const range = new Map<string, [string, string]>();
    for (const cd of calendarDates) {
        if (cd.exception_type !== '1') continue;
        const r = range.get(cd.service_id);
        if (!r) range.set(cd.service_id, [cd.date, cd.date]);
        else { if (cd.date < r[0]) r[0] = cd.date; if (cd.date > r[1]) r[1] = cd.date; }
    }
    return calendar.every(c => {
        const r = range.get(c.service_id);
        return r != null && r[0] === c.start_date && r[1] === c.end_date;
    });
}

/**
 * Moves the reference out of a holiday week in a calendar_dates-only feed (#742). Such a
 * feed lists every service by date, so its synthesized periods start almost daily and
 * the reference follows the run date. Metro-North's run on Oct 12, 2026 put it on Nov 26,
 * Thanksgiving week, where the weekday timetables are out of range: 15 weekday trips
 * instead of about 729, and 3 of 6 lines lost.
 *
 * A week is thin when any day has under half the trips of that weekday's busiest week
 * within 4 weeks of the reference, as getActiveServiceIds selects them. A thin reference
 * week moves to the nearest week, later first on ties, with no thin day against the
 * same busiest weeks; if there is none it stays. Feeds with a calendar.txt never move:
 * their holidays are calendar_dates removals, which the #678 check already handles.
 */
function outsideHolidayWeek(
    ref: string,
    calendar: GtfsCalendar[],
    calendarDates: GtfsCalendarDate[] | undefined,
    trips?: Array<{ service_id: string }>,
): string {
    if (!trips || trips.length === 0 || !isSynthesizedCalendar(calendar, calendarDates)) return ref;
    const tripsByService = new Map<string, number>();
    for (const t of trips) tripsByService.set(t.service_id, (tripsByService.get(t.service_id) ?? 0) + 1);
    const tripsByDay = (date: string): number[] => ALL_DAY_NAMES.map(day => {
        let n = 0;
        for (const id of getActiveServiceIds(calendar, calendarDates ?? [], day, date)) n += tripsByService.get(id) ?? 0;
        return n;
    });
    const weeks = new Map<number, number[]>();
    for (let k = -HOLIDAY_WEEK_WINDOW; k <= HOLIDAY_WEEK_WINDOW; k++) weeks.set(k, tripsByDay(addDaysYmd(ref, 7 * k)));
    const busiest = ALL_DAY_NAMES.map((_, i) => Math.max(...[...weeks.values()].map(w => w[i])));
    const thin = (k: number) => weeks.get(k)!.some((n, i) => busiest[i] > 0 && n < busiest[i] * HOLIDAY_WEEK_TRIP_SHARE);
    if (!thin(0)) return ref;
    for (let k = 1; k <= HOLIDAY_WEEK_WINDOW; k++) {
        for (const shift of [k, -k]) if (!thin(shift)) return addDaysYmd(ref, 7 * shift);
    }
    return ref;
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

const DOW_FIELDS: Array<keyof GtfsCalendar> = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
    const DOW_NAMES_B: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const cal of calendar) {
        if (cal[field] !== '1') continue;
        if (cal.start_date === cal.end_date) {
            // A one-day service only counts for the weekday its date falls on: a holiday row
            // flagged for every day of the week (Burlington's Victoria Day Monday) must not
            // answer a Saturday query (#744).
            if (DOW_NAMES_B[ymdToDate(cal.start_date).getDay()] !== day) continue;
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
    // Pass B: only include single-day calendar entries when no multi-day service was found.
    // With a reference date, only the services of the ONE matching date closest to it are
    // used (later on a tie), as Step 2 does for date-only feeds. WSF gives every operating
    // day its own one-day service, so taking every match within 90 days pooled 8
    // Saturdays; one weekend's extra sailings then halved Port Townsend's 90-minute
    // weekend headway to 45 (#744).
    if (active.size === 0 && singleDayCalEntries.length > 0) {
        let chosen = singleDayCalEntries;
        if (referenceDate) {
            // A date whose one-day services are all cancelled in calendar_dates.txt is not a
            // candidate; the cancellation would otherwise empty the whole day type.
            const removedOn = new Map<string, Set<string>>();
            for (const cd of (calendarDates ?? [])) {
                if (cd.exception_type !== '2') continue;
                if (!removedOn.has(cd.date)) removedOn.set(cd.date, new Set());
                removedOn.get(cd.date)!.add(cd.service_id);
            }
            const candidates = [...new Set(singleDayCalEntries.map(c => c.start_date))]
                .filter(date => singleDayCalEntries.some(c => c.start_date === date && !removedOn.get(date)?.has(c.service_id)));
            if (candidates.length > 0) {
                const distance = (date: string) => Math.abs(ymdToDate(date).getTime() - ymdToDate(referenceDate).getTime());
                const closest = candidates.reduce((best, date) => {
                    const d = distance(date), b = distance(best);
                    return d < b || (d === b && date > best) ? date : best;
                });
                chosen = singleDayCalEntries.filter(c => c.start_date === closest);
            } else {
                chosen = [];
            }
        }
        for (const cal of chosen) active.add(cal.service_id);
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
        let removedRunning = false;
        for (const id of removalsByDate.get(checkDate) ?? []) {
            if (active.delete(id)) removedRunning = true;
        }
        // An explicit addition on the checked date for a service that has a calendar.txt row
        // runs that day even when its own weekday flag is 0, but only as a replacement: when a
        // service that would run that day was removed, or the day is otherwise empty. Brandon
        // Transit swaps two identical weekday services (Mon/Thu/Fri and Tue/Wed): on a swapped
        // Friday the Mon/Thu/Fri service is removed and the Tue/Wed one added. Only the removal
        // was read, so the day emptied, the single-occurrence fallback picked a one-off holiday
        // service (hourly), and real 30-minute service read as 60 (#751). Additions next to
        // service that still runs (extra services on top) are left as before.
        // The added service must itself be a service of this day's kind (a weekday service on
        // a weekday, a Saturday service on Saturday, a Sunday service on Sunday). A holiday
        // that removes the weekday service and adds the Saturday or Sunday one (Bay Transit on
        // Labor Day, Douai in the school holidays) stays a holiday, as before.
        const sameKindFields: (keyof GtfsCalendar)[] = day === 'Saturday' ? ['saturday']
            : day === 'Sunday' ? ['sunday']
            : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        const calendarById = new Map(calendar.map(c => [c.service_id, c]));
        if (removedRunning || active.size === 0) {
            for (const cd of (calendarDates ?? [])) {
                if (cd.exception_type !== '1' || cd.date !== checkDate) continue;
                const row = calendarById.get(cd.service_id);
                if (row && sameKindFields.some(f => row[f] === '1')) active.add(cd.service_id);
            }
        }
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
