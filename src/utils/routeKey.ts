import { getRouteLabel } from '../../shared/cleanHeadsign';

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

/**
 * The map's key for a whole route named by its short name (Live keys routes by short name): the route's own ID,
 * never one branch, so the shared selection lights up every branch. Prefers the given day's feature.
 */
export function routeKeyForShortName(
  agencySlug: string,
  features: readonly GeoJSON.Feature[],
  routeShortName: string,
  day?: string | null,
): string | null {
  const matches = features.filter(f => String((f.properties as { routeShortName?: unknown } | null)?.routeShortName ?? '') === routeShortName);
  const feature = (day ? matches.find(f => (f.properties as { day?: unknown }).day === day) : undefined) ?? matches[0];
  const routeId = (feature?.properties as { routeId?: unknown } | undefined)?.routeId;
  return routeId != null && routeId !== '' ? buildRouteKey(agencySlug, String(routeId)) : null;
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
    // Deduplicate on the label riders actually see, not the raw GTFS fields.
    // Feeds can represent the same branded line with different internal IDs,
    // casing, or redundant short/long-name combinations.
    const displayLabel = getRouteLabel(candidate.shortName, candidate.longName).trim().toLowerCase().replace(/\s+/g, ' ');
    const displayKey = `${candidate.agencySlug.trim().toLowerCase()}::${displayLabel}`;
    if (seen.has(displayKey)) continue;
    seen.add(displayKey);
    keys.push(candidate.key);
  }
  return keys;
}
