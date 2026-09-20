export interface BrowserAgencyVisibility {
  staged?: boolean;
  hiddenInProduction?: boolean;
  betaOnly?: boolean;
}

export interface AgencyVisibilityContext {
  development: boolean;
  betaEnabled: boolean;
}

/** Whether an agency belongs in the browser's current agency catalog. */
export function isAgencyVisibleInBrowser(
  agency: BrowserAgencyVisibility,
  context: AgencyVisibilityContext,
): boolean {
  if (agency.staged) return false;
  return !agency.hiddenInProduction || context.development || (context.betaEnabled && agency.betaOnly === true);
}
