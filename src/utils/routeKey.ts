const BRANCH_MARKER = '::branch:';

export function buildRouteKey(agencySlug: string, routeId: string, routeBranch?: string | null): string {
  return routeBranch ? `${agencySlug}::${routeId}${BRANCH_MARKER}${routeBranch}` : `${agencySlug}::${routeId}`;
}

/** Split a canonical agency::route key without corrupting route IDs that contain ::. */
export function splitRouteKey(key: string): { agencySlug: string; routeId: string; routeBranch?: string } {
  const separator = key.indexOf('::');
  if (separator < 0) return { agencySlug: '', routeId: key };
  const routePart = key.slice(separator + 2);
  const branchSeparator = routePart.indexOf(BRANCH_MARKER);
  return {
    agencySlug: key.slice(0, separator),
    routeId: branchSeparator >= 0 ? routePart.slice(0, branchSeparator) : routePart,
    routeBranch: branchSeparator >= 0 ? routePart.slice(branchSeparator + BRANCH_MARKER.length) : undefined,
  };
}
