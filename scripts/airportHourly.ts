// Counting for the airport story (CIV-1550). Pure functions, used by build-airport-hourly.ts and its test.
//
// "Landable" at an hour: someone landing at the start of that hour (minute 0) finds a departure
// leaving within the next 60 minutes (start <= departure <= start + 60). The week is
// Monday..Sunday: the weekday sample (a Tuesday) stands for Monday to Friday, then Saturday and
// Sunday. Departures after midnight (GTFS times of 24:00 or later) count on the next day, and
// Sunday night wraps into Monday morning.

export type DayKey = 'wk' | 'sat' | 'sun';
export const DAY_KEYS: readonly DayKey[] = ['wk', 'sat', 'sun'];

/** One departure from the airport: minutes after the service day's midnight (may be >= 1440). */
export interface AirportDeparture {
    minute: number;
    /** The same vehicle later stops within 1.2 km of the downtown point. */
    downtown: boolean;
    /** Downtown, either directly or with one change (300 m walk, within 60 minutes). */
    downtownWithChange: boolean;
}

export type DeparturesByDay = Record<DayKey, AirportDeparture[]>;

const WEEK_MINUTES = 7 * 1440;
const WEEK_HOURS = 168;

/** Day key used for each day of the week, Monday first. */
export function dayKeyForWeekday(dayIndex: number): DayKey {
    if (dayIndex < 5) return 'wk';
    return dayIndex === 5 ? 'sat' : 'sun';
}

/** Sorted, de-duplicated minutes of the week (0 = Monday 00:00) of departures passing `keep`. */
export function weekMinutes(deps: DeparturesByDay, keep: (d: AirportDeparture) => boolean): number[] {
    const out = new Set<number>();
    for (let day = 0; day < 7; day++) {
        for (const d of deps[dayKeyForWeekday(day)]) {
            if (keep(d)) out.add((day * 1440 + d.minute) % WEEK_MINUTES);
        }
    }
    return [...out].sort((a, b) => a - b);
}

/** 168 flags: true when a departure leaves within 60 minutes of the start of that hour of the week. */
export function landableWeek(sortedWeekMinutes: number[]): boolean[] {
    const out: boolean[] = [];
    for (let h = 0; h < WEEK_HOURS; h++) {
        const start = h * 60;
        const next = sortedWeekMinutes.find((m) => m >= start);
        // Past the last departure of the week, wrap to the first one (Sunday night into Monday).
        const wait = next !== undefined ? next - start : sortedWeekMinutes.length ? sortedWeekMinutes[0] + WEEK_MINUTES - start : Infinity;
        out.push(wait <= 60);
    }
    return out;
}

/** Hour-resolution input (from Atlas's published departuresByHour): an hour is landable when it has a departure. */
export function hourFlagsWeek(hoursByDay: Record<DayKey, number[]>): boolean[] {
    const out = new Array<boolean>(WEEK_HOURS).fill(false);
    for (let day = 0; day < 7; day++) {
        for (const h of hoursByDay[dayKeyForWeekday(day)]) out[(day * 24 + h) % WEEK_HOURS] = true;
    }
    return out;
}

/** 24-bit mask (bit h = hour h) for one sample day: Tuesday for weekdays, then Saturday, Sunday. */
export function dayMask(week: boolean[], day: DayKey): number {
    const dayIndex = day === 'wk' ? 1 : day === 'sat' ? 5 : 6;
    let mask = 0;
    for (let h = 0; h < 24; h++) if (week[dayIndex * 24 + h]) mask |= 1 << h;
    return mask;
}

export function countTrue(flags: boolean[]): number {
    return flags.reduce((n, f) => n + (f ? 1 : 0), 0);
}

export interface LandableSummary {
    /** Hours of the week (of 168). */
    weekly: { downtown: number; withChange: number; any: number };
    /** Per sample day: [downtown, withChange, any] 24-bit masks. */
    masks: Record<DayKey, [number, number, number]>;
}

export function summarizeWeeks(downtown: boolean[], withChange: boolean[], any: boolean[]): LandableSummary {
    const masks = {} as LandableSummary['masks'];
    for (const day of DAY_KEYS) masks[day] = [dayMask(downtown, day), dayMask(withChange, day), dayMask(any, day)];
    return { weekly: { downtown: countTrue(downtown), withChange: countTrue(withChange), any: countTrue(any) }, masks };
}

export function summarizeDepartures(deps: DeparturesByDay): LandableSummary {
    return summarizeWeeks(
        landableWeek(weekMinutes(deps, (d) => d.downtown)),
        landableWeek(weekMinutes(deps, (d) => d.downtownWithChange)),
        landableWeek(weekMinutes(deps, () => true)),
    );
}
