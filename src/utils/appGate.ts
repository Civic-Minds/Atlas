export type AppId = 'frequency' | 'history' | 'live' | 'night';

interface GateFlags {
  live: boolean;
  history: boolean;
  researchApps: boolean;
}

/** Old app URLs that no longer exist; they redirect to the frequency map. */
export const RETIRED_APP_PATHS: readonly string[] = ['/apps/corridors', '/apps/fares'];

/** True when a routed app must fall back to the frequency map. */
export function isAppGated(app: AppId, flags: GateFlags): boolean {
  return (app === 'live' && !flags.live)
    || (app === 'history' && !flags.history)
    || (app === 'night' && !flags.researchApps);
}

/**
 * Compare's own address, like History's /apps/history. Compare is a view on the frequency map (the same
 * map, split in two), so this path renders the map with Compare on.
 */
export const COMPARE_PATH = '/apps/compare';

/** The addresses that show the plain frequency map. */
export const MAP_PATHS: readonly string[] = ['/', '/apps/frequency'];

/** True when /apps/compare must fall back to the map: Compare is off in this build, or this is a phone. */
export function isCompareGated(pathname: string, compareOn: boolean): boolean {
  return pathname === COMPARE_PATH && !compareOn;
}

/**
 * What Compare does when the address moves (back and forward, or the Compare tab in Live or History going
 * straight to /apps/compare): arriving at /apps/compare turns it on, leaving /apps/compare turns it off.
 */
export function compareStepForPathChange(previous: string, next: string, compareActive: boolean): 'start' | 'exit' | null {
  if (previous === next) return null;
  if (next === COMPARE_PATH) return compareActive ? null : 'start';
  if (previous === COMPARE_PATH && compareActive) return 'exit';
  return null;
}
