import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { labelDirectionGroups, sortDirectionGroupIds } from './directionLabel';
import { hasDirectionPeriodService, routeCardDisplayHeadway } from './effectiveHeadway';
import { dedupeCrossDirectionHeadsigns } from './crossDirectionDedup';
import { branchDisplayPeriodHeadway, buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';
import { hasStretchRoles, stretchRowFeatures, variantOnlyRow } from './stretchCard';

export interface RouteCardDirectionGroup {
  dirId: number;
  realTier: ShapeProperties[];
  span: ShapeProperties[];
  boundLabel?: string;
}

/**
 * The route card's direction groups (moved out of SidebarControls so tests and sweeps run the card's own rows).
 * Group directions by directionId so outbound/inbound are visually separated,
 * and collapse multiple span patterns in the same group into one row.
 */
export function buildDirectionGroups(
  currentRoute: { directions: ShapeProperties[] } | null | undefined,
  period: TimePeriod,
  directionLabelOverrides?: Record<string, string>,
): RouteCardDirectionGroup[] {
  if (!currentRoute) return [];
  const routeFeatures = (currentRoute as { features?: GeoJSON.Feature[] }).features ?? [];
  type Group = { dirId: number; realTier: ShapeProperties[]; span: ShapeProperties[]; boundLabel?: string };
  const map = new Map<number, Group>();
  for (const d of currentRoute.directions) {
    const dirId = d.directionId ?? 0;
    if (!map.has(dirId)) map.set(dirId, { dirId, realTier: [], span: [] });
    const g = map.get(dirId)!;
    // A span branch can still contain a numeric period gap when a few
    // short-turn trips are clustered together (e.g. LA Metro 182). The
    // pipeline marks that pattern as limited service; do not promote it to
    // a normal route-card row just because the gap is numerically defined.
    if (d.tier === 'span') {
      g.span.push(d);
    } else if (
      metricValueForPeriod(buildRouteServiceSummary(d).branch, period) != null
      || hasDirectionPeriodService(d, period)
    ) {
      g.realTier.push(d);
    }
    // Else: normal (non-span) service that simply has no data for the
    // selected period — e.g. a daytime-only route viewed at 3am. Omit it
    // entirely rather than mislabeling it "limited service" (#227); a
    // route not running right now isn't the same as a genuinely
    // short-window/peak-only pattern.
  }
  // Frequency focus: when the data carries the stretch roles, a direction's rows are its main stretch and its tails (one row
  // each); variants such as short turns get no destination row. A direction with no main or tail feature keeps today's rows.
  for (const g of map.values()) {
    const directionFeatures = currentRoute.directions.filter(d => (d.directionId ?? 0) === g.dirId);
    if (!hasStretchRoles(directionFeatures)) continue;
    let rows = stretchRowFeatures(directionFeatures, period).filter(d =>
      metricValueForPeriod(buildRouteServiceSummary(d).branch, period) != null || hasDirectionPeriodService(d, period));
    // With tails, the shared main stretch is the trunk they hang off: it gets a row only when it has a cadence of its own to show.
    const variantRow = variantOnlyRow(directionFeatures);
    if (variantRow) rows = [variantRow];
    if (rows.some(d => d.stretchRole === 'tail')) rows = rows.filter(d => d.stretchRole !== 'main' || routeCardDisplayHeadway(d, period) != null);
    if (rows.length > 0) { g.realTier = rows; g.span = []; }
  }
  // Deduplicate realTier entries with the same headsign — keep the one with the best (lowest) headway.
  // Multiple shape variants can share the same headsign (e.g. different mid-route detours), producing
  // visually identical rows in the sidebar.
  for (const g of map.values()) {
    const seen = new Map<string, ShapeProperties>();
    for (const d of g.realTier) {
      // Normalize for dedup (post-clean from data) to handle any remaining variants
      const headsignKey = (d.headsign ?? '').trim().toLowerCase();
      const variantKey = d.routeVariant?.trim().toLowerCase();
      const key = variantKey ? `${headsignKey}::${variantKey}` : headsignKey;
      const existing = seen.get(key);
      const branchValue = branchDisplayPeriodHeadway(d, period) ?? Infinity;
      const existingValue = existing ? branchDisplayPeriodHeadway(existing, period) ?? Infinity : Infinity;
      if (!existing || branchValue < existingValue) seen.set(key, d);
    }
    g.realTier = Array.from(seen.values());
    g.realTier.sort((a, b) => {
      const aHeadway = routeCardDisplayHeadway(a, period) ?? Infinity;
      const bHeadway = routeCardDisplayHeadway(b, period) ?? Infinity;
      return aHeadway - bHeadway;
    });
  }
  const groups = Array.from(map.values());
  if (groups.length > 1 && routeFeatures.length > 0) {
    const dirIds = groups.map(g => g.dirId);
    const boundLabels = labelDirectionGroups(routeFeatures, dirIds, directionLabelOverrides);
    for (const g of groups) {
      const label = boundLabels.get(g.dirId);
      if (label) g.boundLabel = label;
    }
    const sortOrder = sortDirectionGroupIds(routeFeatures, dirIds);
    groups.sort((a, b) => sortOrder.indexOf(a.dirId) - sortOrder.indexOf(b.dirId));
  }
  if (groups.length > 1 && routeFeatures.length > 0) {
    dedupeCrossDirectionHeadsigns(groups, routeFeatures);
  }
  return groups;
}
