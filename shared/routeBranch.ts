/**
 * Ride On publishes Flash Orange and Flash Blue under one GTFS route record.
 * The branch name is part of each trip headsign, so derive it during every
 * processing run instead of maintaining a separate data override.
 */
export function deriveRouteBranch(
  agencySlug: string | null | undefined,
  routeShortName: string | null | undefined,
  headsign: string | null | undefined,
): string | null {
  if (agencySlug !== 'rideon' || routeShortName?.toUpperCase() !== 'FLASH' || !headsign) return null;
  const match = headsign.match(/\(\s*(Orange|Blue)\s*\)\s*$/i);
  return match?.[1] ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : null;
}
