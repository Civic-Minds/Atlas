import type { AtlasMode } from './config.js';

export interface BrowserAgencyVisibility {
  staged?: boolean;
  hiddenInProduction?: boolean;
  betaOnly?: boolean;
}

export interface AgencyVisibilityContext {
  mode: AtlasMode;
}

/** Whether an agency belongs in the browser's current agency catalog. */
export function isAgencyVisibleInBrowser(
  agency: BrowserAgencyVisibility,
  context: AgencyVisibilityContext,
): boolean {
  if (agency.staged) return false;
  return !agency.hiddenInProduction || context.mode === 'dev' || (context.mode === 'beta' && agency.betaOnly === true);
}
