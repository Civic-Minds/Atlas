import React, { useMemo, useState, useEffect, forwardRef } from 'react';
import { BETA_SITE_URL } from '../../../shared/seo';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { ATLAS_MODE, FEATURES } from '../../../shared/config';
import { plural } from '../../../shared/overflowText';
import { agencyPagePath } from '../../../shared/agencyPages';
import { AREA_LINK_MAX_CHARS, agencyRegionTitle, areaLinkFor, areaLinkName } from '../../../shared/agencyArea';
import { ON_DEMAND_PILL_LABEL, onDemandPillSelected } from '../../utils/onDemandPill';
import agencyPageSlugs from '../../../shared/data/agency-page-slugs.json';
import type { Agency } from '../../App';
import type { OpenInfoFn } from '../InfoPanel';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { CARD_NOTICE_FOOTER, CARD_NOTICE_INLINE, sidebarFrameStyle } from '../../styles';
import Panel, { PanelBody } from '../ui/Panel';
import RouteRowName from '../RouteRowName';
import Pill from '../ui/Pill';
import ModeFilterPillRow from '../ui/ModeFilterPillRow';
import { effectiveMode, isRailReplacementBus, knownModeLabel, sortModes } from '../../../shared/modes';
import { headwayEveryRange } from '../../utils/headwayText';
import { agencyNames } from '../../utils/agencyName';
import type { DayType, TimePeriod, ShapeProperties } from '../../hooks/useIntervalStats';
import { passesRouteFilter } from '../../hooks/useIntervalStats';
import { NO_REGULAR_SERVICE_LABEL, routeListDisplay } from '../../utils/effectiveHeadway';
import { AgencyCardTop, AgencyDataSourceLink, SidebarCardHeader, CARD_HEADER_BLOCK, CARD_BODY_TEXT, CARD_SUMMARY, CardBodyText, CardHelpNotice, CardSectionLabel, CardReportButton, CorrectedDataNotice, NewScheduleDataNotice } from './cardUi';
import CardRouteList from './CardRouteList';
import { OutboundLink } from '../OutboundLink';
import { buildRouteFacts, type RouteLabel } from '../../utils/routeFacts';
import { reportDetails } from '../../utils/reportIssue';
import { AGENCY_ROUTES_FAILED, BETA_ROLLOUT_NOTICE, BETA_SERVICE_ROLLOUT_NOTICE, explainerFor, getRolloutNotice, NO_ROUTES_LOADED, noRoutesMatchText, noServiceOnDayNotice, notOnMapYetNotice, ON_DEMAND_NOT_MAPPED_NOTE, ROUTES_OUTSIDE_FILTERS_NOTICE, routesOutsideFiltersNotice, VIEW_ON_BETA } from '../../content/noticeCopy';
import { onDemandCardName } from '../../utils/onDemandSelection';
import { onDemandCoverageNote } from '../../data/onDemandCoverage';
import {
  formatOnDemandHoursLines,
  formatOnDemandHoursRange,
  onDemandPickupSentence,
  onDemandRunningNote,
  resolveOnDemandZone,
  type OnDemandAvailability,
} from '../../../shared/onDemandAvailability';
import ArrowLink from '../ui/ArrowLink';
import PanelEmpty from '../ui/PanelEmpty';
import { compareHeadwayThenNumber } from '../../utils/sortCompare';

interface RouteRow {
  routeId: string;
  agencySlug: string;
  shortName: string;
  /** What the row shows (route facts' label, CIV-984): never built from shortName, which is the route's identity. */
  label: RouteLabel;
  longName: string | null;
  headway: number | null;
  limited: boolean;
  noRegular?: boolean;
  /** Lower end of a shared-stretch range (display only). */
  sharedHeadway?: number;
  tier: string | null;
  routeType: number;
  bookingRequired?: boolean;
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
    label: RouteLabel;
    longName: string | null;
    tier: string | null;
    routeType: number;
    bookingRequired: boolean;
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
        label: facts.label,
        longName: facts.longName,
        tier: facts.tier,
        routeType: typeof p.routeType === 'number' ? p.routeType : 3,
        bookingRequired: p.bookingRequired === true,
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
      label: row.label,
      longName: row.longName,
      ...routeListDisplay(row.props, period),
      tier: row.tier,
      routeType: row.routeType,
      bookingRequired: row.bookingRequired,
      busSubType: row.busSubType,
      matchesFilter: row.matchesFilter,
    }))
    .sort(compareHeadwayThenNumber);
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

/** The hours rows' scale: 6 a.m. to 2 a.m. like the route card's chart, stretched for service outside it. */
const HOURS_SCALE_START = 6;
const HOURS_SCALE_END = 26;
const HOURS_TICKS: [number, string][] = [[6, '6a'], [12, '12p'], [18, '6p'], [24, '12a']];

/**
 * Service hours as rows (CIV-964, Ryan's variant C): one row per group of days with the same hours, its days, a bar
 * on a shared day scale and the times in words; the row covering the selected day is bold. Falls back to the agency's
 * own wording when no structured hours exist.
 */
export function OnDemandHoursRows({
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
  const windows = lines.flatMap(line => line.windows);
  const start = Math.min(HOURS_SCALE_START, ...windows.map(w => Math.floor(w.startHour)));
  const end = Math.max(HOURS_SCALE_END, ...windows.map(w => Math.ceil(w.endHour)));
  const pct = (hour: number) => ((hour - start) / (end - start)) * 100;
  return (
    <div className="mt-1 grid grid-cols-[3.5rem_1fr] gap-x-2 text-xs leading-snug" data-testid="on-demand-hours-rows">
      {lines.map(line => {
        const selected = !!day && line.dayTypes.includes(day);
        const tone = selected ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]';
        return (
          <React.Fragment key={line.text}>
            {/* The days line up with the bar: a line box the bar's height. */}
            <span className={`mt-1.5 whitespace-nowrap leading-[0.625rem] ${tone}`}>{line.days}</span>
            <div className="mt-1.5 min-w-0">
              {line.windows.length > 0 ? (
                <>
                  <div className="relative h-2.5 rounded-full bg-[var(--bg-stat)]" aria-hidden="true">
                    {line.windows.map(w => (
                      <span
                        key={`${w.startHour}-${w.endHour}`}
                        className="absolute inset-y-0 rounded-full bg-[var(--hours-band)]"
                        style={{ left: `${pct(w.startHour)}%`, width: `${pct(w.endHour) - pct(w.startHour)}%` }}
                      />
                    ))}
                  </div>
                  {/* Each time range stays whole; a list of them wraps between ranges. */}
                  <p className={`mt-0.5 ${tone}`}>
                    {line.windows.map((w, i) => (
                      <React.Fragment key={`${w.startHour}-${w.endHour}`}>
                        {i > 0 && ', '}
                        <span className="whitespace-nowrap">{formatOnDemandHoursRange(w)}</span>
                      </React.Fragment>
                    ))}
                  </p>
                </>
              ) : (
                // No bar for a day with no service, just the words (as in the picked mockup).
                <p className={`leading-[0.625rem] ${tone}`}>{line.times}</p>
              )}
            </div>
          </React.Fragment>
        );
      })}
      <span />
      <div className="relative mt-1.5 mb-1.5 h-3 text-2xs text-[var(--text-dim)]" aria-hidden="true">
        {HOURS_TICKS.map(([hour, label]) => (
          <span key={hour} className="absolute -translate-x-1/2" style={{ left: `${pct(hour)}%` }}>{label}</span>
        ))}
      </div>
    </div>
  );
}

export function buildHeaderSummary(
  routes: RouteRow[],
  maxHeadway: number,
): string {
  const matching = routes.filter(r => r.matchesFilter).length;
  const parts = [`${routes.length} ${plural(routes.length, 'route')}`];
  if (maxHeadway !== Infinity) parts.push(`${matching} match filters`);
  return parts.join(' · ');
}

function routeMode(route: RouteRow): number {
  return effectiveMode({
    routeType: route.routeType,
    routeLongName: route.longName,
    routeShortName: route.shortName,
    agencySlug: route.agencySlug,
    bookingRequired: route.bookingRequired,
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
  /** The agency's route data failed to load (N27). */
  loadFailed?: boolean;
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
    route: r.label,
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
  loadFailed = false,
}, ref) {
  const routes = useMemo(
    () => getRoutes(layers, agency.slug, day, period, { maxHeadway, selectedModes, hideSpan, hideLimitedService }),
    [layers, agency.slug, day, period, maxHeadway, selectedModes, hideSpan, hideLimitedService],
  );
  const routeFilters = useMemo(() => buildAgencyRouteFilters(routes), [routes]);
  // N26: the agency's data is in, with routes on other days but none on this one.
  const noServiceToday = useMemo(() => routes.length === 0 && (layers[agency.slug]?.features ?? []).some(f => {
    const p = f.properties as ShapeProperties;
    return !!p.routeId && !(p as { stopId?: string }).stopId && !!p.day && p.day !== day;
  }), [routes.length, layers, agency.slug, day]);
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

  useEffect(() => {
    setShowOtherRoutes(false);
  }, [agency.slug, maxHeadway, period, day]);

  const activeFilterLabel = routeFilters.find(f => f.key === activeFilter)?.label;

  const liveRoutes = useMemo(
    () => LIVE_POLLING_ROUTES.filter(r => r.slug === agency.slug && (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar || r.active)),
    [agency.slug]
  );
  const liveShortNames = useMemo(() => new Set(liveRoutes.map(r => r.displayRouteShortName)), [liveRoutes]);
  const { primary: agencyNamePrimary, secondary: agencyNameSecondary } = useMemo(
    () => agencyNames({ name: agency.name, cities: agency.cities, displayArea: agency.displayArea }).card,
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
  const hasSource = FEATURES.dataSourceLink && !!agency.websiteUrl;
  // A name too long for the line drops its trailing "area" (CIV-523); the full name stays on hover.
  const area = areaLink && regionTitle
    ? { href: areaLink.href, label: areaLinkName(regionTitle, hasSource ? AREA_LINK_MAX_CHARS.aboutAndSource : AREA_LINK_MAX_CHARS.about), title: regionTitle }
    : null;
  // One line right under the name (CIV-929): the area link, then "About →" (CIV-841), then "Source →" when that is on.
  // Each opens in a new tab, since they leave the map; the area name is cut with an ellipsis if it runs long.
  const agencyLinks = [
    area && (
      <ArrowLink key="area" size="xs" tone="inline" href={area.href} target="_blank" rel="noopener noreferrer" className="max-w-full [&>svg]:shrink-0" title={area.title}>
        <span className="truncate min-w-0">{area.label}</span>
      </ArrowLink>
    ),
    hasAboutPage && <ArrowLink key="about" size="xs" tone="inline" href={agencyPagePath(agency.slug)} target="_blank" rel="noopener noreferrer">About</ArrowLink>,
    hasSource && <AgencyDataSourceLink key="source" agency={agency} />,
  ].filter(Boolean) as React.ReactNode[];
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
              links={hasSource ? [<AgencyDataSourceLink key="source" agency={agency} />] : []}
            />
          )}
          {/* The zone card's header has no links line, so its Source link sits under the title. */}
          {backToAgency && hasSource && (
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
              <CardBodyText>{notOnMapYetNotice(coverageNote.missing)}</CardBodyText>
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
            <OnDemandHoursRows
              availability={zone.availability}
              serviceHours={zone.serviceHours}
              day={day}
              className={CARD_BODY_TEXT}
            />
            {zone.availability && zone.hoursNote && (
              <CardBodyText>{zone.hoursNote}</CardBodyText>
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
          facts={agency.onDemandOnly ? 'On-demand service' : buildHeaderSummary(filteredRoutes, maxHeadway)}
          report={reportButton}
          links={agencyLinks}
        >
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
                  <p className="text-xs leading-snug text-[var(--text-muted)] mt-1">{notOnMapYetNotice(coverageNote.missing)}</p>
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
              {rolloutNotice && (rolloutNotice === BETA_SERVICE_ROLLOUT_NOTICE || rolloutNotice === BETA_ROLLOUT_NOTICE ? (
                // N20 and N108 (Ryan): a beta-only agency or service points to the same page on beta, never preview; on beta itself, no link.
                <CardHelpNotice
                  message={rolloutNotice}
                  {...(ATLAS_MODE === 'beta' ? {} : { actionLabel: VIEW_ON_BETA, onLearnMore: () => window.location.assign(`${BETA_SITE_URL}${window.location.pathname}${window.location.search}`) })}
                />
              ) : (
                <CardHelpNotice
                  message={rolloutNotice}
                  onLearnMore={() => onInfoOpen('about', {
                    helpTopic: explainerFor('N19'),
                    agencyName: agency.name,
                    rolloutNotice,
                  })}
                />
              ))}
              {agency.feedReviewStatus === 'review' && !agency.overrideNote && (
                <NewScheduleDataNotice on="agency" agency={agency} onInfoOpen={onInfoOpen} />
              )}
              {agency.overrideNote && (
                <CorrectedDataNotice on="agency" agency={agency} overrideNote={agency.overrideNote} onInfoOpen={onInfoOpen} />
              )}
            </div>
          )}
        </AgencyCardTop>
      </div>

      <PanelBody>
        {onDemandOn ? (
          <PanelEmpty>{ON_DEMAND_NOT_MAPPED_NOTE}</PanelEmpty>
        ) : filteredRoutes.length === 0 ? (
          <PanelEmpty kind={loadFailed ? 'error' : undefined}>{activeFilterLabel ? noRoutesMatchText(activeFilterLabel) : loadFailed ? AGENCY_ROUTES_FAILED : noServiceToday ? noServiceOnDayNotice('agency', day) : NO_ROUTES_LOADED}</PanelEmpty>
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
                  {!showOtherRoutes ? (
                    <CardHelpNotice
                      message={routesOutsideFiltersNotice(otherRoutes.length)}
                      actionLabel="Show"
                      onLearnMore={() => setShowOtherRoutes(true)}
                    />
                  ) : (
                    <CardHelpNotice
                      message={ROUTES_OUTSIDE_FILTERS_NOTICE}
                      actionLabel="Hide"
                      onLearnMore={() => setShowOtherRoutes(false)}
                    />
                  )}
                </div>
                {showOtherRoutes && (
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
            routes={filteredRoutes}
            liveShortNames={liveShortNames}
            onRouteSelect={onRouteSelect}
          />
        )}
      </PanelBody>
    </Panel>
  );
});
