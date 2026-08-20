import type { ShapeProperties } from '../hooks/useIntervalStats';

function dirIdNum(dirId: number | string | undefined | null): number {
  const n = Number(dirId);
  return Number.isFinite(n) ? n : 0;
}

/** Minimum real stops branches must share before being treated as the same physical trunk -- one
 *  shared stop can be a coincidental terminal. Matches scripts/detect-route-branches.ts's
 *  MIN_SHARED_STOPS; raised from 2 to 3 after #448's validation found 2 let Halifax 7A/7B and
 *  GoRaleigh 11/11L misclassify as sharing a trunk in one direction on a single coincidental
 *  terminal stop. */
export const MIN_SHARED_STOPS_FOR_TRUNK = 3;

/** Shared on-shape stops in the order used by the first branch. Caller should pre-filter to real,
 *  non-limited branches -- this only guards against branches with too little stop data to judge. */
export function sharedStopIds(branches: ShapeProperties[]): string[] {
  const withStops = branches.filter(d => (d.stopOrder?.length ?? 0) >= 2);
  if (withStops.length < 2) return [];

  const stopBranches = new Map<string, Set<number>>();
  withStops.forEach((branch, branchIndex) => {
    for (const stopId of new Set(branch.stopOrder)) {
      const branchSet = stopBranches.get(stopId) ?? new Set<number>();
      branchSet.add(branchIndex);
      stopBranches.set(stopId, branchSet);
    }
  });

  return withStops[0].stopOrder!.filter((stopId, index, order) =>
    order.indexOf(stopId) === index && (stopBranches.get(stopId)?.size ?? 0) >= 2,
  );
}

/**
 * True when two branches visit their shared stops in the same relative order -- a real shared
 * trunk. False when the order runs opposite: the same physical path traveled in reverse (e.g. a
 * loop route's two directions), which is not a combinable trunk even though the branches can
 * share every stop (#441: Durango's Trolley North/South share all 29 stops, just in reverse).
 * Not enough ordered pairs to judge -> true (don't block on ambiguous data).
 */
export function sharesOrderedTrunk(branchA: ShapeProperties, branchB: ShapeProperties, sharedStopIds: string[]): boolean {
  const indexA = new Map(branchA.stopOrder!.map((id, i) => [id, i]));
  const indexB = new Map(branchB.stopOrder!.map((id, i) => [id, i]));
  const pairs = sharedStopIds
    .map((id): [number, number] | null => {
      const a = indexA.get(id);
      const b = indexB.get(id);
      return a != null && b != null ? [a, b] : null;
    })
    .filter((pair): pair is [number, number] => pair != null)
    .sort((a, b) => a[0] - b[0]);
  if (pairs.length < 2) return true;
  let increasing = 0;
  let decreasing = 0;
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i][1] > pairs[i - 1][1]) increasing++;
    else if (pairs[i][1] < pairs[i - 1][1]) decreasing++;
  }
  return increasing >= decreasing;
}

/**
 * True when at least one same-direction pair between two groups of shapes shares a real trunk
 * (enough stops, in the same relative order). Used to gate whether two lettered route variants
 * should be treated as branches of one logical route at all (routeVariants.ts's
 * findVariantFamily) -- separate from, but built on the same primitives as,
 * shouldShowTrunkSummary's already-grouped-directions check (routeCardTrunk.ts).
 *
 * This is deliberately NOT a replacement for a hand-curated exclusion list: two distinct routes
 * can share a long real trunk (e.g. a shared downtown corridor) without being branches of the
 * same logical route (#448 found this for real on Windsor 1/1A/1C and TheBus 1/1L -- 14-50
 * shared stops in the correct order, yet still confirmed-separate routes). Geometry alone answers
 * "do these paths overlap," not "is this the same service" -- callers still need their own
 * judgment (name pattern, known exclusions) on top of this.
 *
 * Falls open (true) when neither group has real stop-order data to judge, matching
 * shouldShowTrunkSummary's own "missing data must not silently block a legitimate case" rule.
 */
export function hasSharedTrunk(shapesA: ShapeProperties[], shapesB: ShapeProperties[]): boolean {
  const realA = shapesA.filter(d => (d.stopOrder?.length ?? 0) >= 2);
  const realB = shapesB.filter(d => (d.stopOrder?.length ?? 0) >= 2);
  if (realA.length === 0 || realB.length === 0) return true;
  for (const a of realA) {
    for (const b of realB) {
      if (dirIdNum(a.directionId) !== dirIdNum(b.directionId)) continue;
      const shared = sharedStopIds([a, b]);
      if (shared.length >= MIN_SHARED_STOPS_FOR_TRUNK && sharesOrderedTrunk(a, b, shared)) return true;
    }
  }
  return false;
}
