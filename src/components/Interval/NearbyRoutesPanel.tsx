import React from 'react';
import { X, LocateFixed } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { fmtHeadway, titleCase } from '../../utils/format';
import type { NearbyRoute } from '../../hooks/useNearbyRoutes';
import { FLOATING_CARD, PANEL_ENTER, PANEL_Z_INDEX, LIST_ROW } from '../../styles';

interface NearbyRoutesPanelProps {
  routes: NearbyRoute[];
  onClose: () => void;
  setSelectedRoute: (key: string | null) => void;
}

function fmtDist(m: number): string {
  return m < 100 ? `${Math.round(m)} m` : `${Math.round(m / 10) * 10} m`;
}

export const NearbyRoutesPanel: React.FC<NearbyRoutesPanelProps> = ({
  routes,
  onClose,
  setSelectedRoute,
}) => {
  const nearestStop = routes.length > 0
    ? `${titleCase(routes[0].nearestStopName)} · ${fmtDist(routes[0].distanceMeters)}`
    : null;

  return (
    <div
      style={{ position: 'absolute', bottom: 72, right: 12, zIndex: PANEL_Z_INDEX }}
      className={`w-64 max-h-72 flex flex-col ${FLOATING_CARD} ${PANEL_ENTER}`}
    >
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 border-b border-[var(--border-primary)] shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <LocateFixed className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
            <span className="text-[10px] font-black text-[var(--text-dim)] tracking-wide">Near You</span>
          </div>
          {nearestStop && (
            <p className="text-[9px] text-[var(--text-muted)] font-bold mt-0.5 leading-tight">
              {nearestStop}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors shrink-0 mt-0.5"
          aria-label="Close nearby panel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {routes.length === 0 ? (
        <p className="px-4 py-3 text-[11px] text-[var(--text-muted)] font-bold">
          No routes within 500 m
        </p>
      ) : (
        <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
          {routes.map(r => (
            <button
              key={r.rKey}
              onClick={() => setSelectedRoute(r.rKey)}
              className={LIST_ROW}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: getTierColor(r.tier) }}
                />
                <span className="text-[11px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                  {r.routeShortName}
                </span>
                <span className="text-[10px] font-bold text-[var(--text-muted)] truncate">
                  {r.routeLongName || r.agencyName}
                </span>
              </div>
              {r.headway != null && (
                <span className="text-[10px] font-bold text-[var(--text-muted)] whitespace-nowrap shrink-0 ml-2">
                  {fmtHeadway(r.headway)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
