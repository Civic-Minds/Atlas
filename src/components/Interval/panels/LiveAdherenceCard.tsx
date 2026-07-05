import React from 'react';
import type { LiveStatus } from '../../../hooks/useLiveAdherence';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { routeKey } from '../../../hooks/useIntervalStats';
import { FLOATING_CARD, PANEL_ENTER } from '../../../styles';

export interface LiveAdherenceStopRow {
  stopId: string;
  name: string;
  avgGap: number | null;
  delta: number | null;
}

export interface LiveRouteInfoData {
  agencySlug: string;
  stopRows: LiveAdherenceStopRow[];
}

export interface LiveAdherenceCardProps {
  liveRouteInfo: LiveRouteInfoData;
  liveStatus: LiveStatus;
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  hasCurrentRoute: boolean;
  nonCorridorLayers: Record<string, GeoJSON.FeatureCollection>;
  selectedRoute: string | null;
  setSelectedRoute: (r: string | null) => void;
  setSelectedStop: (s: string | null) => void;
}

export const LiveAdherenceCard: React.FC<LiveAdherenceCardProps> = ({
  liveRouteInfo,
  liveStatus,
  showDebug,
  setShowDebug,
  hasCurrentRoute,
  nonCorridorLayers,
  selectedRoute,
  setSelectedRoute,
  setSelectedStop,
}) => {
  return (
    <div className={`p-4 ${FLOATING_CARD} ${PANEL_ENTER} space-y-2 shrink-0`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 ${liveStatus === 'live' ? 'animate-pulse' : 'opacity-40'}`} />
        <span className="text-[10px] font-black text-green-400">Live</span>
        {liveStatus === 'pending' && (
          <span className="text-[10px] font-bold text-[var(--text-dim)]">fetching…</span>
        )}
      </div>
      {liveStatus === 'live' && (
        <>
          {liveRouteInfo.stopRows.length > 0 && (
            <div className="space-y-2">
              {liveRouteInfo.stopRows.map(stop => {
                const absDelta = stop.delta == null ? null : Math.abs(stop.delta);
                const dotColor = absDelta == null ? 'var(--text-dim)'
                  : absDelta >= 5 ? '#f87171'
                  : absDelta >= 2 ? '#fbbf24'
                  : '#4ade80';
                const deltaLabel = stop.delta == null ? null
                  : absDelta! < 2 ? 'on time'
                  : stop.delta > 0 ? `+${Math.round(stop.delta)} min`
                  : `${Math.round(stop.delta)} min`;
                const deltaColor = absDelta == null ? ''
                  : absDelta >= 5 ? 'text-red-400'
                  : absDelta >= 2 ? 'text-amber-400'
                  : 'text-green-400';
                return (
                  <button
                    key={stop.stopId}
                    className="text-[11px] w-full text-left hover:opacity-70 transition-opacity"
                    onClick={() => { setSelectedRoute(null); setSelectedStop(`${liveRouteInfo.agencySlug}::${stop.stopId}`); }}
                  >
                    <span className="font-bold text-[var(--text-muted)] block truncate">
                      {stop.name}
                    </span>
                    <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                      {stop.avgGap != null ? `${Math.round(stop.avgGap)} min` : '—'}
                      {deltaLabel != null && (
                        <span className={`text-[10px] font-bold tabular-nums ${deltaColor}`}>{deltaLabel}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
        <button
          onClick={() => setShowDebug(v => !v)}
          className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
        >
          {showDebug ? '▾' : '▸'} debug headways
        </button>
        {showDebug && hasCurrentRoute && (
          <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
              <span>headsign</span>
              <span>dir</span>
              <span>route hw</span>
              <span>tier</span>
            </div>
            {(() => {
              const rows: { headsign: string; dir: number; headway: number | null; tier: string }[] = [];
              for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
                for (const f of fc.features) {
                  const p = f.properties as unknown as ShapeProperties;
                  if (routeKey({ ...p, agencySlug: slug } as any) !== selectedRoute) continue;
                  rows.push({ headsign: p.headsign || '—', dir: (p as any).directionId ?? 0, headway: p.headway ?? null, tier: (p as any).tier || '—' });
                }
              }
              return rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2">
                  <span className="truncate">{r.headsign}</span>
                  <span>d{r.dir}</span>
                  <span>{r.headway != null ? `${r.headway}m` : '—'}</span>
                  <span>{r.tier}</span>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
