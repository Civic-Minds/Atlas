import React, { useMemo, useState, useEffect, forwardRef } from 'react';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import type { Agency, FareOverride } from '../../App';
import type { OpenInfoFn } from '../InfoPanel';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { FLOATING_CARD, PANEL_ENTER, PANEL_SEARCH_SUBHEAD, Z_PANEL, SIDEBAR_LEFT_FALLBACK, SIDEBAR_PANEL_WIDTH } from '../../styles';
import { getFareColor, HEADWAY_TIERS } from '../../utils/colors';
import { effectiveMode, GTFS_RAIL_MODE_LABELS, VIRTUAL_LRT_MODE } from '../../../shared/modes';
import { getRouteLabel, shortenAgencyName, titleCase } from '../../utils/format';
import type { DayType, TimePeriod, ShapeProperties } from '../../hooks/useIntervalStats';
import { passesRouteFilter } from '../../hooks/useIntervalStats';
import { effectiveRouteHeadway } from '../../utils/effectiveHeadway';
import { CARD_TITLE, CardDirectionRow, CardHelpNotice } from './cardUi';

interface RouteRow {
  routeId: string;
  agencySlug: string;
  shortName: string;
  longName: string | null;
  headway: number | null;
  tier: string | null;
  routeType: number;
  busSubType: string | undefined;
  matchesFilter: boolean;
}

interface AgencyListFilters {
  maxHeadway: number;
  selectedModes: Set<number>;
  hideSpan: boolean;
}

function getRoutes(
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
    livePollingOnly: false,
    showCorridors: false,
    showCorridorBand: false,
    selectedRoute: null,
  };

  const best = new Map<string, RouteRow>();
  for (const f of fc.features) {
    const p = f.properties as ShapeProperties;
    if (!p.routeId || !p.routeShortName || (p as { stopId?: string }).stopId) continue;
    if (p.day && p.day !== day) continue;
    // Allow both directions so routes with 15min in one dir show in filters.

    const key = p.routeShortName;
    const h = effectiveRouteHeadway(p, period);
    const matchesFilter = passesRouteFilter(p, slug, agencyFilters, null);
    const existing = best.get(key);
    if (!existing || (h !== null && (existing.headway === null || h < existing.headway))) {
      best.set(key, {
        routeId: p.routeId,
        agencySlug: p.agencySlug ?? slug,
        shortName: p.routeShortName,
        longName: p.routeLongName ?? null,
        headway: h,
        tier: p.tier ?? null,
        routeType: typeof p.routeType === 'number' ? p.routeType : 3,
        busSubType: p.busSubType ?? undefined,
        matchesFilter,
      });
    }
  }

  return [...best.values()].sort((a, b) => {
    if (a.headway === null) return 1;
    if (b.headway === null) return -1;
    return a.headway - b.headway;
  });
}

function frequencyFilterLabel(maxHeadway: number): string | null {
  if (maxHeadway === Infinity) return null;
  return HEADWAY_TIERS.find(t => t.max === maxHeadway)?.label ?? `≤${maxHeadway}m`;
}

export function buildHeaderSummary(
  routes: RouteRow[],
  maxHeadway: number,
): string {
  const matching = routes.filter(r => r.matchesFilter).length;
  const parts = [`${routes.length} route${routes.length !== 1 ? 's' : ''}`];
  const freqLabel = frequencyFilterLabel(maxHeadway);
  if (freqLabel) parts.push(`${matching} match ${freqLabel}`);
  return parts.join(' · ');
}

function railBlurbLabel(route: RouteRow): string | null {
  const mode = effectiveMode({
    routeType: route.routeType,
    routeLongName: route.longName,
    agencySlug: route.agencySlug,
  });
  if (mode === VIRTUAL_LRT_MODE) return 'light rail';
  return GTFS_RAIL_MODE_LABELS[mode] ?? null;
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
    const mode = effectiveMode({
      routeType: r.routeType,
      routeLongName: r.longName,
      agencySlug: r.agencySlug,
    });
    const list = byMode.get(mode) ?? [];
    list.push(r);
    byMode.set(mode, list);
  }

  for (const [mode, rs] of [...byMode.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const label = railBlurbLabel(rs[0]);
    if (!label) continue;
    chips.push({
      key: `mode:${mode}`,
      label: titleCase(label),
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
    const mode = Number(filter.slice(5));
    return effectiveMode({
      routeType: r.routeType,
      routeLongName: r.longName,
      agencySlug: r.agencySlug,
    }) === mode;
  }
  if (filter === 'subtype:brt') return r.busSubType === 'brt';
  if (filter === 'subtype:express') return r.busSubType === 'express';
  return true;
}

interface Props {
  agency: Agency;
  layers: AgencyLayers;
  day: DayType;
  period: TimePeriod;
  maxHeadway: number;
  selectedModes: Set<number>;
  hideSpan: boolean;
  onRouteSelect: (key: string) => void;
  sidebarLeft?: number;
  fareView?: boolean;
  fareOverride?: FareOverride;
  onInfoOpen?: OpenInfoFn;
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
        const isLive = liveShortNames.has(r.shortName);
        const key = `${r.agencySlug}::${r.routeId}`;
        return (
          <div key={r.routeId} className="px-3 py-1 hover:bg-[var(--bg-btn-hover)] transition-colors">
            <CardDirectionRow
              label={titleCase(getRouteLabel(r.shortName, r.longName))}
              headway={r.headway ?? undefined}
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
  onRouteSelect,
  sidebarLeft,
  fareView,
  fareOverride,
  onInfoOpen,
}, ref) {
  const routes = useMemo(
    () => getRoutes(layers, agency.slug, day, period, { maxHeadway, selectedModes, hideSpan }),
    [layers, agency.slug, day, period, maxHeadway, selectedModes, hideSpan],
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

  const matchingRoutes = useMemo(
    () => filteredRoutes.filter(r => r.matchesFilter),
    [filteredRoutes],
  );
  const otherRoutes = useMemo(
    () => filteredRoutes.filter(r => !r.matchesFilter),
    [filteredRoutes],
  );
  const hasFilterSplit = otherRoutes.length > 0 && maxHeadway !== Infinity;
  const showOthersExpanded = showOtherRoutes || matchingRoutes.length === 0;

  useEffect(() => {
    setShowOtherRoutes(false);
  }, [agency.slug, maxHeadway, period, day]);

  const visibleRoutes = filteredRoutes;

  const activeFilterLabel = routeFilters.find(f => f.key === activeFilter)?.label;

  const baseFare = useMemo(() => {
    if (!fareView) return null;
    if (fareOverride?.free) return 0;
    const fc = layers[agency.slug];
    if (fc) {
      for (const f of fc.features) {
        const bf = (f.properties as any).baseFare;
        if (typeof bf === 'number') return bf as number;
      }
    }
    return fareOverride?.adult ?? agency.fare ?? null;
  }, [fareView, fareOverride, layers, agency]);
  const liveRoutes = useMemo(
    () => LIVE_POLLING_ROUTES.filter(r => r.slug === agency.slug && (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar || r.active)),
    [agency.slug]
  );
  const liveShortNames = useMemo(() => new Set(liveRoutes.map(r => r.displayRouteShortName)), [liveRoutes]);

  return (
    <div
      ref={ref}
      className={`absolute top-20 left-6 sm:left-[var(--sidebar-left)] ${Z_PANEL} ${SIDEBAR_PANEL_WIDTH} ${fareView ? '' : 'max-h-[calc(100vh-104px)] flex flex-col'} ${FLOATING_CARD} ${PANEL_ENTER} overflow-hidden`}
      style={{ '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px` } as React.CSSProperties}
    >
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
        <div className="min-w-0">
          <p className={`${CARD_TITLE} mb-0`}>{shortenAgencyName(agency.name)}</p>
          {fareView ? (
            <>
              {fareOverride?.free ? (
                <div className="mt-2">
                  <span className="text-sm font-black px-2.5 py-0.5 rounded-full text-white bg-emerald-500">FREE</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-bold text-[var(--text-dim)]">
                      {fareOverride?.label ? `Adult (${fareOverride.label})` : 'Base adult fare'}
                      {fareOverride?.zones ? ' · from' : ''}
                    </span>
                    {baseFare != null ? (
                      <span
                        className="text-sm font-black px-2.5 py-0.5 rounded-full text-white"
                        style={{ background: getFareColor(baseFare) }}
                      >
                        ${baseFare.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-dim)]">fare varies</span>
                    )}
                  </div>
                  {fareOverride?.adultCash != null && fareOverride.adultCash !== baseFare && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-[var(--text-dim)]">Cash</span>
                      <span className="text-xs font-bold text-[var(--text-muted)]">${fareOverride.adultCash.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
              {(fareOverride?.fareUrl ?? agency.fareUrl) && (
                <a
                  href={fareOverride?.fareUrl ?? agency.fareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[var(--accent)] hover:underline mt-1.5 block"
                >
                  View all fares →
                </a>
              )}
            </>
          ) : (
          <>
          <p className="text-[9px] font-bold text-[var(--text-dim)] mt-1 leading-snug">
            {[
              agency.region,
              buildHeaderSummary(visibleRoutes, maxHeadway),
            ].filter(Boolean).join(' · ')}
          </p>
          {routeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {routeFilters.map(f => {
                const on = activeFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveFilter(on ? null : f.key)}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                      on
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                        : 'bg-[var(--bg-app)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--accent-border)]'
                    }`}
                  >
                    {f.label}
                    <span className={on ? 'text-white/80' : 'text-[var(--text-dim)]'}> {f.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          </>
          )}
          {agency.excludeRouteShortNames?.length && agency.overrideNote && onInfoOpen && (
            <div className="mt-2 border-t border-[var(--border-primary)] pt-2 opacity-80">
              <CardHelpNotice
                message="We corrected this data."
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'corrected-data',
                  agencyName: agency.name,
                  overrideNote: agency.overrideNote,
                })}
              />
            </div>
          )}
        </div>
      </div>

      {!fareView && <div className="flex-1 overflow-y-auto custom-scrollbar">
        {visibleRoutes.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[var(--text-dim)]">
            {activeFilterLabel ? `No ${activeFilterLabel.toLowerCase()} routes match.` : 'No routes loaded yet.'}
          </p>
        ) : hasFilterSplit ? (
          <>
            {matchingRoutes.length > 0 && (
              <>
                <div className={PANEL_SEARCH_SUBHEAD}>Matching your filters</div>
                <RouteListSection
                  routes={matchingRoutes}
                  liveShortNames={liveShortNames}
                  onRouteSelect={onRouteSelect}
                />
              </>
            )}
            {otherRoutes.length > 0 && (
              <>
                <div className="px-4 pt-2 pb-1 opacity-80">
                  {!showOthersExpanded ? (
                    <CardHelpNotice
                      message={`${otherRoutes.length} route${otherRoutes.length !== 1 ? 's' : ''} outside your filters.`}
                      actionLabel="Show →"
                      onLearnMore={() => setShowOtherRoutes(true)}
                    />
                  ) : (
                    <CardHelpNotice
                      message="Routes outside your filters."
                      actionLabel="Hide →"
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
      </div>}
    </div>
  );
});
