import React from 'react';
import type { LiveStatus } from '../../../hooks/useLiveAdherence';
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
  setSelectedRoute: (r: string | null) => void;
  setSelectedStop: (s: string | null) => void;
}

export const LiveAdherenceCard: React.FC<LiveAdherenceCardProps> = ({
  liveRouteInfo,
  liveStatus,
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

    </div>
  );
};
