import React, { useMemo } from 'react';
import { X, Radio } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { liveRouteLabel } from '../InfoPanel';
import type { Agency } from '../../App';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { FLOATING_CARD, PANEL_ENTER } from '../../styles';

interface RouteRow {
  routeId: string;
  agencySlug: string;
  shortName: string;
  longName: string | null;
  headway: number | null;
  tier: string | null;
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
      });
    }
  }

  return [...best.values()].sort((a, b) => {
    if (a.headway === null) return 1;
    if (b.headway === null) return -1;
    return a.headway - b.headway;
  });
}

interface Props {
  agency: Agency;
  layers: AgencyLayers;
  day: 'Weekday' | 'Saturday' | 'Sunday';
  onClose: () => void;
  onRouteSelect: (key: string) => void;
  className?: string;
}

export function AgencyCard({ agency, layers, day, onClose, onRouteSelect, className = "absolute top-20 left-[182px] z-[1000] w-64 max-h-[calc(100vh-104px)]" }: Props) {
  const routes = useMemo(() => getRoutes(layers, agency.slug, day), [layers, agency.slug, day]);
  const liveRoutes = useMemo(
    () => LIVE_POLLING_ROUTES.filter(r => r.slug === agency.slug && (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar || r.active)),
    [agency.slug]
  );
  const liveShortNames = useMemo(() => new Set(liveRoutes.map(r => r.displayRouteShortName)), [liveRoutes]);

  return (
    <div className={`${className} flex flex-col ${FLOATING_CARD} ${PANEL_ENTER} overflow-hidden`}>
      <div className="shrink-0 flex items-start justify-between px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
        <div>
          <p className="text-sm font-black text-[var(--text-primary)] leading-tight">{agency.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {agency.region && (
              <span className="text-[9px] font-bold text-[var(--text-dim)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2 py-0.5">{agency.region}</span>
            )}
            <span className="text-[9px] font-bold text-[var(--text-dim)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2 py-0.5">
              {routes.length} route{routes.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[9px] text-[var(--text-dim)] font-mono">{agency.slug}</span>
          </div>
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

      <div className="flex-1 overflow-y-auto custom-scrollbar">
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
      </div>
    </div>
  );
}
