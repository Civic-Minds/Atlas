import { AnalysisCriteria } from '../types/gtfs';
import { GRACE_MINUTES, GRACE_PERCENT, TIER_MAXES, VIOLATION_PERCENT, VIOLATION_PERCENT_BY_TIER } from '../shared/frequencyRules.js';
import { SATURDAY_GRADING_WINDOW, SUNDAY_GRADING_WINDOW, WEEKDAY_GRADING_WINDOW } from '../shared/rules/periods.js';

/**
 * Default analysis criteria:
 * - Weekday: 07:00–22:00 · Saturday: 07:00–22:00 · Sunday: 09:00–21:00
 * - Tiers: TIER_MAXES, one scale for every mode (CIV-1813)
 * - Grace: max(5 min, T × 15%) per tier — tier=60 gets 9 min, tighter tiers keep 5 min floor
 * - Internal near misses: 10% for 5–15-minute tiers and 5% for 20–60-minute
 *   tiers, with one near miss allowed once there are 8 or more gaps
 *   (GRACE_FLOOR_MIN_GAPS) and a three-gap cap
 */
export const DEFAULT_CRITERIA: AnalysisCriteria = {
    id: 'default',
    name: 'Default',
    dayTypes: {
        Weekday: {
            timeWindow: { ...WEEKDAY_GRADING_WINDOW },  // 07:00–22:00
            tiers: TIER_MAXES,
        },
        Saturday: {
            timeWindow: { ...SATURDAY_GRADING_WINDOW },  // 07:00–22:00
            tiers: TIER_MAXES,
        },
        Sunday: {
            timeWindow: { ...SUNDAY_GRADING_WINDOW },  // 09:00–21:00
            tiers: TIER_MAXES,
        },
    },
    graceMinutes: GRACE_MINUTES,
    gracePercent: GRACE_PERCENT,
    maxGraceViolations: 0,
    violationPercent: VIOLATION_PERCENT,
    violationPercentByTier: { ...VIOLATION_PERCENT_BY_TIER },
    isDefault: true,
};
