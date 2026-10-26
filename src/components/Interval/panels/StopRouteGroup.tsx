import React from 'react';
import { isLivePollingRoute } from '../../../utils/livePolling';
import { routeLabels, resolveBranchLabel } from '../../../utils/format';
import RouteRowName from '../../RouteRowName';
import { metricValueForPeriod } from '../../../utils/routeFacts';
import type { HoveredBranch, TimePeriod } from '../../../hooks/useIntervalStats';
import {
  CardDirectionRow,
  CardSummaryRow,
  SidebarCardListRows,
} from '../cardUi';
import type { StopBranch } from './StopCard';

function branchHeadway(branch: StopBranch, period: TimePeriod): number | null {
  return metricValueForPeriod(branch.service, period);
}

/** The less frequent of the branch's own value and the stop's value, so a destination is never overstated. */
function rowHeadway(branchValue: number | null, stopValue: number | null): number | null {
  if (branchValue == null) return stopValue;
  if (stopValue == null) return branchValue;
  return Math.max(branchValue, stopValue);
}

interface Props {
  shortName: string;
  longName: string;
  agencyName: string;
  agencySlug?: string;
  routeType?: number;
  branches: StopBranch[];
  period: TimePeriod;
  showAgency: boolean;
  onOpenRoute: (rKey: string) => void;
  /** The map hover (CIV-918): a destination row shows its route and direction on the map. */
  hoveredBranch?: HoveredBranch | null;
  setHoveredBranch?: (branch: HoveredBranch | null) => void;
}

/** One route at a stop: its name, then each destination as a route card row (CIV-918). */
export default function StopRouteGroup({
  shortName,
  longName,
  agencyName,
  agencySlug,
  routeType,
  branches,
  period,
  showAgency,
  onOpenRoute,
  hoveredBranch = null,
  setHoveredBranch,
}: Props) {
  const routeParts = routeLabels({ shortName, longName, routeType, agencySlug, agencyName: showAgency ? agencyName : undefined });
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
      // #934: part-period wording replaces the number, as on the route card's row. A row never claims more
      // service than either measure gives: the stop's value counts every trip of the direction (504A and
      // 504B together), and the branch's route-wide value can count trips that don't reach this stop.
      hw: branch.periodText ? null : rowHeadway(branch.rowHeadway ?? null, branchHeadway(branch, period)),
    }))
    .filter(item => item.label)
    .sort((a, b) => a.directionId - b.directionId);
  // Where the route's patterns share the stop (504A and 504B at King and Bay), the route comes more often
  // than any one destination: the route line keeps the stop's value, as the stop card showed before.
  const rowValues = items.map(item => item.hw).filter((hw): hw is number => hw != null);
  const pooledValues = items.map(item => (item.periodText ? null : branchHeadway(item, period))).filter((hw): hw is number => hw != null);
  const pooled = pooledValues.length > 0 ? Math.min(...pooledValues) : null;
  const routeHeadway = pooled != null && rowValues.length > 0 && pooled < Math.min(...rowValues) ? pooled : null;

  if (items.length === 0) return null;

  const slug = branches[0]?.rKey.split('::')[0] ?? '';
  const live = isLivePollingRoute(slug, shortName);

  // The route card's rows (CIV-918): every destination has its own frequency on its first line, and
  // hovering one shows that route and direction on the map.
  return (
    <div>
      <CardSummaryRow
        label={routeLabel}
        onClick={() => onOpenRoute(branches[0]?.rKey ?? '')}
        headway={routeHeadway}
      />
      <SidebarCardListRows className="space-y-1 mt-0.5">
        {items.map(item => {
          const hovered = !!hoveredBranch && hoveredBranch.routeKey === item.rKey
            && hoveredBranch.directionId === item.directionId && hoveredBranch.headsign === (item.headsign ?? undefined);
          return (
            <CardDirectionRow
              key={`${item.rKey}::${item.directionId}::${item.headsign ?? ''}`}
              label={item.label}
              labelWeight="regular"
              headway={item.hw ?? undefined}
              limited={item.periodText != null}
              limitedLabel={item.periodText}
              live={live}
              onClick={() => onOpenRoute(item.rKey)}
              {...(setHoveredBranch && item.headsign ? {
                onHoverStart: () => setHoveredBranch({ routeKey: item.rKey, directionId: item.directionId, headsign: item.headsign ?? undefined }),
                onHoverEnd: () => setHoveredBranch(null),
                branchHovered: hovered,
                branchDimmed: !!hoveredBranch && !hovered,
              } : {})}
            />
          );
        })}
      </SidebarCardListRows>
    </div>
  );
}

export function stopRouteBestHeadway(branches: StopBranch[], period: TimePeriod): number | null {
  const vals = branches.map(b => branchHeadway(b, period)).filter((h): h is number => h != null);
  return vals.length ? Math.min(...vals) : null;
}
