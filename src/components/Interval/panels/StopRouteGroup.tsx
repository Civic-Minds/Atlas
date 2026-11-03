import { isLivePollingRoute } from '../../../utils/livePolling';
import { resolveBranchLabel } from '../../../utils/format';
import RouteRowName from '../../RouteRowName';
import type { HoveredBranch, TimePeriod } from '../../../hooks/useIntervalStats';
import {
  CardDirectionRow,
  CardSummaryRow,
  SidebarCardListRows,
} from '../cardUi';
import { stopRouteLineHeadway, stopRowHeadway, type StopBranch } from '../../../utils/stopRoutes';
import type { RouteLabel } from '../../../utils/routeFacts';
import { SHARED_STRETCH_LABEL } from '../../../content/noticeCopy';

interface Props {
  shortName: string;
  /** What the row shows (route facts' label, CIV-984); the short name is only the route's identity. */
  label: RouteLabel;
  longName: string;
  branches: StopBranch[];
  period: TimePeriod;
  onOpenRoute: (rKey: string) => void;
  /** The map hover (CIV-918): a destination row shows its route and direction on the map. */
  hoveredBranch?: HoveredBranch | null;
  setHoveredBranch?: (branch: HoveredBranch | null) => void;
}

/** One route at a stop: its name, then each destination as a route card row (CIV-918). */
export default function StopRouteGroup({
  shortName,
  label,
  longName,
  branches,
  period,
  onOpenRoute,
  hoveredBranch = null,
  setHoveredBranch,
}: Props) {
  const routeParts = label;
  // The list rule (CIV-928): "**504** King", not "504 — King".
  const routeLabel = <RouteRowName shortName={routeParts.primary} name={routeParts.secondary} />;
  const hasMultipleDirections = new Set(branches.map(b => b.directionId)).size > 1;

  // Destinations ordered by direction, with no line between directions and no direction headings (CIV-918).
  const items = branches
    .map(branch => ({
      ...branch,
      label: resolveBranchLabel({
        headsign: branch.headsign,
        shortName,
        longName,
        directionId: branch.directionId,
        multipleDirections: hasMultipleDirections,
      }),
      // #934: part-period wording replaces the number. The row value never overstates (stopRowHeadway).
      hw: stopRowHeadway(branch, period),
    }))
    .filter(item => item.label)
    .sort((a, b) => a.directionId - b.directionId);
  // CIV-1078: where a direction's destinations share the stop, the route card's "Shared stretch" row carries their
  // combined value above that direction's rows (stopRouteLineHeadway: only where it is better than every destination).
  const directionIds = [...new Set(items.map(item => item.directionId))];
  // A direction with one destination has no branches to combine: no shared row there, as on the route card.
  const sharedByDirection = new Map(directionIds.map(dirId => {
    const rows = items.filter(item => item.directionId === dirId);
    return [dirId, rows.length > 1 ? stopRouteLineHeadway(rows, period) : null];
  }));
  // CIV-1251 row 8: a shared stretch that starts late or ends early gives its own words ("every 15 min from 8:07 AM").
  const sharedEdgeByDirection = new Map(directionIds.map(dirId => [dirId, items.find(item => item.directionId === dirId)?.sharedEdge]));

  if (items.length === 0) return null;

  const rKey = branches[0]?.rKey ?? '';
  const slug = rKey.split('::')[0] ?? '';
  // The route line shows the whole route on the map (CIV-1053); a row of another route fades.
  const routeHovered = !!hoveredBranch && hoveredBranch.routeKey === rKey && hoveredBranch.directionId == null;
  const otherRouteHovered = !!hoveredBranch && hoveredBranch.routeKey !== rKey;
  const live = isLivePollingRoute(slug, shortName);

  // The route card's rows (CIV-918): every destination has its own frequency on its first line, and
  // hovering one shows that route and direction on the map.
  return (
    <div>
      <CardSummaryRow
        label={routeLabel}
        onClick={() => onOpenRoute(rKey)}
        {...(setHoveredBranch ? {
          onHoverStart: () => setHoveredBranch({ routeKey: rKey }),
          onHoverEnd: () => setHoveredBranch(null),
          dimmed: otherRouteHovered,
        } : {})}
      />
      <SidebarCardListRows className="space-y-1 mt-0.5">
        {items.flatMap((item, i) => {
          const sharedEdge = sharedEdgeByDirection.get(item.directionId);
          const sharedHeadway = sharedEdge?.every ?? sharedByDirection.get(item.directionId);
          const sharedHovered = !!hoveredBranch && hoveredBranch.routeKey === rKey
            && hoveredBranch.directionId === item.directionId && hoveredBranch.headsign == null;
          // The direction's first row: the shared row goes above it, as on the route card (CIV-937).
          const sharedRow = sharedHeadway != null && items[i - 1]?.directionId !== item.directionId ? [
            <CardDirectionRow
              key={`${rKey}::${item.directionId}::shared`}
              label={SHARED_STRETCH_LABEL}
              headway={sharedHeadway}
              headwayLabel={sharedEdge?.text}
              onClick={() => onOpenRoute(rKey)}
              {...(setHoveredBranch ? {
                onHoverStart: () => setHoveredBranch({ routeKey: rKey, directionId: item.directionId }),
                onHoverEnd: () => setHoveredBranch(null),
                branchHovered: sharedHovered,
                branchDimmed: !!hoveredBranch && !sharedHovered && !routeHovered,
              } : {})}
            />,
          ] : [];
          const hovered = !!hoveredBranch && hoveredBranch.routeKey === item.rKey
            && hoveredBranch.directionId === item.directionId && hoveredBranch.headsign === (item.headsign ?? undefined);
          return [...sharedRow, (
            <CardDirectionRow
              key={`${item.rKey}::${item.directionId}::${item.headsign ?? ''}`}
              label={item.label}
              labelWeight="regular"
              singleLine
              headway={item.hw ?? undefined}
              limited={item.periodText != null}
              limitedLabel={item.periodText}
              live={live}
              onClick={() => onOpenRoute(item.rKey)}
              {...(setHoveredBranch && item.headsign ? {
                onHoverStart: () => setHoveredBranch({ routeKey: item.rKey, directionId: item.directionId, headsign: item.headsign ?? undefined }),
                onHoverEnd: () => setHoveredBranch(null),
                branchHovered: hovered,
                branchDimmed: !!hoveredBranch && !hovered && !routeHovered,
              } : {})}
            />
          )];
        })}
      </SidebarCardListRows>
    </div>
  );
}
