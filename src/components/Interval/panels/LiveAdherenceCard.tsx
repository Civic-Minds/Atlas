import React from 'react';
import type { LiveStatus } from '../../../hooks/useLiveAdherence';
import Panel from '../../ui/Panel';

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
    <Panel enter className="p-4 space-y-2 shrink-0">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full bg-[var(--status-positive)] shrink-0 ${liveStatus === 'live' ? 'animate-pulse' : 'opacity-40'}`} />
        <span className="text-xs font-black text-[var(--status-positive-text)]">Live</span>
        {liveStatus === 'pending' && (
          <span className="text-xs font-bold text-[var(--text-dim)]">fetching…</span>
        )}
      </div>
      {liveStatus === 'live' && (
        <>
          {liveRouteInfo.stopRows.length > 0 && (
            <div className="space-y-2">
              {liveRouteInfo.stopRows.map(stop => {
                const absDelta = stop.delta == null ? null : Math.abs(stop.delta);
                const dotColor = absDelta == null ? 'var(--text-dim)'
                  : absDelta >= 5 ? 'var(--status-negative)'
                  : absDelta >= 2 ? 'var(--status-caution)'
                  : 'var(--status-positive)';
                const deltaLabel = stop.delta == null ? null
                  : absDelta! < 2 ? 'on time'
                  : stop.delta > 0 ? `+${Math.round(stop.delta)} min`
                  : `${Math.round(stop.delta)} min`;
                const deltaColor = absDelta == null ? ''
                  : absDelta >= 5 ? 'text-[var(--status-negative-text)]'
                  : absDelta >= 2 ? 'text-[var(--status-caution-text)]'
                  : 'text-[var(--status-positive-text)]';
                return (
                  <button
                    key={stop.stopId}
                    className="text-xs w-full text-left hover:opacity-70 transition-opacity"
                    onClick={() => { setSelectedRoute(null); setSelectedStop(`${liveRouteInfo.agencySlug}::${stop.stopId}`); }}
                  >
                    <span className="font-bold text-[var(--text-muted)] block truncate">
                      {stop.name}
                    </span>
                    <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                      {stop.avgGap != null ? `${Math.round(stop.avgGap)} min` : '—'}
                      {deltaLabel != null && (
                        <span className={`text-xs font-bold tabular-nums ${deltaColor}`}>{deltaLabel}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

    </Panel>
  );
};
