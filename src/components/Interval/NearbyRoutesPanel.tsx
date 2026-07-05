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
  return (
    <div
      style={{ position: 'absolute', bottom: 72, right: 12, zIndex: PANEL_Z_INDEX }}
      className={`w-64 max-h-72 flex flex-col ${FLOATING_CARD} ${PANEL_ENTER}`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[var(--border-primary)] shrink-0">
        <div className="flex items-center gap-1.5">
          <LocateFixed className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
          <span className="text-[10px] font-black text-[var(--text-dim)] tracking-wide">Near You</span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors shrink-0"
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
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <div className="flex items-center gap-2">
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
                  {r.headway != null && (
                    <span className="text-[10px] font-bold text-[var(--text-muted)] whitespace-nowrap shrink-0 ml-auto">
                      {fmtHeadway(r.headway)}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-[var(--text-dim)] font-bold pl-3.5 truncate leading-tight">
                  {titleCase(r.nearestStopName)} · {fmtDist(r.distanceMeters)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
