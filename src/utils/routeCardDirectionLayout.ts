/** One destination per direction — skip WESTBOUND/EASTBOUND chrome and inter-group divider. */
export function shouldShowDirectionSections(groups: { realTier: unknown[] }[]): boolean {
  if (groups.length <= 1) return false;
  const onePerDirection = groups.length === 2 && groups.every(g => g.realTier.length === 1);
  return !onePerDirection;
}
