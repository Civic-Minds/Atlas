import React, { useMemo } from 'react';
import { CardBackLink } from '../../CardBack';
import { stopNameCase, routeLabels } from '../../../utils/format';
import type { HoveredBranch, TimePeriod } from '../../../hooks/useIntervalStats';
import {
  AgencyFilterChips,
  CardDirectionRow,
  SidebarCardHeader,
  SidebarCardHeaderBlock,
  SidebarCardList,
  SidebarCardSection,
  SidebarCardShell,
  CardReportButton,
  FlaggableValue,
  type CardReportButtonHandle,
} from '../cardUi';
import { reportDetails } from '../../../utils/reportIssue';
import StopRouteGroup from './StopRouteGroup';
import { stopRouteBestHeadway, type StopRoute } from '../../../utils/stopRoutes';
import LiveStopArrivals from './LiveStopArrivals';
import type { HeadwayMetric } from '../../../utils/routeFacts';
import { compareHeadwayThenNumber } from '../../../utils/sortCompare';
import type { RouteLabel } from '../../../utils/routeFacts';

// The stop card's route and branch shapes live with the code that builds them (CIV-997).
export type { StopBranch, StopRoute } from '../../../utils/stopRoutes';

export interface NearbyConnection {
  rKey: string;
  routeShortName: string;
  /** What the row shows (route facts' label, CIV-984); the short name is only the route's identity. */
  label: RouteLabel;
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

/** The back link above the stop's title: "← " + the screen it returns to (CIV-832). */
export interface StopCardBack {
  to: string;
  onClick: () => void;
  /** The link goes back to the stop's agency card, so it already names the agency (its wording can differ from the list's short name, #1102). */
  namesAgency?: boolean;
}

export interface StopCardProps {
  currentStop: CurrentStopData;
  /** Where the back link goes. Without it the link reads "← Map" and just closes the card. */
  back?: StopCardBack;
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
  /** The map hover for the destination rows (CIV-918). */
  hoveredBranch?: HoveredBranch | null;
  setHoveredBranch?: (branch: HoveredBranch | null) => void;
}

export const StopCard: React.FC<StopCardProps> = ({
  currentStop,
  back,
  setSelectedStop,
  setSelectedRoute,
  stopAgencies,
  stopAgencyFilter,
  setStopAgencyFilter,
  filteredStopRoutes,
  period,
  nearbyConnections,
  liveStop,
  hoveredBranch,
  setHoveredBranch,
}) => {
  const reportRef = React.useRef<CardReportButtonHandle>(null);
  const openRoute = (rKey: string) => {
    setHoveredBranch?.(null);
    setSelectedStop(null);
    setSelectedRoute(rKey);
  };

  const sortedRoutes = useMemo(() => {
    return [...filteredStopRoutes]
      .map(route => ({ route, headway: stopRouteBestHeadway(route.branches, period) }))
      .sort((a, b) => compareHeadwayThenNumber(
        { headway: a.headway, shortName: a.route.shortName, longName: a.route.longName },
        { headway: b.headway, shortName: b.route.shortName, longName: b.route.longName },
      ))
      .map(({ route }) => route);
  }, [filteredStopRoutes, period]);

  return (
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardBackLink onClick={back?.onClick ?? (() => setSelectedStop(null))}>{back?.to ?? 'Map'}</CardBackLink>
            {stopAgencies.length === 1 ? (
              <FlaggableValue reason="Stop is missing, misplaced, or assigned incorrectly" reportRef={reportRef} className="block w-full text-left">
                <SidebarCardHeader
                  eyebrow={back?.namesAgency || back?.to === stopAgencies[0] ? null : stopAgencies[0]}
                  title={`${stopNameCase(currentStop.stopName)}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`}
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
                    title={`${stopNameCase(currentStop.stopName)}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`}
                    titleClamp
                  />
                </FlaggableValue>
              </>
            )}
          </div>
          <CardReportButton
            ref={reportRef}
            title={`Stop issue: ${stopNameCase(currentStop.stopName)}`}
            details={reportDetails([
              ['Stop', `${stopNameCase(currentStop.stopName)}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`],
              ['Agencies', stopAgencies.join(', ') || 'Unknown'],
              ['Period', period],
            ])}
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
            label={route.label}
            longName={route.longName}
            agencyName={route.agencyName}
            agencySlug={route.agencySlug}
            routeType={route.routeType}
            branches={route.branches}
            period={period}
            showAgency={stopAgencies.length > 1}
            onOpenRoute={openRoute}
            hoveredBranch={hoveredBranch}
            setHoveredBranch={setHoveredBranch}
          />
        ))}
      </SidebarCardList>

      {nearbyConnections.length > 0 && (
        <SidebarCardSection label="Nearby routes">
          {nearbyConnections.map(({ rKey, label: route, agencyName, agencySlug, headway, nearestStopName, distanceMeters }) => {
            return (
              <CardDirectionRow
                key={rKey}
                label={route.text}
                routeName={{ shortName: route.primary, name: route.secondary }}
                // "Moody Center", not the feed's "MOODY CENTER"; a feed's own mixed case stays as written (CIV-935).
                subLabel={`${stopNameCase(nearestStopName)} · ${Math.round(distanceMeters)} m away`}
                subLabelWeight="medium"
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
