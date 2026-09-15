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

export interface RouteDisplayCandidate {
  key: string;
  agencySlug: string;
  shortName: string;
  longName?: string | null;
}

/** Collapse feed route IDs that render as the same line to a rider. */
export function dedupeRouteKeysByDisplay(candidates: RouteDisplayCandidate[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const candidate of candidates) {
    const displayKey = [candidate.agencySlug, candidate.shortName, candidate.longName ?? '']
      .map(value => value.trim().toLowerCase())
      .join('::');
    if (seen.has(displayKey)) continue;
    seen.add(displayKey);
    keys.push(candidate.key);
  }
  return keys;
}
