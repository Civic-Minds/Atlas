import type { AppId } from '../components/AppDrawer';

interface GateFlags {
  live: boolean;
  history: boolean;
  corridors: boolean;
  researchApps: boolean;
}

/** Apps with no flag that are not ready for the public site; they are never reachable by URL. */
const UNRELEASED_APPS: readonly AppId[] = ['fares'];

/** True when a routed app must fall back to the frequency map. */
export function isAppGated(app: AppId, flags: GateFlags): boolean {
  if (UNRELEASED_APPS.includes(app)) return true;
  return (app === 'live' && !flags.live)
    || (app === 'history' && !flags.history)
    || (app === 'corridors' && !flags.corridors)
    || (app === 'night' && !flags.researchApps);
}
