import React, { useMemo } from 'react';
import { X, Radio } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { liveRouteLabel } from '../InfoPanel';
import type { Agency, FareOverride } from '../../App';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { FLOATING_CARD, PANEL_ENTER, Z_PANEL, SIDEBAR_LEFT_FALLBACK } from '../../styles';
import { getFareColor } from '../../utils/colors';

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

function getAgencyBlurb(routes: RouteRow[]): string | null {
  const rtLabels: Record<number, string> = { 0: 'light rail', 1: 'subway', 2: 'commuter rail', 4: 'ferry', 5: 'cable car', 6: 'gondola', 7: 'funicular', 11: 'trolleybus', 12: 'monorail' };
  const rail = routes.filter(r => r.routeType in rtLabels);
  const brt = routes.filter(r => r.busSubType === 'brt');
  const express = routes.filter(r => r.busSubType === 'express');
  const parts: string[] = [];
  const railTypes = [...new Set(rail.map(r => rtLabels[r.routeType]))];
  if (railTypes.length) parts.push(railTypes.join(' and '));
  if (brt.length) parts.push(`${brt.length} BRT corridor${brt.length !== 1 ? 's' : ''}`);
  if (express.length) parts.push(`${express.length} express route${express.length !== 1 ? 's' : ''}`);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

interface Props {
  agency: Agency;
  layers: AgencyLayers;
  day: 'Weekday' | 'Saturday' | 'Sunday';
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
          <p className="text-sm font-black text-[var(--text-primary)] leading-tight">{agency.name}</p>
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
            <a
              href={agency.issueUrl ?? `https://github.com/Civic-Minds/Atlas/issues?q=is%3Aissue+${agency.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mt-1 block"
            >
              We corrected this data
            </a>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors shrink-0 mt-0.5"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!fareView && <div className="flex-1 overflow-y-auto custom-scrollbar">
        {routes.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[var(--text-dim)]">No routes loaded yet.</p>
        ) : (
          <div className="py-2">
            {routes.map(r => {
              const color = r.tier ? getTierColor(r.tier) : 'var(--text-dim)';
              const isLive = liveShortNames.has(r.shortName);
              const key = `${r.agencySlug}::${r.routeId}`;
              return (
                <button
                  key={r.routeId}
                  onClick={() => onRouteSelect(key)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 text-xs text-[var(--text-primary)] font-bold truncate group-hover:text-[var(--accent)] transition-colors">
                    {r.shortName}
                    {r.longName && <span className="font-normal text-[var(--text-muted)] ml-1 truncate">{r.longName}</span>}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isLive && <Radio className="w-2.5 h-2.5 text-[var(--accent)]" />}
                    {r.headway !== null && (
                      <span className="text-[10px] text-[var(--text-dim)]">{r.headway}m</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>}
    </div>
  );
}
