import React from 'react';
import { isLivePollingRoute } from '../../../utils/livePolling';
import { titleCase, getRouteLabel, resolveBranchLabel } from '../../../utils/format';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import {
  CardDirectionRow,
  CardDivider,
  CardSublineButton,
  CardSummaryRow,
  SidebarCardListRows,
} from '../cardUi';
import type { StopBranch } from './StopCard';

function branchHeadway(branch: StopBranch, period: TimePeriod): number | null {
  return (period !== 'all' ? branch.stopPeriodHw?.[period] : undefined) ?? branch.headway;
}

interface Props {
  shortName: string;
  longName: string;
  agencyName: string;
  branches: StopBranch[];
  period: TimePeriod;
  showAgency: boolean;
  onOpenRoute: (rKey: string) => void;
}

/** One route at a stop — shared headway collapsed, flat list (#102). */
export default function StopRouteGroup({
  shortName,
  longName,
  agencyName,
  branches,
  period,
  showAgency,
  onOpenRoute,
}: Props) {
  const routeLabel = titleCase(getRouteLabel(shortName, longName, showAgency ? agencyName : undefined));
  const hasMultipleDirections = new Set(branches.map(b => b.directionId)).size > 1;

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
      hw: branchHeadway(branch, period),
    }))
    .filter(item => item.label);

  if (items.length === 0) return null;

  const headways = items.map(i => i.hw).filter((h): h is number => h != null);
  const allSame = headways.length > 0 && headways.every(h => h === headways[0]);
  const slug = branches[0]?.rKey.split('::')[0] ?? '';
  const live = isLivePollingRoute(slug, shortName);

  const single = items.length === 1;
  const compact = items.length > 1 && allSame;

  if (single) {
    const item = items[0];
    return (
      <CardSummaryRow
        label={routeLabel}
        onClick={() => onOpenRoute(item.rKey)}
        headway={item.hw}
        live={live}
        below={(
          <CardSublineButton onClick={() => onOpenRoute(item.rKey)} className="mt-0.5">
            {item.label}
          </CardSublineButton>
        )}
      />
    );
  }

  if (compact) {
    const sharedHw = headways[0]!;
    return (
      <div>
        <CardSummaryRow
          label={routeLabel}
          onClick={() => onOpenRoute(branches[0]?.rKey ?? '')}
          headway={sharedHw}
          live={live}
        />
        <div className="space-y-0.5">
          {(() => {
            let lastDir: number | null = null;
            return items.map(item => {
              const showDivider = hasMultipleDirections && lastDir !== null && item.directionId !== lastDir;
              lastDir = item.directionId;
              return (
                <React.Fragment key={`${item.rKey}::${item.directionId}::${item.headsign ?? ''}`}>
                  {showDivider && <CardDivider className="my-1" />}
                  <CardSublineButton onClick={() => onOpenRoute(item.rKey)}>
                    {item.label}
                  </CardSublineButton>
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>
    );
  }

  return (
    <div>
      <CardSummaryRow
        label={routeLabel}
        onClick={() => onOpenRoute(branches[0]?.rKey ?? '')}
      />
      <SidebarCardListRows className="space-y-1 mt-0.5">
        {items.map(item => (
          <CardDirectionRow
            key={`${item.rKey}::${item.directionId}::${item.headsign ?? ''}`}
            label={item.label}
            headway={item.hw ?? undefined}
            live={live}
            onClick={() => onOpenRoute(item.rKey)}
          />
        ))}
      </SidebarCardListRows>
    </div>
  );
}

export function stopRouteBestHeadway(branches: StopBranch[], period: TimePeriod): number | null {
  const vals = branches.map(b => branchHeadway(b, period)).filter((h): h is number => h != null);
  return vals.length ? Math.min(...vals) : null;
}
