// Routes currently covered by Atlas's GTFS-RT schedule-adherence polling (see ROADMAP.md).
// Static for now — update as coverage expands.
export const LIVE_POLLING_ROUTES: Record<string, Set<string>> = {
  burlington: new Set(['1']),
  hamilton: new Set(['01']), // Hamilton's published routeShortName for King St is zero-padded
};

export function isLivePollingRoute(agencySlug?: string, routeShortName?: string | null): boolean {
  if (!agencySlug || !routeShortName) return false;
  return LIVE_POLLING_ROUTES[agencySlug]?.has(routeShortName) ?? false;
}
