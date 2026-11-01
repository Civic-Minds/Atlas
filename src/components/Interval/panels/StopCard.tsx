import PanelEmpty from '../../ui/PanelEmpty';
import React, { useMemo } from 'react';
import { CardBackLink } from '../../CardBack';
import { nameCase } from '../../../utils/format';
import type { HoveredBranch, TimePeriod } from '../../../hooks/useIntervalStats';
import {
  AgencyFilterChips,
  CARD_SUMMARY,
  CardSummaryRow,
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
import RouteRowName from '../../RouteRowName';
import { stopRouteBestHeadway, type StopRoute } from '../../../utils/stopRoutes';
import LiveStopArrivals from './LiveStopArrivals';
import { compareHeadwayThenNumber } from '../../../utils/sortCompare';
import type { RouteLabel } from '../../../utils/routeFacts';
import { BACK_TO_MAP_LABEL, stopNoRoutesNotice, stopRouteNoTripsNotice } from '../../../content/noticeCopy';
import { formatPeriodRangeLong, TIME_PERIODS } from '../../../../shared/config';

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

/** The chosen period's hours, "9 AM–3 PM" (the stop card's notices name it). */
const periodRange = (period: TimePeriod): string => {
  const p = TIME_PERIODS.find(t => t.key === period);
  return p ? formatPeriodRangeLong(p.startHour, p.endHour) : '';
};

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
  const stopPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;

  return (
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardBackLink onClick={back?.onClick ?? (() => setSelectedStop(null))}>{back?.to ?? BACK_TO_MAP_LABEL}</CardBackLink>
            {stopAgencies.length === 1 ? (
              <FlaggableValue reason="Stop is missing, misplaced, or assigned incorrectly" reportRef={reportRef} className="block w-full text-left">
                <SidebarCardHeader
                  eyebrow={back?.namesAgency || back?.to === stopAgencies[0] ? null : stopAgencies[0]}
                  title={`${nameCase(currentStop.stopName, 'stop')}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`}
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
                    title={`${nameCase(currentStop.stopName, 'stop')}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`}
                    titleClamp
                  />
                </FlaggableValue>
              </>
            )}
          </div>
          <CardReportButton
            ref={reportRef}
            title={`Stop issue: ${nameCase(currentStop.stopName, 'stop')}`}
            details={reportDetails([
              ['Stop', `${nameCase(currentStop.stopName, 'stop')}${currentStop.direction ? ` — ${currentStop.direction}` : ''}`],
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
        {sortedRoutes.map(route => route.noTrips ? (
          // CIV-1052: the stop's own route with no trips here in the whole period: its name, then the approved line.
          <CardSummaryRow
            key={route.shortName}
            label={<RouteRowName shortName={route.label.primary} name={route.label.secondary} />}
            onClick={() => openRoute(route.noTrips!.rKey)}
            below={<p className={CARD_SUMMARY}>{stopRouteNoTripsNotice(periodRange(period))}</p>}
          />
        ) : route.noNumber ? (
          // #1278: the stop's own route with trips here but no number in the period: the route card's own words.
          <CardSummaryRow
            key={route.shortName}
            label={<RouteRowName shortName={route.label.primary} name={route.label.secondary} />}
            onClick={() => openRoute(route.noNumber!.rKey)}
            below={<p className={CARD_SUMMARY}>{route.noNumber.text}</p>}
          />
        ) : (
          <StopRouteGroup
            key={route.shortName}
            shortName={route.shortName}
            label={route.label}
            longName={route.longName}
            branches={route.branches}
            period={period}
            onOpenRoute={openRoute}
            hoveredBranch={hoveredBranch}
            setHoveredBranch={setHoveredBranch}
          />
        ))}
        {/* N35 (Ryan): none of the stop's routes run in the chosen time of day. */}
        {sortedRoutes.length === 0 && stopPeriod && (
          <div className="-mx-4"><PanelEmpty>{stopNoRoutesNotice(formatPeriodRangeLong(stopPeriod.startHour, stopPeriod.endHour))}</PanelEmpty></div>
        )}
      </SidebarCardList>

      {nearbyConnections.length > 0 && (
        <SidebarCardSection label="Nearby routes">
          {nearbyConnections.map(({ rKey, label: route, headway, nearestStopName, distanceMeters }) => {
            // Hovering shows the whole route on the map, as the stop's own route lines do (CIV-1053).
            const hovered = !!hoveredBranch && hoveredBranch.routeKey === rKey && hoveredBranch.directionId == null;
            return (
              <CardDirectionRow
                key={rKey}
                label={route.text}
                routeName={{ shortName: route.primary, name: route.secondary }}
                // "Moody Center", not the feed's "MOODY CENTER"; a feed's own mixed case stays as written (CIV-935).
                // The stop name shortens; the distance always shows (#1154).
                subLabel={nameCase(nearestStopName, 'stop')}
                subLabelTrailing={` · ${Math.round(distanceMeters)} m away`}
                subLabelWeight="medium"
                headway={headway ?? undefined}
                onClick={() => openRoute(rKey)}
                {...(setHoveredBranch ? {
                  onHoverStart: () => setHoveredBranch({ routeKey: rKey }),
                  onHoverEnd: () => setHoveredBranch(null),
                  branchHovered: hovered,
                  branchDimmed: !!hoveredBranch && !hovered,
                } : {})}
              />
            );
          })}
        </SidebarCardSection>
      )}
    </SidebarCardShell>
  );
};
