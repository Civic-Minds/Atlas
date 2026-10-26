/**
 * The one switch for every History v2 behaviour: ATLAS_HISTORY_V2=1.
 * Unset (the weekly refresh-feeds cron) means the published history output is exactly what
 * origin/main produces. A tiny file of its own so the key function can read it without a cycle.
 */
export function historyV2Enabled(envValue: string | undefined): boolean {
  return envValue === '1';
}

/** True when this process was started with ATLAS_HISTORY_V2=1. */
export function historyV2FromEnv(): boolean {
  return historyV2Enabled(process.env.ATLAS_HISTORY_V2);
}
