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
