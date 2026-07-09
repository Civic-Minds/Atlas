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
import LiveStopArrivals from './LiveStopArrivals';

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
  onDirectFromStop?: () => void;
  /** Live arrivals lookup — set when the stop belongs to a live-capable agency. */
  liveStop?: { slug: string; stopId: string } | null;
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
  onDirectFromStop,
  liveStop,
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

      {onDirectFromStop && (
        <button
          type="button"
          onClick={onDirectFromStop}
          className="mb-3 text-[10px] font-bold text-[var(--accent)] hover:opacity-80 transition-opacity text-left"
        >
          Corridors from here…
        </button>
      )}

      {liveStop && <LiveStopArrivals slug={liveStop.slug} stopId={liveStop.stopId} />}

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
    </SidebarCardShell>
  );
};
