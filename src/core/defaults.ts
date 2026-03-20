import { AnalysisCriteria } from '../types/gtfs';

/**
 * Default analysis criteria matching the established methodology:
 * - Weekday: 07:00–22:00
 * - Saturday: 07:00–22:00
 * - Sunday: 09:00–21:00
 * - Grace: 5 minutes over threshold, max 2 violations
 */
export const DEFAULT_CRITERIA: AnalysisCriteria = {
    id: 'default',
    name: 'Default',
    dayTypes: {
        Weekday: {
            timeWindow: { start: 420, end: 1320 },  // 07:00–22:00
            tiers: [10, 15, 20, 30, 60],
        },
        Saturday: {
            timeWindow: { start: 420, end: 1320 },  // 07:00–22:00
            tiers: [10, 15, 20, 30, 60],
        },
        Sunday: {
            timeWindow: { start: 540, end: 1260 },  // 09:00–21:00
            tiers: [10, 15, 20, 30, 60],
        },
    },
    graceMinutes: 5,
    maxGraceViolations: 2,
    modeTierOverrides: {
        rail: [5, 8, 10, 15, 30],
        surface: [10, 15, 20, 30, 60],
    },
    isDefault: true,
};

/**
 * GTFS route_type → mode category for tier override lookup.
 * Handles both base types (0–7) and GTFS extended types (HVT spec).
 */
export function getModeCategory(routeType: string): string {
    // Base GTFS types that are rail/tram
    const baseRailTypes = new Set(['0', '1', '2', '12']); // tram/light rail, subway, commuter rail, monorail
    if (baseRailTypes.has(routeType)) return 'rail';
    // Extended HVT types: 100–199 (Commuter Rail), 400–599 (Urban Rail/Metro/Underground)
    const n = parseInt(routeType);
    if (!Number.isNaN(n) && ((n >= 100 && n < 200) || (n >= 400 && n < 600))) return 'rail';
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
