import React from 'react';
import { X, LocateFixed } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { fmtHeadway, titleCase } from '../../utils/format';
import type { NearbyRoute } from '../../hooks/useNearbyRoutes';
import { FLOATING_CARD, PANEL_ENTER, PANEL_Z_INDEX } from '../../styles';

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
      className={`w-56 max-h-72 flex flex-col ${FLOATING_CARD} ${PANEL_ENTER}`}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <LocateFixed className="w-3 h-3 text-[var(--accent)]" />
          <span className="text-[10px] font-black text-[var(--accent)] tracking-wide">Near You</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-full transition-colors"
          aria-label="Close nearby panel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {routes.length === 0 ? (
        <p className="px-4 pb-4 text-[11px] text-[var(--text-muted)] font-bold">
          No routes within 500 m
        </p>
      ) : (
        <div className="overflow-y-auto px-4 pb-3.5 space-y-2 custom-scrollbar flex-1 min-h-0">
          {routes.map(r => (
            <div key={r.rKey} className="flex items-center gap-2">
              <button
                onClick={() => setSelectedRoute(r.rKey)}
                className="font-black text-[11px] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors shrink-0 leading-none"
              >
                {r.routeShortName}
              </button>
              <span className="text-[10px] font-bold text-[var(--text-muted)] truncate flex-1 min-w-0">
                {r.agencyName}
              </span>
              {r.headway != null ? (
                <span className="flex items-center gap-1 shrink-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: getTierColor(r.tier) }}
                  />
                  <span className="text-[10px] font-bold text-[var(--text-muted)] whitespace-nowrap">
                    {fmtHeadway(r.headway)}
                  </span>
                </span>
              ) : (
                <span className="text-[10px] font-bold text-[var(--text-dim)] shrink-0">—</span>
              )}
            </div>
          ))}
          <div className="pt-1 border-t border-[var(--border-primary)] opacity-50">
            <p className="text-[9px] font-bold text-[var(--text-dim)]">
              nearest stop: {routes.length > 0 ? `${titleCase(routes[0].nearestStopName)} · ${fmtDist(routes[0].distanceMeters)}` : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
