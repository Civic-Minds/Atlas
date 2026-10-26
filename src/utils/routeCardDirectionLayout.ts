/**
 * Whether the route card shows its direction headings (Eastbound/Westbound...) and the divider
 * between them. A single direction never does. Two directions with one row each show them when
 * their compass labels differ (Ryan, 2026-10-20: TTC 36 reads Eastbound / to Finch and
 * Westbound / to Finch West Station); without two distinct labels they stay hidden as before.
 * Any direction with more than one row shows them.
 */
export function shouldShowDirectionSections(groups: { realTier: unknown[]; boundLabel?: string }[]): boolean {
  if (groups.length <= 1) return false;
  const onePerDirection = groups.length === 2 && groups.every(g => g.realTier.length === 1);
  if (!onePerDirection) return true;
  const [a, b] = groups.map(g => g.boundLabel?.trim().toLowerCase() ?? '');
  return a !== '' && b !== '' && a !== b;
}
