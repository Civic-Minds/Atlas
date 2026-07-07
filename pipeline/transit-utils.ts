import { GtfsCalendar, DayName } from '../types/gtfs';
import { getGtfsModeName } from '../shared/modes.js';

/**
 * Converts HH:MM:SS string to minutes from beginning of day.
 * Returns null for invalid, empty, or negative times.
 * Supports GTFS extended times > 24:00 (e.g. 25:30 = 1:30am next day).
 */
export const t2m = (s: string): number | null => {
    if ((s || '').trimStart().startsWith('-')) return null;
    const p = (s || '').split(':');
    if (p.length < 2) return null;
    const mins = (+p[0]) * 60 + (+p[1]);
    if (Number.isNaN(mins) || mins < 0) return null;
    return mins;
};

/**
 * Converts minutes from beginning of day to HH:MM string.
 */
export const m2t = (m: number): string => {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return `${String(h).padStart(2, '0')}:${mm}`;
};

/**
 * Computes the median of an array of numbers.
 */
export const computeMedian = (arr: number[]): number => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * GTFS route_type → human-readable mode name.
 * Covers base types (0–7, 11, 12) and the full HVT extended spec.
 */
export const getModeName = getGtfsModeName;

/**
 * Maps DayName to the corresponding GtfsCalendar field name.
 */
export const DAY_FIELD_MAP: Record<DayName, keyof GtfsCalendar> = {
    Monday: 'monday',
    Tuesday: 'tuesday',
    Wednesday: 'wednesday',
    Thursday: 'thursday',
    Friday: 'friday',
    Saturday: 'saturday',
    Sunday: 'sunday',
};
