import React, { useMemo } from 'react';
import { titleCase, getRouteLabel } from '../../../utils/format';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import {
  AgencyFilterChips,
  CardDirectionRow,
  SidebarCardHeader,
  SidebarCardHeaderBlock,
  SidebarCardList,
  SidebarCardSection,
  SidebarCardShell,
} from '../cardUi';
import StopRouteGroup, { stopRouteBestHeadway } from './StopRouteGroup';

export interface StopBranch {
  rKey: string;
  headsign: string | null;
  headway: number | null;
  stopPeriodHw: Partial<Record<string, number>> | undefined;
  directionId: number;
}

export interface StopRoute {
  shortName: string;
  longName: string;
  agencyName: string;
  branches: StopBranch[];
}

export interface NearbyConnection {
  rKey: string;
  routeShortName: string;
  routeLongName: string;
  agencyName: string;
  headway: number | null;
  nearestStopName: string;
  distanceMeters: number;
}

export interface DebugRow {
  routeId: string;
  shortName: string;
  dir: number;
  headsign: string;
  stopHw: number | null;
  routeHw: number | null;
}

export interface CurrentStopData {
  stopName: string;
}

export interface StopCardProps {
  currentStop: CurrentStopData;
  setSelectedStop: (s: string | null) => void;
  setSelectedRoute: (r: string | null) => void;
  stopAgencies: string[];
  stopAgencyFilter: string | null;
  setStopAgencyFilter: React.Dispatch<React.SetStateAction<string | null>>;
  filteredStopRoutes: StopRoute[];
  period: TimePeriod;
  nearbyConnections: NearbyConnection[];
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  debugRows: DebugRow[];
}

export const StopCard: React.FC<StopCardProps> = ({
  currentStop,
  setSelectedStop,
  setSelectedRoute,
  stopAgencies,
  stopAgencyFilter,
  setStopAgencyFilter,
  filteredStopRoutes,
  period,
  nearbyConnections,
  showDebug,
  setShowDebug,
  debugRows,
}) => {
  const openRoute = (rKey: string) => {
    setSelectedStop(null);
    setSelectedRoute(rKey);
  };

  const sortedRoutes = useMemo(() => {
    return [...filteredStopRoutes].sort((a, b) => {
      const ah = stopRouteBestHeadway(a.branches, period);
      const bh = stopRouteBestHeadway(b.branches, period);
      if (ah == null) return 1;
      if (bh == null) return -1;
      return ah - bh;
    });
  }, [filteredStopRoutes, period]);

  return (
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        {stopAgencies.length === 1 ? (
          <SidebarCardHeader
            eyebrow={stopAgencies[0]}
            title={titleCase(currentStop.stopName)}
            titleClamp
          />
        ) : (
          <>
            <AgencyFilterChips
              agencies={stopAgencies}
              selected={stopAgencyFilter}
              onSelect={setStopAgencyFilter}
            />
            <SidebarCardHeader title={titleCase(currentStop.stopName)} titleClamp />
          </>
        )}
      </SidebarCardHeaderBlock>

      <SidebarCardList>
        {sortedRoutes.map(route => (
          <StopRouteGroup
            key={route.shortName}
            shortName={route.shortName}
            longName={route.longName}
            agencyName={route.agencyName}
            branches={route.branches}
            period={period}
            showAgency={stopAgencies.length > 1}
            onOpenRoute={openRoute}
          />
        ))}
      </SidebarCardList>

      {nearbyConnections.length > 0 && (
        <SidebarCardSection label="Within 10 min walk">
          {nearbyConnections.map(({ rKey, routeShortName, routeLongName, agencyName, headway, nearestStopName, distanceMeters }) => {
            const walkMin = Math.max(1, Math.round(distanceMeters / 80));
            return (
              <CardDirectionRow
                key={rKey}
                label={titleCase(getRouteLabel(routeShortName, routeLongName, agencyName))}
                subLabel={`${nearestStopName} · ${walkMin} min walk`}
                headway={headway ?? undefined}
                onClick={() => openRoute(rKey)}
              />
            );
          })}
        </SidebarCardSection>
      )}

      <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
        <button
          onClick={() => setShowDebug(v => !v)}
          className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
        >
          {showDebug ? '▾' : '▸'} debug headways
        </button>
        {showDebug && (
          <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
              <span>route / dir / headsign</span>
              <span>stop hw</span>
              <span>route hw</span>
              <span>used</span>
            </div>
            {debugRows.map((r, i) => (
              <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 ${r.stopHw != null ? 'text-[var(--text-primary)]' : ''}`}>
                <span className="truncate">{r.shortName} d{r.dir} {r.headsign}</span>
                <span>{r.stopHw != null ? `${r.stopHw}m` : '—'}</span>
                <span>{r.routeHw != null ? `${r.routeHw}m` : '—'}</span>
                <span>{r.stopHw != null ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SidebarCardShell>
  );
};
