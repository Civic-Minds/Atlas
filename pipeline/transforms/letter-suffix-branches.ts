import type { GtfsData, GtfsRoute } from '../../types/gtfs';

export interface LetterSuffixBranchMergeResult {
  mergedPairs: Array<{ parentShort: string; branchShort: string; longName: string }>;
  tripsReassigned: number;
  skippedBranches: string[];
}

function normalizeName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Branch long name must clearly extend the parent corridor — avoids merging unrelated `90` / `90 A`. */
function longNamesCompatible(parent: GtfsRoute, branch: GtfsRoute): boolean {
  const parentLong = normalizeName(parent.route_long_name);
  const branchLong = normalizeName(branch.route_long_name);
  if (!parentLong || !branchLong) return false;
  if (branchLong.startsWith(parentLong)) return true;

  const stripTrailingLetter = (s: string) => s.replace(/\s+[a-z]$/, '');
  const parentBase = stripTrailingLetter(parentLong);
  if (stripTrailingLetter(branchLong) === parentBase) return true;

  const parentHead = parentLong.split(' - ')[0]?.trim() ?? '';
  const branchHead = branchLong.split(' - ')[0]?.trim() ?? '';
  return parentHead.length >= 4 && branchHead.startsWith(parentHead);
}

/**
 * GTFS feeds often publish letter-branches as separate routes (`blue` + `blue B`).
 * Reassign branch trips onto the parent route_id when long names prove same corridor.
 * Runs for all agencies by default; set skipLetterSuffixMerge to opt out.
 */
export function mergeLetterSuffixBranches(gtfs: GtfsData): { gtfs: GtfsData; result: LetterSuffixBranchMergeResult } {
  const routes = gtfs.routes ?? [];
  const byShort = new Map<string, GtfsRoute>();
  for (const route of routes) {
    const key = normalizeName(route.route_short_name);
    if (key) byShort.set(key, route);
  }

  const branchToParent = new Map<string, string>();
  const mergedPairs: LetterSuffixBranchMergeResult['mergedPairs'] = [];
  const skippedBranches: string[] = [];

  for (const route of routes) {
    const branchShort = (route.route_short_name ?? '').trim();
    const match = branchShort.match(/^(.+?)\s+([A-Z])$/);
    if (!match) continue;

    const parent = byShort.get(normalizeName(match[1]));
    if (!parent) {
      skippedBranches.push(branchShort);
      continue;
    }

    if (parent.route_type !== route.route_type) {
      skippedBranches.push(branchShort);
      continue;
    }

    if (!longNamesCompatible(parent, route)) {
      skippedBranches.push(branchShort);
      continue;
    }

    branchToParent.set(route.route_id, parent.route_id);
    mergedPairs.push({
      parentShort: parent.route_short_name ?? match[1],
      branchShort,
      longName: parent.route_long_name ?? route.route_long_name ?? '',
    });
  }

  if (branchToParent.size === 0) {
    return {
      gtfs,
      result: { mergedPairs, tripsReassigned: 0, skippedBranches },
    };
  }

  const removedRouteIds = new Set(branchToParent.keys());
  let tripsReassigned = 0;

  const trips = (gtfs.trips ?? []).map(trip => {
    const target = branchToParent.get(trip.route_id);
    if (!target) return trip;
    tripsReassigned++;
    return { ...trip, route_id: target };
  });

  return {
    gtfs: {
      ...gtfs,
      routes: routes.filter(r => !removedRouteIds.has(r.route_id)),
      trips,
    },
    result: { mergedPairs, tripsReassigned, skippedBranches },
  };
}
