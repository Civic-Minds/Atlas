/** One destination per direction — skip WESTBOUND/EASTBOUND chrome and inter-group divider. */
export function shouldShowDirectionSections(groups: { realTier: unknown[] }[]): boolean {
  if (groups.length <= 1) return false;
  const onePerDirection = groups.length === 2 && groups.every(g => g.realTier.length === 1);
  return !onePerDirection;
}

/** True when the same destination label is being used by more than one direction. */
export function hasDuplicateDirectionHeadsigns(
  groups: { realTier: Array<{ headsign?: string | null }> }[],
): boolean {
  const headsigns = groups.map(group => new Set(
    group.realTier
      .map(branch => branch.headsign?.trim().toLowerCase())
      .filter((headsign): headsign is string => Boolean(headsign)),
  ));
  return headsigns.some((group, index) =>
    headsigns.slice(index + 1).some(other => [...group].some(headsign => other.has(headsign))),
  );
}
