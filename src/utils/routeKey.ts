/** Split a canonical agency::route key without corrupting route IDs that contain ::. */
export function splitRouteKey(key: string): { agencySlug: string; routeId: string } {
  const separator = key.indexOf('::');
  if (separator < 0) return { agencySlug: '', routeId: key };
  return {
    agencySlug: key.slice(0, separator),
    routeId: key.slice(separator + 2),
  };
}
