import React, { useMemo } from 'react';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import type { Agency, FareOverride } from '../../App';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { FLOATING_CARD, PANEL_ENTER, Z_PANEL, SIDEBAR_LEFT_FALLBACK } from '../../styles';
import { getFareColor } from '../../utils/colors';
import { effectiveMode, GTFS_RAIL_MODE_LABELS, VIRTUAL_LRT_MODE } from '../../../shared/modes';
import { getRouteLabel, shortenAgencyName, titleCase } from '../../utils/format';
import type { DayType } from '../../hooks/useIntervalStats';
import { CARD_TITLE, CardCloseButton, CardDirectionRow, DataOverrideLink } from './cardUi';

interface RouteRow {
  routeId: string;
  agencySlug: string;
  shortName: string;
  longName: string | null;
  headway: number | null;
  tier: string | null;
  routeType: number;
  busSubType: string | undefined;
}

function getRoutes(layers: AgencyLayers, slug: string, day: string): RouteRow[] {
  const fc = layers[slug];
  if (!fc) return [];

  const best = new Map<string, RouteRow>();
  for (const f of fc.features) {
    const p = f.properties as any;
    if (!p.routeId || !p.routeShortName || p.stopId) continue;
    if (p.day && p.day !== day) continue;

    const key = p.routeShortName;
    const h: number | null = p.headway ?? null;
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
      });
    }
  }

  return [...best.values()].sort((a, b) => {
    if (a.headway === null) return 1;
    if (b.headway === null) return -1;
    return a.headway - b.headway;
  });
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

function getAgencyBlurb(routes: RouteRow[]): string | null {
  const brt = routes.filter(r => r.busSubType === 'brt');
  const express = routes.filter(r => r.busSubType === 'express');
  const parts: string[] = [];
  const railTypes = [...new Set(routes.map(railBlurbLabel).filter((l): l is string => l != null))];
  if (railTypes.length) parts.push(railTypes.join(' and '));
  if (brt.length) parts.push(`${brt.length} BRT corridor${brt.length !== 1 ? 's' : ''}`);
  if (express.length) parts.push(`${express.length} express route${express.length !== 1 ? 's' : ''}`);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

interface Props {
  agency: Agency;
  layers: AgencyLayers;
  day: DayType;
  onClose: () => void;
  onRouteSelect: (key: string) => void;
  sidebarLeft?: number;
  fareView?: boolean;
  fareOverride?: FareOverride;
}

export function AgencyCard({ agency, layers, day, onClose, onRouteSelect, sidebarLeft, fareView, fareOverride }: Props) {
  const routes = useMemo(() => getRoutes(layers, agency.slug, day), [layers, agency.slug, day]);
  const agencyBlurb = useMemo(() => getAgencyBlurb(routes), [routes]);

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
      className={`absolute top-20 ${Z_PANEL} w-64 ${fareView ? '' : 'max-h-[calc(100vh-104px)] flex flex-col'} ${FLOATING_CARD} ${PANEL_ENTER} overflow-hidden`}
      style={{ left: sidebarLeft ?? SIDEBAR_LEFT_FALLBACK }}
    >
      <div className="shrink-0 flex items-start justify-between px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
        <div className="flex-1 min-w-0">
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
            {[agency.region, `${routes.length} route${routes.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
          </p>
          {agencyBlurb && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-snug">{agencyBlurb}</p>
          )}
          </>
          )}
          {agency.excludeRouteShortNames?.length ? (
            <DataOverrideLink slug={agency.slug} issueUrl={agency.issueUrl} />
          ) : null}
        </div>
        <CardCloseButton onClick={onClose} variant="compact" />
      </div>

      {!fareView && <div className="flex-1 overflow-y-auto custom-scrollbar">
        {routes.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[var(--text-dim)]">No routes loaded yet.</p>
        ) : (
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
                    onClick={() => onRouteSelect(key)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>}
    </div>
  );
}
