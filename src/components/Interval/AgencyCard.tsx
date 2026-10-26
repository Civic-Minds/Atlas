import React, { useMemo, useState, useEffect, forwardRef } from 'react';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { FEATURES } from '../../../shared/config';
import { plural } from '../../../shared/overflowText';
import { agencyPagePath } from '../../../shared/agencyPages';
import { agencyRegionTitle, areaLinkFor } from '../../../shared/agencyArea';
import { ON_DEMAND_NOT_MAPPED_NOTE, ON_DEMAND_PILL_LABEL, onDemandPillSelected } from '../../utils/onDemandPill';
import agencyPageSlugs from '../../../shared/data/agency-page-slugs.json';
import type { Agency } from '../../App';
import type { OpenInfoFn } from '../InfoPanel';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { CARD_NOTICE_FOOTER, CARD_NOTICE_INLINE, sidebarFrameStyle } from '../../styles';
import Panel, { PanelBody } from '../ui/Panel';
import RouteRowName from '../RouteRowName';
import Pill from '../ui/Pill';
import ModeFilterPillRow from '../ui/ModeFilterPillRow';
import { HEADWAY_TIERS } from '../../utils/colors';
import { effectiveMode, isRailReplacementBus, knownModeLabel, sortModes } from '../../../shared/modes';
import { headwayEveryRange } from '../../utils/headwayText';
import { agencyDisplayParts, routeLabels } from '../../utils/format';
import type { DayType, TimePeriod, ShapeProperties } from '../../hooks/useIntervalStats';
import { passesRouteFilter } from '../../hooks/useIntervalStats';
import { NO_REGULAR_SERVICE_LABEL, routeListDisplay } from '../../utils/effectiveHeadway';
import { AgencyCardTop, AgencyDataSourceLink, SidebarCardHeader, CARD_HEADER_BLOCK, CARD_BODY_TEXT, CARD_SUMMARY, CardBodyText, CardHelpNotice, CardSectionLabel, CardReportButton } from './cardUi';
import CardRouteList from './CardRouteList';
import { OutboundLink } from '../OutboundLink';
import { buildRouteFacts } from '../../utils/routeFacts';
import { reportDetails } from '../../utils/reportIssue';
import { getRolloutNotice } from '../../../shared/rolloutNotice';
import { onDemandCardName } from '../../utils/onDemandSelection';
import { onDemandCoverageNote } from '../../data/onDemandCoverage';
import {
  formatOnDemandHoursLines,
  onDemandPickupSentence,
  onDemandRunningNote,
  resolveOnDemandZone,
  type OnDemandAvailability,
} from '../../../shared/onDemandAvailability';
import { headwayTierLabel } from '../../utils/headwayText';
import ArrowLink from '../ui/ArrowLink';
import PanelEmpty from '../ui/PanelEmpty';
import { NO_ROUTES_LOADED, noRoutesMatchText } from '../../content/stateCopy';
import { compareHeadwayThenNumber } from '../../utils/sortCompare';

interface RouteRow {
  routeId: string;
  agencySlug: string;
  shortName: string;
  /** The short name the row's label shows (blank when the feed has none but has a long name, #1099). Defaults to shortName. */
  labelShortName?: string;
  longName: string | null;
  headway: number | null;
  limited: boolean;
  noRegular?: boolean;
  /** Lower end of a shared-stretch range (display only). */
  sharedHeadway?: number;
  tier: string | null;
  routeType: number;
  busSubType: string | undefined;
  matchesFilter: boolean;
}

interface AgencyListFilters {
  maxHeadway: number;
  selectedModes: Set<number>;
  hideSpan: boolean;
  hideLimitedService: boolean;
}

export function getRoutes(
  layers: AgencyLayers,
  slug: string,
  day: string,
  period: TimePeriod,
  filters: AgencyListFilters,
): RouteRow[] {
  const fc = layers[slug];
  if (!fc) return [];

  const agencyFilters = {
    maxHeadway: filters.maxHeadway,
    agencies: new Set([slug]),
    modes: filters.selectedModes,
    day,
    period,
    hideSpan: filters.hideSpan,
    hideLimitedService: filters.hideLimitedService,
    livePollingOnly: false,
    showCorridors: false,
    showCorridorBand: false,
    selectedRoute: null,
  };

  // Group all direction/branch features by short name first, then take the same
  // list display metric used by Recent/Suggested (#181/#198) so the agency list
  // never picks a lone feature's filter-oriented field (#180).
  type Acc = {
    props: ShapeProperties[];
    routeId: string;
    agencySlug: string;
    shortName: string;
    labelShortName: string;
    longName: string | null;
    tier: string | null;
    routeType: number;
    busSubType: string | undefined;
    matchesFilter: boolean;
  };
  const byShort = new Map<string, Acc>();

  for (const f of fc.features) {
    const p = f.properties as ShapeProperties;
    const facts = p.routeId ? buildRouteFacts(p, slug) : null;
    if (!facts || (p as { stopId?: string }).stopId) continue;
    if (p.day && p.day !== day) continue;

    const key = facts.shortName;
    const matchesFilter = passesRouteFilter(p, slug, agencyFilters, null);
    const existing = byShort.get(key);
    if (!existing) {
      byShort.set(key, {
        props: [p],
        routeId: facts.routeId,
        agencySlug: facts.agencySlug,
        shortName: facts.shortName,
        labelShortName: facts.labelShortName,
        longName: facts.longName,
        tier: facts.tier,
        routeType: typeof p.routeType === 'number' ? p.routeType : 3,
        busSubType: p.busSubType ?? undefined,
        matchesFilter,
      });
    } else {
      existing.props.push(p);
      // Any direction matching the filter keeps the route in the matching bucket.
      if (matchesFilter) existing.matchesFilter = true;
    }
  }

  return [...byShort.values()]
    .map((row): RouteRow => ({
      routeId: row.routeId,
      agencySlug: row.agencySlug,
      shortName: row.shortName,
      labelShortName: row.labelShortName,
      longName: row.longName,
      ...routeListDisplay(row.props, period),
      tier: row.tier,
      routeType: row.routeType,
      busSubType: row.busSubType,
      matchesFilter: row.matchesFilter,
    }))
    .sort(compareHeadwayThenNumber);
}

function frequencyFilterLabel(maxHeadway: number): string | null {
  if (maxHeadway === Infinity) return null;
  return HEADWAY_TIERS.find(t => t.max === maxHeadway)?.label ?? headwayTierLabel(maxHeadway);
}

/** Separate services that own some zones (e.g. Hamilton Trans-Cab beside myRide), listed once each. */
function otherZoneServices(service: NonNullable<Agency['onDemandServiceArea']>): { serviceName: string; serviceHours?: string; availability?: OnDemandAvailability }[] {
  const seen = new Map<string, { serviceHours?: string; availability?: OnDemandAvailability }>();
  for (const zone of Object.values(service.zoneMetadata ?? {})) {
    if (zone.serviceName && zone.serviceName !== service.serviceName && !seen.has(zone.serviceName)) {
      seen.set(zone.serviceName, { serviceHours: zone.serviceHours, availability: zone.availability });
    }
  }
  return [...seen].map(([serviceName, hours]) => ({ serviceName, ...hours }));
}

/**
 * Hours built from structured availability; the line covering the selected
 * day is bold. Falls back to the agency's own wording, unbolded, when no
 * structured hours exist.
 */
export function OnDemandHoursText({
  availability,
  serviceHours,
  day,
  className,
}: {
  availability?: OnDemandAvailability;
  serviceHours?: string;
  day?: DayType;
  className: string;
}) {
  const lines = formatOnDemandHoursLines(availability);
  if (lines.length === 0) {
    return serviceHours ? <p className={className}>{serviceHours}</p> : null;
  }
  return (
    <>
      {lines.map(line => (
        <p
          key={line.text}
          className={`${className} ${day && line.dayTypes.includes(day) ? 'font-bold text-[var(--text-primary)]' : ''}`}
        >
          {line.text}
        </p>
      ))}
    </>
  );
}

export function buildHeaderSummary(
  routes: RouteRow[],
  maxHeadway: number,
): string {
  const matching = routes.filter(r => r.matchesFilter).length;
  const parts = [`${routes.length} ${plural(routes.length, 'route')}`];
  const freqLabel = frequencyFilterLabel(maxHeadway);
  if (freqLabel) parts.push(`${matching} match filters`);
  return parts.join(' · ');
}

function routeMode(route: RouteRow): number {
  return effectiveMode({
    routeType: route.routeType,
    routeLongName: route.longName,
    routeShortName: route.shortName,
    agencySlug: route.agencySlug,
  });
}

/** Mode chip label for non-bus routes (buses are the default and get no chip). */
function railBlurbLabel(route: RouteRow): string | null {
  const mode = routeMode(route);
  return mode === 3 ? null : knownModeLabel(mode);
}

export type AgencyRouteFilterKey = `mode:${number}` | 'subtype:brt' | 'subtype:express';

export interface AgencyRouteFilter {
  key: AgencyRouteFilterKey;
  label: string;
  count: number;
}

export function buildAgencyRouteFilters(routes: RouteRow[]): AgencyRouteFilter[] {
  const chips: AgencyRouteFilter[] = [];
  const byMode = new Map<number, RouteRow[]>();

  for (const r of routes) {
    const label = railBlurbLabel(r);
    if (!label) continue;
    const mode = routeMode(r);
    const list = byMode.get(mode) ?? [];
    list.push(r);
    byMode.set(mode, list);
  }

  for (const [mode, rs] of sortModes(byMode.entries(), ([m]) => m)) {
    const label = railBlurbLabel(rs[0]);
    if (!label) continue;
    chips.push({
      key: `mode:${mode}`,
      label,
      count: rs.length,
    });
  }

  const brt = routes.filter(r => r.busSubType === 'brt');
  if (brt.length) {
    chips.push({ key: 'subtype:brt', label: 'BRT', count: brt.length });
  }

  const express = routes.filter(r => r.busSubType === 'express');
  if (express.length) {
    chips.push({ key: 'subtype:express', label: 'Express', count: express.length });
  }

  return chips;
}

export function routeMatchesAgencyFilter(r: RouteRow, filter: AgencyRouteFilterKey): boolean {
  if (filter.startsWith('mode:')) {
    return routeMode(r) === Number(filter.slice(5));
  }
  if (filter === 'subtype:brt') return r.busSubType === 'brt';
  if (filter === 'subtype:express') return r.busSubType === 'express';
  return true;
}

export function buildAgencyRouteBuckets(routes: RouteRow[]): { matching: RouteRow[]; other: RouteRow[] } {
  return {
    matching: routes.filter(route => route.matchesFilter),
    other: routes.filter(route => !route.matchesFilter),
  };
}

interface Props {
  agency: Agency;
  layers: AgencyLayers;
  day: DayType;
  period: TimePeriod;
  maxHeadway: number;
  selectedModes: Set<number>;
  hideSpan: boolean;
  hideLimitedService: boolean;
  onRouteSelect: (key: string) => void;
  sidebarLeft?: number;
  searchBarWidth?: number;
  onInfoOpen?: OpenInfoFn;
  onDemandFocus?: boolean;
  onDemandZoneId?: string | null;
  /** The on-demand card's back link to the agency card (CIV-900); shown only when that is a different card. */
  onBackToAgency?: () => void;
  /** Closes the card: the "← Map" back link every card with nothing before it gets (CIV-929). */
  onClose: () => void;
}

function RouteListSection({
  routes,
  liveShortNames,
  onRouteSelect,
  dimmed = false,
}: {
  routes: RouteRow[];
  liveShortNames: Set<string>;
  onRouteSelect: (key: string) => void;
  dimmed?: boolean;
}) {
  const rows = routes.map(r => ({
    key: `${r.agencySlug}::${r.routeId}`,
    route: routeLabels({ shortName: r.labelShortName ?? r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: r.agencySlug }),
    headway: r.headway ?? undefined,
    headwayLabel: r.headway != null && r.sharedHeadway != null ? headwayEveryRange(r.sharedHeadway, r.headway) : undefined,
    limited: r.limited || r.noRegular === true,
    limitedLabel: r.noRegular ? NO_REGULAR_SERVICE_LABEL : undefined,
    subLabel: isRailReplacementBus({ routeType: r.routeType, routeLongName: r.longName }) ? 'Rail replacement bus' : undefined,
    live: FEATURES.live && liveShortNames.has(r.shortName),
  }));
  return <CardRouteList rows={rows} onSelect={onRouteSelect} dimmed={dimmed} />;
}

export const AgencyCard = forwardRef<HTMLDivElement, Props>(function AgencyCard({
  agency,
  layers,
  day,
  period,
  maxHeadway,
  selectedModes,
  hideSpan,
  hideLimitedService,
  onRouteSelect,
  sidebarLeft,
  searchBarWidth,
  onInfoOpen,
  onDemandFocus = false,
  onDemandZoneId = null,
  onBackToAgency,
  onClose,
}, ref) {
  const routes = useMemo(
    () => getRoutes(layers, agency.slug, day, period, { maxHeadway, selectedModes, hideSpan, hideLimitedService }),
    [layers, agency.slug, day, period, maxHeadway, selectedModes, hideSpan, hideLimitedService],
  );
  const routeFilters = useMemo(() => buildAgencyRouteFilters(routes), [routes]);
  const [activeFilter, setActiveFilter] = useState<AgencyRouteFilterKey | null>(null);
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);

  // null until the viewer picks the On-Demand pill or another pill (onDemandPillSelected).
  const [onDemandChoice, setOnDemandChoice] = useState<boolean | null>(null);

  useEffect(() => {
    setActiveFilter(null);
    setOnDemandChoice(null);
  }, [agency.slug]);

  const filteredRoutes = useMemo(() => {
    if (!activeFilter) return routes;
    return routes.filter(r => routeMatchesAgencyFilter(r, activeFilter));
  }, [routes, activeFilter]);

  const { matching: matchingRoutes, other: otherRoutes } = useMemo(
    () => buildAgencyRouteBuckets(filteredRoutes),
    [filteredRoutes],
  );
  const hasFilterSplit = otherRoutes.length > 0 && maxHeadway !== Infinity;
  const showOthersExpanded = showOtherRoutes;

  useEffect(() => {
    setShowOtherRoutes(false);
  }, [agency.slug, maxHeadway, period, day]);

  const visibleRoutes = filteredRoutes;

  const activeFilterLabel = routeFilters.find(f => f.key === activeFilter)?.label;

  const liveRoutes = useMemo(
    () => LIVE_POLLING_ROUTES.filter(r => r.slug === agency.slug && (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar || r.active)),
    [agency.slug]
  );
  const liveShortNames = useMemo(() => new Set(liveRoutes.map(r => r.displayRouteShortName)), [liveRoutes]);
  const { primary: agencyNamePrimary, secondary: agencyNameSecondary } = useMemo(
    () => agencyDisplayParts(agency.name, agency.cities, agency.displayArea),
    [agency.name, agency.cities, agency.displayArea],
  );
  // An on-demand-only agency's cards are named by its service ("GP Transit On-Demand"), with no place beside it,
  // so it fits on one line beside the report flag; the zone card has no place either (CIV-929).
  const agencyCardName = agency.onDemandOnly && agency.onDemandServiceArea
    ? onDemandCardName(agency.onDemandServiceArea, null, agencyNamePrimary)
    : agencyNamePrimary;
  const hasAboutPage = FEATURES.agencyPages && (agencyPageSlugs as string[]).includes(agency.slug);
  // The region link shows the region's name alone (CIV-929), not the area page's "All … agencies" label.
  const areaLink = hasAboutPage ? areaLinkFor(agency.slug, FEATURES.agencyPages) : null;
  const regionTitle = agencyRegionTitle(agency.slug);
  const area = areaLink && regionTitle ? { href: areaLink.href, label: regionTitle } : null;
  const hasSource = FEATURES.dataSourceLink && !!agency.websiteUrl;
  const rolloutNotice = getRolloutNotice(agency);
  const coverageNote = FEATURES.onDemand ? onDemandCoverageNote(agency) : null;
  // Zone not on the map yet: an "On-Demand" pill beside the mode pills instead of a notice block.
  const hasOnDemandPill = !agency.onDemandOnly && coverageNote?.kind === 'not-mapped';
  const onDemandOn = onDemandPillSelected({ hasPill: hasOnDemandPill, choice: onDemandChoice, routeCount: routes.length });
  const reportButton = (
    <CardReportButton
      title={`Agency issue: ${agency.name}`}
      // The data dates the route card's report sends too (CIV-932), so an agency report says how fresh its data is.
      details={reportDetails([
        ['Agency', agency.name],
        ['Agency slug', agency.slug],
        ['Day', day],
        ['Period', period],
        ['Agency data refreshed', agency.lastRefreshedAt ?? 'unknown'],
        ['Feed expiry', agency.lastFeedExpiry ?? 'unknown'],
      ])}
      excludeReasons={['Stop is missing, misplaced, or assigned incorrectly', 'Route line is missing or follows the wrong path']}
    />
  );

  // A link's on-demand card waits for the service's zones instead of flashing the routes card (CIV-929).
  if (onDemandFocus && !agency.onDemandServiceArea) return null;

  if (onDemandFocus && agency.onDemandServiceArea) {
    const service = agency.onDemandServiceArea;
    const selectedZone = onDemandZoneId
      ? service.features.find(feature => (feature.properties as { areaName?: string } | undefined)?.areaName === onDemandZoneId)
      : undefined;
    const zoneName = (selectedZone?.properties as { areaName?: string } | undefined)?.areaName;
    const zone = resolveOnDemandZone(service, zoneName);
    const pickupSentence = onDemandPickupSentence(service, zoneName);
    // Only claim a shaded area when one belongs to this service (Hamilton's shaded zones are Trans-Cab, not myRide).
    const showsShadedArea = zoneName
      ? true
      : service.features.some(feature => resolveOnDemandZone(service, (feature.properties as { areaName?: string } | undefined)?.areaName).sameServiceAsParent);
    const runningNote = onDemandRunningNote(zone.availability, day, period);
    const backToAgency = onBackToAgency && (onDemandZoneId || !agency.onDemandOnly) ? onBackToAgency : undefined;
    return (
      <Panel
        ref={ref}
        data-report-anchor="true"
        sidebar
        enter
        style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}
      >
        <div className={CARD_HEADER_BLOCK}>
          {backToAgency ? (
            // A zone (or a fixed-route agency's service) reads like a route card: "← Agency" back to the agency
            // card, then the bold zone name (Ryan: "the on demand should be closer to the route card").
            <SidebarCardHeader title={onDemandCardName(service, onDemandZoneId, agencyNamePrimary)} back={{ to: agencyCardName, onClick: backToAgency }} />
          ) : (
            // An on-demand-only agency's whole-service card is its agency card: the shared agency card top, named
            // once, with no facts line (the "On-demand service" section label below says it) (CIV-929).
            <AgencyCardTop
              name={agencyCardName}
              place={null}
              back={{ to: 'Map', onClick: onClose }}
              report={reportButton}
            />
          )}
          {FEATURES.dataSourceLink && agency.websiteUrl && (
            <p className="mt-1 text-xs"><AgencyDataSourceLink agency={agency} /></p>
          )}
        </div>
        {/* Every section sits at the body padding, the same left edge as the header. */}
        <PanelBody className="px-4 py-4 space-y-4">
          <div>
            <CardSectionLabel>On-demand service</CardSectionLabel>
            {showsShadedArea && (
              <CardBodyText>
                The shaded map area shows where this on-demand service operates.
              </CardBodyText>
            )}
            {pickupSentence && (
              <CardBodyText>{pickupSentence}</CardBodyText>
            )}
            {coverageNote?.kind === 'partly-mapped' && (
              <CardBodyText>Not on the map yet: {coverageNote.missing}.</CardBodyText>
            )}
          </div>
          {zone.eligibility && (
            <div>
              <CardSectionLabel>Who can ride</CardSectionLabel>
              <CardBodyText>{zone.eligibility}</CardBodyText>
            </div>
          )}
          {zone.tripRules && (
            <div>
              <CardSectionLabel>Trip rules</CardSectionLabel>
              <CardBodyText>{zone.tripRules}</CardBodyText>
            </div>
          )}
          <div>
            <CardSectionLabel>Service hours</CardSectionLabel>
            <CardBodyText data-testid="on-demand-running-note">{runningNote}</CardBodyText>
            <OnDemandHoursText
              availability={zone.availability}
              serviceHours={zone.serviceHours}
              day={day}
              className={CARD_BODY_TEXT}
            />
            {zone.availability && zone.hoursNote && (
              <p className="text-xs leading-snug text-[var(--text-dim)] mt-1">{zone.hoursNote}</p>
            )}
          </div>
          {zone.bookingInfo && (
            <div>
              <CardSectionLabel>Booking</CardSectionLabel>
              <CardBodyText>{zone.bookingInfo}</CardBodyText>
            </div>
          )}
        </PanelBody>
      </Panel>
    );
  }

  return (
    <Panel
      ref={ref}
      data-report-anchor="true"
      sidebar
      enter
      style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}
    >
      <div className={CARD_HEADER_BLOCK}>
        <AgencyCardTop
          name={agencyCardName}
          place={agency.onDemandOnly ? null : agencyNameSecondary}
          back={{ to: 'Map', onClick: onClose }}
          facts={agency.onDemandOnly ? 'On-demand service' : buildHeaderSummary(visibleRoutes, maxHeadway)}
          report={reportButton}
          region={area && (
            // The region on one line under the name, cut with an ellipsis if it ever runs long (CIV-929). The map is
            // a different page from the area page, so it opens in a new tab like the outside Source link.
            <ArrowLink size="xs" tone="inline" href={area.href} target="_blank" rel="noopener noreferrer" className="max-w-full" title={area.label}>
              <span className="truncate min-w-0">{area.label}</span>
            </ArrowLink>
          )}
        >
          {(hasAboutPage || hasSource) && (
            // "About →" and "Source →" under the facts (CIV-841), each in a new tab like the region link.
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
              {hasAboutPage && <ArrowLink size="xs" tone="inline" href={agencyPagePath(agency.slug)} target="_blank" rel="noopener noreferrer">About</ArrowLink>}
              <AgencyDataSourceLink agency={agency} />
            </p>
          )}
          {!agency.onDemandOnly && agency.onDemandServiceArea?.serviceName && (() => {
            const service = agency.onDemandServiceArea;
            // Every on-demand service in the shared row style (CIV-962): its name bold like a route with no number,
            // and its hours in grey; a service with no confirmed hours says so, as its zone card does. A line under it
            // keeps it apart from the mode pills; with no pills, the header's own line already ends it.
            const services = [
              { serviceName: service.serviceName!, availability: service.availability, serviceHours: service.serviceHours },
              ...otherZoneServices(service),
            ];
            return (
              <div className={`mt-2 border-t border-[var(--border-primary)] pt-2 ${routeFilters.length > 0 || hasOnDemandPill ? 'border-b pb-2' : ''}`}>
                <CardSectionLabel>On-demand service</CardSectionLabel>
                {services.map((item, index) => (
                  <div key={item.serviceName} className={index > 0 ? 'mt-1.5' : ''}>
                    <p className="text-xs text-[var(--text-primary)] leading-snug"><RouteRowName shortName={item.serviceName} /></p>
                    {item.availability || item.serviceHours ? (
                      <OnDemandHoursText
                        availability={item.availability}
                        serviceHours={item.serviceHours}
                        className={CARD_SUMMARY}
                      />
                    ) : (
                      <p className={CARD_SUMMARY}>{onDemandRunningNote(undefined, day, period)}</p>
                    )}
                  </div>
                ))}
                {service.tripRules && <p className="text-xs leading-snug text-[var(--text-muted)] mt-1">{service.tripRules}</p>}
                {coverageNote?.kind === 'partly-mapped' && (
                  <p className="text-xs leading-snug text-[var(--text-muted)] mt-1">Not on the map yet: {coverageNote.missing}.</p>
                )}
                {service.sourceUrl && (
                  <p className="mt-1 text-xs">
                    <ArrowLink as={OutboundLink} size="xs" tone="inline" href={service.sourceUrl} kind="on_demand_source" agencySlug={agency.slug}>
                      Details
                    </ArrowLink>
                  </p>
                )}
              </div>
            );
          })()}
          {(routeFilters.length > 0 || hasOnDemandPill) && (
            <ModeFilterPillRow
              filters={routeFilters}
              selected={onDemandOn ? null : activeFilter}
              onSelect={key => { setOnDemandChoice(false); setActiveFilter(key); }}
            >
              {hasOnDemandPill && (
                <Pill
                  onClick={() => { setActiveFilter(null); setOnDemandChoice(!onDemandOn); }}
                  selected={onDemandOn}
                  className="px-2"
                >
                  {ON_DEMAND_PILL_LABEL}
                </Pill>
              )}
            </ModeFilterPillRow>
          )}
          {(agency.feedReviewStatus === 'review' || agency.overrideNote || rolloutNotice) && onInfoOpen && (
            <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
              {rolloutNotice && (
                <CardHelpNotice
                  message={rolloutNotice}
                  onLearnMore={() => onInfoOpen('about', {
                    helpTopic: 'beta-rollout',
                    agencyName: agency.name,
                    rolloutNotice,
                    rolloutIssueUrl: agency.rolloutIssueUrl,
                  })}
                />
              )}
              {agency.feedReviewStatus === 'review' && !agency.overrideNote && (
                <CardHelpNotice
                  message="New schedule data is being verified."
                  onLearnMore={() => onInfoOpen('about', {
                    helpTopic: 'new-schedule-data',
                    agencyName: agency.name,
                    lastRefreshedAt: agency.lastRefreshedAt ?? undefined,
                    lastFeedCheckAt: agency.lastFeedCheckAt ?? undefined,
                    expiredFeedCheckCount: agency.expiredFeedCheckCount,
                    expiredFeedCheckSince: agency.expiredFeedCheckSince ?? undefined,
                    websiteUrl: agency.websiteUrl,
                  })}
                />
              )}
              {agency.overrideNote && (
                <CardHelpNotice
                  message="We corrected this data."
                  onLearnMore={() => onInfoOpen('about', {
                    helpTopic: 'corrected-data',
                    agencyName: agency.name,
                    overrideNote: agency.overrideNote,
                    issueUrl: agency.issueUrl,
                    issueUrls: agency.issueUrls,
                  })}
                />
              )}
            </div>
          )}
        </AgencyCardTop>
      </div>

      <PanelBody>
        {onDemandOn ? (
          <PanelEmpty>{ON_DEMAND_NOT_MAPPED_NOTE}</PanelEmpty>
        ) : visibleRoutes.length === 0 ? (
          <PanelEmpty>{activeFilterLabel ? noRoutesMatchText(activeFilterLabel) : NO_ROUTES_LOADED}</PanelEmpty>
        ) : hasFilterSplit ? (
          <>
            {matchingRoutes.length > 0 && (
              <RouteListSection
                routes={matchingRoutes}
                liveShortNames={liveShortNames}
                onRouteSelect={onRouteSelect}
              />
            )}
            {otherRoutes.length > 0 && (
              <>
                <div className={CARD_NOTICE_INLINE}>
                  {!showOthersExpanded ? (
                    <CardHelpNotice
                      message={`${otherRoutes.length} ${plural(otherRoutes.length, 'route')} outside your filters.`}
                      actionLabel="Show"
                      onLearnMore={() => setShowOtherRoutes(true)}
                    />
                  ) : (
                    <CardHelpNotice
                      message="Routes outside your filters."
                      actionLabel="Hide"
                      onLearnMore={() => setShowOtherRoutes(false)}
                    />
                  )}
                </div>
                {showOthersExpanded && (
                  <RouteListSection
                    routes={otherRoutes}
                    liveShortNames={liveShortNames}
                    onRouteSelect={onRouteSelect}
                    dimmed
                  />
                )}
              </>
            )}
          </>
        ) : (
          <RouteListSection
            routes={visibleRoutes}
            liveShortNames={liveShortNames}
            onRouteSelect={onRouteSelect}
          />
        )}
      </PanelBody>
    </Panel>
  );
});
