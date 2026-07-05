import React from 'react';
import { X } from 'lucide-react';
import { isLivePollingRoute } from '../../../utils/livePolling';
import { titleCase, cleanHeadsign, fmtHeadway, getRouteLabel } from '../../../utils/format';
import { PANEL_ENTER_LEFT } from '../../../styles';
import { PERIOD_LABELS } from '../../../hooks/useIntervalStats';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import { headwayToTierColor } from '../HeadwaySparkline';
import DirectionLabel from '../DirectionLabel';

export interface StopBranch {
  rKey: string;
  headsign: string | null;
  headway: number | null;
  stopPeriodHw: Partial<Record<string, number>> | undefined;
  directionId: number;
}

export interface StopRoute {
  shortName: string;
  longName: string;
  agencyName: string;
  branches: StopBranch[];
}

export interface NearbyConnection {
  rKey: string;
  routeShortName: string;
  routeLongName: string;
  agencyName: string;
  headway: number | null;
  nearestStopName: string;
  distanceMeters: number;
}

export interface DebugRow {
  routeId: string;
  shortName: string;
  dir: number;
  headsign: string;
  stopHw: number | null;
  routeHw: number | null;
}

export interface CurrentStopData {
  stopName: string;
}

export interface StopCardProps {
  currentStop: CurrentStopData;
  setSelectedStop: (s: string | null) => void;
  setSelectedRoute: (r: string | null) => void;
  stopAgencies: string[];
  stopAgencyFilter: string | null;
  setStopAgencyFilter: React.Dispatch<React.SetStateAction<string | null>>;
  filteredStopRoutes: StopRoute[];
  period: TimePeriod;
  nearbyConnections: NearbyConnection[];
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  debugRows: DebugRow[];
}

export const StopCard: React.FC<StopCardProps> = ({
  currentStop,
  setSelectedStop,
  setSelectedRoute,
  stopAgencies,
  stopAgencyFilter,
  setStopAgencyFilter,
  filteredStopRoutes,
  period,
  nearbyConnections,
  showDebug,
  setShowDebug,
  debugRows,
}) => {
  return (
    <div className={`mb-5 ${PANEL_ENTER_LEFT}`}>
      <div className="flex items-center justify-end mb-2 -mt-2 -mr-2">
        <button onClick={() => setSelectedStop(null)} className="p-2 text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-full transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight mb-2">
        {titleCase(currentStop.stopName)}
      </h3>
      {stopAgencies.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mb-2">
          {stopAgencies.map((name, i) => (
            <React.Fragment key={name}>
              <button
                onClick={() => setStopAgencyFilter(stopAgencyFilter === name ? null : name)}
                className={`text-[10px] font-bold transition-colors ${
                  stopAgencyFilter === name
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-muted)]'
                }`}
              >
                {name}
              </button>
              {i < stopAgencies.length - 1 && (
                <span className="text-[10px] text-[var(--border-primary)] select-none">·</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {filteredStopRoutes.map(({ shortName, longName, agencyName, branches }) => (
          <div key={shortName} className="text-[11px]">
            <div className="font-black text-[var(--text-primary)] mb-0.5">
              {titleCase(getRouteLabel(shortName, longName, agencyName))}
            </div>
            <div className="space-y-0.5">
              {(() => {
                const hasMultipleDirections = new Set(branches.map(b => b.directionId)).size > 1;
                let lastDir: number | null = null;
                return branches.map(({ rKey, headsign, headway, stopPeriodHw, directionId }) => {
                  const cleaned = headsign && !/^A[0-9]/.test(shortName)
                    ? titleCase(cleanHeadsign(headsign.trim(), shortName, longName))
                    : null;
                  const isTo = cleaned && /^to\s/i.test(cleaned);
                  const displayPrefix = isTo ? 'to' : '→';
                  const displayBody = cleaned
                    ? (isTo ? cleaned.replace(/^to\s+/i, '') : cleaned)
                    : `dir ${directionId}`;
                  const showDivider = hasMultipleDirections && lastDir !== null && directionId !== lastDir;
                  lastDir = directionId;
                  const displayHw = (period !== 'all' ? stopPeriodHw?.[period] : undefined) ?? headway;
                  const showPeriodLabel = period !== 'all' && stopPeriodHw?.[period] != null;
                  return (
                    <React.Fragment key={`${rKey}::${directionId}::${headsign ?? ''}`}>
                      {showDivider && (
                        <div className="my-1 border-t border-[var(--border-primary)] opacity-50" />
                      )}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => { setSelectedStop(null); setSelectedRoute(rKey); }}
                          className="flex items-start gap-1.5 font-bold hover:text-[var(--accent)] transition-colors text-left"
                        >
                          <span className="shrink-0 min-w-[14px] text-center text-[var(--text-muted)] opacity-75">{displayPrefix}</span>
                          <DirectionLabel label={displayBody} className="inline" />
                        </button>
                        {displayHw != null && (
                          <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)] shrink-0 ml-2">
                            {isLivePollingRoute(rKey.split('::')[0], shortName) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Live data available" />
                            )}
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: headwayToTierColor(displayHw) }}
                            />
                            {fmtHeadway(displayHw)}
                            {showPeriodLabel && (
                              <span className="text-[9px] font-bold text-[var(--text-dim)]">{PERIOD_LABELS[period]}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          </div>
        ))}
      </div>

      {nearbyConnections.length > 0 && (
        <div className="mt-3 -mx-4 px-4 pt-3 pb-2 border-t-4 border-[var(--border-primary)] bg-[var(--bg-hover)]">
          <div className="text-[10px] font-black text-[var(--text-dim)] mb-1.5">Within 10 min walk</div>
          <div className="space-y-1.5">
            {nearbyConnections.map(({ rKey, routeShortName, routeLongName, agencyName, headway, nearestStopName, distanceMeters }) => {
              const walkMin = Math.max(1, Math.round(distanceMeters / 80));
              return (
                <div key={rKey} className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => { setSelectedStop(null); setSelectedRoute(rKey); }}
                    className="flex flex-col items-start font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-left min-w-0"
                  >
                    <span className="text-[11px] leading-tight">{titleCase(getRouteLabel(routeShortName, routeLongName, agencyName))}</span>
                    <span className="text-[9px] text-[var(--text-dim)] font-normal truncate max-w-full">{nearestStopName} · {walkMin} min walk</span>
                  </button>
                  {headway != null && (
                    <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)] text-[11px] shrink-0 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: headwayToTierColor(headway) }} />
                      {fmtHeadway(headway)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
        <button
          onClick={() => setShowDebug(v => !v)}
          className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
        >
          {showDebug ? '▾' : '▸'} debug headways
        </button>
        {showDebug && (
          <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
              <span>route / dir / headsign</span>
              <span>stop hw</span>
              <span>route hw</span>
              <span>used</span>
            </div>
            {debugRows.map((r, i) => (
              <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 ${r.stopHw != null ? 'text-[var(--text-primary)]' : ''}`}>
                <span className="truncate">{r.shortName} d{r.dir} {r.headsign}</span>
                <span>{r.stopHw != null ? `${r.stopHw}m` : '—'}</span>
                <span>{r.routeHw != null ? `${r.routeHw}m` : '—'}</span>
                <span>{r.stopHw != null ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
