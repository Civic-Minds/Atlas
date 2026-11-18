/**
 * The one switch for every History v2 behaviour: ATLAS_HISTORY_V2=1.
 * Unset (the weekly refresh-feeds cron) means the published history output is exactly what
 * origin/main produces. A tiny file of its own so the key function can read it without a cycle.
 */
import { historyV2Enabled } from '../shared/rules/flags.js';

// The switch's rule lives in shared/rules/flags.ts (rules audit, move 10); this file reads the env.
export { historyV2Enabled };

/**
 * CIV-1425 pilot: agencies whose History v2 sidecars also store Saturday/Sunday per-period values.
 * ATLAS_HISTORY_WEEKEND_PERIODS is a comma list of slugs (e.g. "mbta"); unset = none, so every
 * other agency's sidecar stays byte-identical.
 */
export function historyWeekendPeriodsFor(slug: string, envValue: string | undefined = process.env.ATLAS_HISTORY_WEEKEND_PERIODS): boolean {
  return (envValue ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(slug);
}

/** True when this process was started with ATLAS_HISTORY_V2=1. */
export function historyV2FromEnv(): boolean {
  return historyV2Enabled(process.env.ATLAS_HISTORY_V2);
}
