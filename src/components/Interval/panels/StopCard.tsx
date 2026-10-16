import React, { useMemo } from 'react';
import { titleCase, routeLabels } from '../../../utils/format';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import {
  AgencyFilterChips,
  CardDirectionRow,
  SidebarCardHeader,
  SidebarCardHeaderBlock,
  SidebarCardList,
  SidebarCardSection,
  SidebarCardShell,
  CardReportButton,
  CardBackButton,
  FlaggableValue,
  type CardReportButtonHandle,
} from '../cardUi';
import { currentAtlasUrl } from '../../../utils/reportIssue';
import StopRouteGroup, { stopRouteBestHeadway } from './StopRouteGroup';
import LiveStopArrivals from './LiveStopArrivals';
import type { HeadwayMetric } from '../../../utils/routeFacts';

export interface StopBranch {
  rKey: string;
  headsign: string | null;
  service: HeadwayMetric;
  directionId: number;
}

export interface StopRoute {
  shortName: string;
  longName: string;
  agencyName: string;
  agencySlug?: string;
  routeType?: number;
  branches: StopBranch[];
}

export interface NearbyConnection {
  rKey: string;
  routeShortName: string;
  routeLongName: string;
  agencyName: string;
  agencySlug?: string;
  routeType?: number;
  headway: number | null;
  nearestStopName: string;
  distanceMeters: number;
}

export interface CurrentStopData {
  stopName: string;
  direction?: string;
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
  /** Live arrivals lookup — set when the stop belongs to a live-capable agency. */
  liveStop?: { slug: string; stopId: string; lat: number; lon: number } | null;
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
  liveStop,
}) => {
  const reportRef = React.useRef<CardReportButtonHandle>(null);
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
        <div className="flex items-start gap-2">
          <CardBackButton onClick={() => setSelectedStop(null)} label="Back to map" />
          <div className="flex-1 min-w-0">
            {stopAgencies.length === 1 ? (
              <FlaggableValue reason="Stop is missing, misplaced, or assigned incorrectly" reportRef={reportRef} className="block w-full text-left">
                <SidebarCardHeader
                  eyebrow={stopAgencies[0]}
                  title={`${titleCase(currentStop.stopName)}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`}
                  titleClamp
                />
              </FlaggableValue>
            ) : (
              <>
                <AgencyFilterChips
                  agencies={stopAgencies}
                  selected={stopAgencyFilter}
                  onSelect={setStopAgencyFilter}
                />
                <FlaggableValue reason="Stop is missing, misplaced, or assigned incorrectly" reportRef={reportRef} className="block w-full text-left">
                  <SidebarCardHeader
                    title={`${titleCase(currentStop.stopName)}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`}
                    titleClamp
                  />
                </FlaggableValue>
              </>
            )}
          </div>
          <CardReportButton
            ref={reportRef}
            title={`Stop issue: ${titleCase(currentStop.stopName)}`}
            details={`**Stop:** ${titleCase(currentStop.stopName)}${currentStop.direction ? ` — ${currentStop.direction}` : ''}\n**Agencies:** ${stopAgencies.join(', ') || 'Unknown'}\n**Period:** ${period}\n**Atlas URL:** ${currentAtlasUrl()}`}
            showLiveReason={!!liveStop}
            excludeReasons={['Route line is missing or follows the wrong path']}
          />
        </div>
      </SidebarCardHeaderBlock>

      {liveStop && <LiveStopArrivals slug={liveStop.slug} stopId={liveStop.stopId} lat={liveStop.lat} lon={liveStop.lon} />}

      <SidebarCardList>
        {sortedRoutes.map(route => (
          <StopRouteGroup
            key={route.shortName}
            shortName={route.shortName}
            longName={route.longName}
            agencyName={route.agencyName}
            agencySlug={route.agencySlug}
            routeType={route.routeType}
            branches={route.branches}
            period={period}
            showAgency={stopAgencies.length > 1}
            onOpenRoute={openRoute}
          />
        ))}
      </SidebarCardList>

      {nearbyConnections.length > 0 && (
        <SidebarCardSection label="Nearby routes">
          {nearbyConnections.map(({ rKey, routeShortName, routeLongName, agencyName, agencySlug, routeType, headway, nearestStopName, distanceMeters }) => {
            return (
              <CardDirectionRow
                key={rKey}
                label={routeLabels({ shortName: routeShortName, longName: routeLongName, routeType, agencySlug, agencyName }).text}
                subLabel={`${nearestStopName} · ${Math.round(distanceMeters)} m away`}
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
