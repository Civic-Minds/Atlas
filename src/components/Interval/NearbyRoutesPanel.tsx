import React, { forwardRef } from 'react';
import { LocateFixed } from 'lucide-react';
import { headwayToTierColor } from '../../utils/colors';
import { fmtHeadway, titleCase } from '../../utils/format';
import type { NearbyRoute } from '../../hooks/useNearbyRoutes';
import { FLOATING_CARD, PANEL_ENTER, PANEL_Z_INDEX, LIST_ROW, PANEL_TITLE_BAR, PANEL_TITLE, PANEL_BODY, PANEL_EMPTY } from '../../styles';

interface NearbyRoutesPanelProps {
  routes: NearbyRoute[];
  loading?: boolean;
  setSelectedRoute: (key: string | null) => void;
}

function fmtDist(m: number): string {
  return m < 100 ? `${Math.round(m)} m` : `${Math.round(m / 10) * 10} m`;
}

export const NearbyRoutesPanel = forwardRef<HTMLDivElement, NearbyRoutesPanelProps>(function NearbyRoutesPanel({
  routes,
  loading = false,
  setSelectedRoute,
}, ref) {
  return (
    <div
      ref={ref}
      // 136px clears the stacked zoom controls (bottom-[59px], 64px tall → top edge at 123)
      // plus the geolocate button below them — this used to sit at bottom:72, overlapping
      // the zoom-in button by ~50px.
      style={{ position: 'absolute', bottom: 136, right: 12, zIndex: PANEL_Z_INDEX }}
      className={`w-64 max-h-72 flex flex-col ${FLOATING_CARD} ${PANEL_ENTER}`}
    >
      <div className={PANEL_TITLE_BAR}>
        <LocateFixed className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
        <span className={PANEL_TITLE}>Near You</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-[10px] font-bold text-[var(--text-muted)]">Loading nearby…</span>
        </div>
      ) : routes.length === 0 ? (
        <p className={PANEL_EMPTY}>
          No routes within 500 m
        </p>
      ) : (
        <div className={PANEL_BODY}>
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
                    style={{ background: headwayToTierColor(r.headway) }}
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
});
