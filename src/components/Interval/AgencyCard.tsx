import React, { useMemo, useState, useEffect, forwardRef } from 'react';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { FEATURES } from '../../../shared/config';
import { plural } from '../../../shared/overflowText';
import { agencyPagePath } from '../../../shared/agencyPages';
import { areaLinkFor } from '../../../shared/agencyArea';
import agencyPageSlugs from '../../../shared/data/agency-page-slugs.json';
import type { Agency } from '../../App';
import type { OpenInfoFn } from '../InfoPanel';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { CARD_NOTICE_FOOTER, CARD_NOTICE_INLINE, SIDEBAR_LEFT_FALLBACK } from '../../styles';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import { HEADWAY_TIERS } from '../../utils/colors';
import { effectiveMode, isRailReplacementBus, knownModeLabel, sortModes } from '../../../shared/modes';
import { headwayAboutRange } from '../../utils/headwayText';
import { agencyDisplayParts, getRouteLabel, shouldHideNumericRouteShortName, titleCase } from '../../utils/format';
import type { DayType, TimePeriod, ShapeProperties } from '../../hooks/useIntervalStats';
import { passesRouteFilter } from '../../hooks/useIntervalStats';
import { routeListDisplay } from '../../utils/effectiveHeadway';
import { CARD_TITLE, CardDirectionRow, CardHelpNotice, CardReportButton } from './cardUi';
import { OutboundLink } from '../OutboundLink';
import { buildRouteFacts } from '../../utils/routeFacts';
import { currentAtlasUrl } from '../../utils/reportIssue';
import { getRolloutNotice } from '../../../shared/rolloutNotice';
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

interface RouteRow {
  routeId: string;
  agencySlug: string;
  shortName: string;
  longName: string | null;
  headway: number | null;
  limited: boolean;
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
      longName: row.longName,
      ...routeListDisplay(row.props, period),
      tier: row.tier,
      routeType: row.routeType,
      busSubType: row.busSubType,
      matchesFilter: row.matchesFilter,
    }))
    .sort((a, b) => {
      if (a.headway === null) return 1;
      if (b.headway === null) return -1;
      return a.headway - b.headway;
    });
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
  return (
    <div className="py-1">
      {routes.map(r => {
        const isLive = FEATURES.live && liveShortNames.has(r.shortName);
        const key = `${r.agencySlug}::${r.routeId}`;
        const label = shouldHideNumericRouteShortName(r.shortName, r.longName, r.routeType)
          ? r.longName ?? r.shortName
          : getRouteLabel(r.shortName, r.longName);
        return (
          <div key={r.routeId} className="px-3 py-1 hover:bg-[var(--bg-btn-hover)] transition-colors">
          <CardDirectionRow
            label={titleCase(label)}
            headway={r.headway ?? undefined}
            headwayLabel={r.headway != null && r.sharedHeadway != null ? headwayAboutRange(r.sharedHeadway, r.headway) : undefined}
            limited={r.limited}
            subLabel={isRailReplacementBus({ routeType: r.routeType, routeLongName: r.longName })
                ? 'Rail replacement bus'
                : undefined}
            live={isLive}
              dimmed={dimmed}
              onClick={() => onRouteSelect(key)}
            />
          </div>
        );
      })}
    </div>
  );
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
}, ref) {
  const routes = useMemo(
    () => getRoutes(layers, agency.slug, day, period, { maxHeadway, selectedModes, hideSpan, hideLimitedService }),
    [layers, agency.slug, day, period, maxHeadway, selectedModes, hideSpan, hideLimitedService],
  );
  const routeFilters = useMemo(() => buildAgencyRouteFilters(routes), [routes]);
  const [activeFilter, setActiveFilter] = useState<AgencyRouteFilterKey | null>(null);
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);

  useEffect(() => {
    setActiveFilter(null);
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
  const rolloutNotice = getRolloutNotice(agency);
  const coverageNote = FEATURES.onDemand ? onDemandCoverageNote(agency) : null;

  if (onDemandFocus && agency.onDemandServiceArea) {
    const service = agency.onDemandServiceArea;
    const selectedZone = onDemandZoneId
      ? service.features.find(feature => (feature.properties as { areaName?: string } | undefined)?.areaName === onDemandZoneId)
      : undefined;
    const zoneName = (selectedZone?.properties as { areaName?: string } | undefined)?.areaName;
    const zoneDisplayName = zoneName?.replace(/\s+Area$/, '');
    const zone = resolveOnDemandZone(service, zoneName);
    const serviceName = zone.serviceName ?? service.serviceName ?? agencyNamePrimary;
    const pickupSentence = onDemandPickupSentence(service, zoneName);
    // Only claim a shaded area when one belongs to this service (Hamilton's shaded zones are Trans-Cab, not myRide).
    const showsShadedArea = zoneName
      ? true
      : service.features.some(feature => resolveOnDemandZone(service, (feature.properties as { areaName?: string } | undefined)?.areaName).sameServiceAsParent);
    const runningNote = onDemandRunningNote(zone.availability, day, period);
    return (
      <Panel
        ref={ref}
        data-report-anchor="true"
        sidebar
        enter
        className="max-h-[calc(100vh-104px)]"
        style={{
          top: 80, // main's offset (the shared sidebar anchor sits 12px higher)
          '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
          ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
        } as React.CSSProperties}
      >
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
          <p className={`${CARD_TITLE} mb-0`}>{[serviceName, zoneDisplayName].filter(Boolean).join(' — ')}</p>
          <p className="text-xs font-bold text-[var(--text-dim)] mt-1 leading-snug">
            {[agencyNamePrimary, agencyNameSecondary].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
          <div>
            <p className="text-xs font-black text-[var(--text-dim)]">On-demand service</p>
            {showsShadedArea && (
              <p className="text-xs leading-relaxed text-[var(--text-muted)] mt-1">
                The shaded map area shows where this on-demand service operates.
              </p>
            )}
            {pickupSentence && (
              <p className="text-xs leading-relaxed text-[var(--text-muted)] mt-1">{pickupSentence}</p>
            )}
            {coverageNote?.kind === 'partly-mapped' && (
              <p className="text-xs leading-relaxed text-[var(--text-muted)] mt-1">Not on the map yet: {coverageNote.missing}.</p>
            )}
          </div>
          {zone.eligibility && (
            <div className="px-1">
              <p className="text-xs font-black text-[var(--text-dim)]">Who can ride</p>
              <p className="text-xs leading-relaxed text-[var(--text-muted)] mt-1">{zone.eligibility}</p>
            </div>
          )}
          {zone.tripRules && (
            <div className="px-1">
              <p className="text-xs font-black text-[var(--text-dim)]">Trip rules</p>
              <p className="text-xs leading-relaxed text-[var(--text-muted)] mt-1">{zone.tripRules}</p>
            </div>
          )}
          <div className="px-1">
            <p className="text-xs font-black text-[var(--text-dim)]">Service hours</p>
            <p
              className="text-xs leading-relaxed text-[var(--text-muted)] mt-1"
              data-testid="on-demand-running-note"
            >
              {runningNote}
            </p>
            <OnDemandHoursText
              availability={zone.availability}
              serviceHours={zone.serviceHours}
              day={day}
              className="text-xs leading-relaxed text-[var(--text-muted)] mt-1"
            />
            {zone.availability && zone.hoursNote && (
              <p className="text-xs leading-snug text-[var(--text-dim)] mt-1">{zone.hoursNote}</p>
            )}
          </div>
          {zone.bookingInfo && (
            <div className="px-1">
              <p className="text-xs font-black text-[var(--text-dim)]">Booking</p>
              <p className="text-xs leading-relaxed text-[var(--text-muted)] mt-1">{zone.bookingInfo}</p>
            </div>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      ref={ref}
      data-report-anchor="true"
      sidebar
      enter
      className="max-h-[calc(100vh-104px)]"
      style={{
        top: 80, // main's offset (the shared sidebar anchor sits 12px higher)
          '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
        ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
      } as React.CSSProperties}
    >
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
        <div className="flex items-start gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <p className={`${CARD_TITLE} mb-0`}>{agencyNamePrimary}</p>
          <p className="text-xs font-bold text-[var(--text-dim)] mt-1 leading-snug">
            {agency.onDemandOnly
              ? [agencyNameSecondary, 'On-demand service'].filter(Boolean).join(' · ')
              : [agencyNameSecondary, buildHeaderSummary(visibleRoutes, maxHeadway)].filter(Boolean).join(' · ')}
          </p>
          {FEATURES.agencyPages && (agencyPageSlugs as string[]).includes(agency.slug) && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
              <ArrowLink size="xs" href={agencyPagePath(agency.slug)}>About this agency</ArrowLink>
              {(() => { const area = areaLinkFor(agency.slug, FEATURES.agencyPages); return area && <a href={area.href} className="text-[var(--accent)] hover:underline">{area.label}</a>; })()}
            </p>
          )}
          {!agency.onDemandOnly && agency.onDemandServiceArea?.serviceName && (
            <div className="mt-2 border-t border-[var(--border-primary)] pt-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-black text-[var(--accent)]">On-demand service</p>
                {agency.onDemandServiceArea.sourceUrl && (
                  <ArrowLink as={OutboundLink} size="xs" tone="inline" href={agency.onDemandServiceArea.sourceUrl} kind="on_demand_source" agencySlug={agency.slug} className="shrink-0">
                    Details
                  </ArrowLink>
                )}
              </div>
              <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5">{agency.onDemandServiceArea.serviceName}</p>
              <OnDemandHoursText
                availability={agency.onDemandServiceArea.availability}
                serviceHours={agency.onDemandServiceArea.serviceHours}
                day={day}
                className="text-xs leading-snug text-[var(--text-muted)] mt-0.5"
              />
              {agency.onDemandServiceArea.tripRules && (
                <p className="text-xs leading-snug text-[var(--text-muted)] mt-0.5">{agency.onDemandServiceArea.tripRules}</p>
              )}
              {otherZoneServices(agency.onDemandServiceArea).map(zoneService => (
                <div key={zoneService.serviceName} className="mt-1.5">
                  <p className="text-xs font-bold text-[var(--text-primary)]">{zoneService.serviceName}</p>
                  <OnDemandHoursText
                    availability={zoneService.availability}
                    serviceHours={zoneService.serviceHours}
                    day={day}
                    className="text-xs leading-snug text-[var(--text-muted)] mt-0.5"
                  />
                </div>
              ))}
              {coverageNote?.kind === 'partly-mapped' && (
                <p className="text-xs leading-snug text-[var(--text-muted)] mt-1">
                  Not on the map yet: {coverageNote.missing}.
                </p>
              )}
            </div>
          )}
          {!agency.onDemandOnly && coverageNote?.kind === 'not-mapped' && (
            <div className="mt-2 border-t border-[var(--border-primary)] pt-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-black text-[var(--accent)]">On-demand service</p>
                {coverageNote.url && (
                  <ArrowLink as={OutboundLink} size="xs" tone="inline" href={coverageNote.url} kind="coverage_note" agencySlug={agency.slug} className="shrink-0">
                    Details
                  </ArrowLink>
                )}
              </div>
              <p className="text-xs font-bold text-[var(--text-primary)] mt-0.5">{coverageNote.serviceName}</p>
              <p className="text-xs leading-snug text-[var(--text-muted)] mt-0.5">
                Its service area isn't on the map yet.
              </p>
            </div>
          )}
          {routeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {routeFilters.map(f => {
                const on = activeFilter === f.key;
                return (
                  <Pill
                    key={f.key}
                    onClick={() => setActiveFilter(on ? null : f.key)}
                    selected={on}
                    className="px-2"
                  >
                    {f.label}
                    <span className={on ? 'opacity-80' : 'text-[var(--text-dim)]'}> {f.count}</span>
                  </Pill>
                );
              })}
            </div>
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
          </div>
          <CardReportButton
            title={`Agency issue: ${agency.name}`}
            details={`**Agency:** ${agency.name}\n**Agency slug:** ${agency.slug}\n**Day:** ${day}\n**Period:** ${period}\n**Atlas URL:** ${currentAtlasUrl()}`}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly', 'Route line is missing or follows the wrong path']}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {visibleRoutes.length === 0 ? (
          <PanelEmpty>{activeFilterLabel ? `No ${activeFilterLabel.toLowerCase()} routes match.` : 'No routes loaded yet.'}</PanelEmpty>
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
      </div>
    </Panel>
  );
});
