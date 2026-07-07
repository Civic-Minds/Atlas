import { AnalysisCriteria } from '../types/gtfs';
import { SURFACE_TIER_MAXES } from '../shared/config.js';

const SURFACE_TIERS = SURFACE_TIER_MAXES;

/**
 * Default analysis criteria:
 * - Weekday: 07:00–22:00 · Saturday: 07:00–22:00 · Sunday: 09:00–21:00
 * - Grace: max(5 min, T × 15%) per tier — tier=60 gets 9 min, tighter tiers keep 5 min floor
 * - Violations: max(2, gaps × 30%) — proportional to route length in window
 */
export const DEFAULT_CRITERIA: AnalysisCriteria = {
    id: 'default',
    name: 'Default',
    dayTypes: {
        Weekday: {
            timeWindow: { start: 420, end: 1320 },  // 07:00–22:00
            tiers: SURFACE_TIERS,
        },
        Saturday: {
            timeWindow: { start: 420, end: 1320 },  // 07:00–22:00
            tiers: SURFACE_TIERS,
        },
        Sunday: {
            timeWindow: { start: 540, end: 1260 },  // 09:00–21:00
            tiers: SURFACE_TIERS,
        },
    },
    graceMinutes: 5,
    gracePercent: 0.15,
    maxGraceViolations: 2,
    violationPercent: 0.30,
    modeTierOverrides: {
        rail: [5, 8, 10, 15, 30, 60],
        surface: SURFACE_TIERS,
    },
    isDefault: true,
};

/**
 * GTFS route_type → mode category for tier override lookup.
 * Handles both base types (0–12) and GTFS extended types (HVT spec).
 */
export function getModeCategory(routeType: string): string {
    const n = parseInt(routeType);
    if (Number.isNaN(n)) return 'surface';

    // Base GTFS types (Standard Spec)
    // 0: Tram/Light Rail, 1: Subway/Metro, 2: Rail, 5: Cable Car, 7: Funicular, 12: Monorail
    const baseRailTypes = new Set([0, 1, 2, 5, 7, 12]);
    if (baseRailTypes.has(n)) return 'rail';

    // Extended HVT types (Google/Extended Spec)
    // 100-199: Railway, 400-499: Urban Railway, 500-599: Metro, 900-999: Tram, 1400-1499: Funicular
    if ((n >= 100 && n < 200) || (n >= 400 && n < 600) || (n >= 900 && n < 1000) || (n >= 1400 && n < 1500)) {
        return 'rail';
    }

    // Default to surface for all other types (Buses, Trolleybuses, Ferries, etc.)
    return 'surface';
}

/**
 * Get the tier array for a given route type and criteria.
 * Uses mode-specific overrides if available, otherwise falls back to day type tiers.
 */
export function getTiersForCriteria(
    routeType: string,
    dayTiers: number[],
    modeTierOverrides?: Record<string, number[]>
): number[] {
    if (!modeTierOverrides) return dayTiers;
    const category = getModeCategory(routeType);
    return modeTierOverrides[category] || dayTiers;
}

/** Tier label lookup */
const TIER_LABELS: Record<number, string> = {
    5: 'Rapid', 8: 'Freq++', 10: 'Freq+', 15: 'Freq',
    20: 'Good', 30: 'Basic', 60: 'Infreq',
};

export function getTierLabel(threshold: number): string {
    return TIER_LABELS[threshold] || `${threshold}m`;
}

/** Color palette for tiers (assigned by position in sorted tier list) */
const TIER_COLORS = ['cyan', 'teal', 'emerald', 'blue', 'indigo', 'amber', 'orange', 'slate'];

export function getTierColor(index: number): string {
    return TIER_COLORS[index % TIER_COLORS.length];
}
