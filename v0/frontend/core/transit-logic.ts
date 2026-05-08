/**
 * transit-logic.ts — re-export barrel.
 *
 * The pipeline is split into focused modules:
 *   transit-utils.ts     — t2m, m2t, computeMedian, getModeName
 *   transit-calendar.ts  — detectReferenceDate, getActiveServiceIds
 *   transit-phase1.ts    — computeRawDepartures (raw GTFS extraction)
 *   transit-phase2.ts    — applyAnalysisCriteria, determineTier, computeHeadwayStats, calculateTiers
 *   transit-corridors.ts — calculateCorridors
 *   transit-spacing.ts   — calculateStopSpacing
 *
 * All public exports are re-exported here so existing imports stay unchanged.
 */

export { t2m, m2t, computeMedian, getModeName, DAY_FIELD_MAP } from './transit-utils';
export { detectReferenceDate, getActiveServiceIds } from './transit-calendar';
export { computeRawDepartures } from './transit-phase1';
export { determineTier, computeHeadwayStats, applyAnalysisCriteria, calculateTiers } from './transit-phase2';
export { calculateCorridors } from './transit-corridors';
export { calculateStopSpacing } from './transit-spacing';
