import React, { forwardRef } from 'react';
import { titleCase } from '../../utils/format';
import { HeadwayBadge, LimitedBadge } from './cardUi';
import { headwayEveryRange } from '../../utils/headwayText';
import { NO_REGULAR_SERVICE_SHORT_LABEL } from '../../utils/effectiveHeadway';
import type { NearbyRoute } from '../../hooks/useNearbyRoutes';
import { PANEL_Z_INDEX, PANEL_TITLE } from '../../styles';
import Panel, { PanelBody, PanelTitleBar } from '../ui/Panel';
import ListRow from '../ui/ListRow';
import PanelEmpty from '../ui/PanelEmpty';
import { loadingText } from '../../content/stateCopy';

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
    <Panel
      enter
      ref={ref}
      // 136px clears the stacked zoom controls (bottom-[59px], 64px tall → top edge at 123)
      // plus the geolocate button below them — this used to sit at bottom:72, overlapping
      // the zoom-in button by ~50px.
      style={{ position: 'absolute', bottom: 136, right: 12, zIndex: PANEL_Z_INDEX }}
      className="w-64 max-h-[calc(100vh-152px)]"
    >
      <PanelTitleBar>
        <span className={PANEL_TITLE}>Near You</span>
      </PanelTitleBar>

      {loading ? (
        <PanelEmpty kind="loading">{loadingText('nearby routes')}</PanelEmpty>
      ) : routes.length === 0 ? (
        <PanelEmpty>No routes within 500 m</PanelEmpty>
      ) : (
        <PanelBody>
          {routes.map(r => (
            <ListRow
              key={r.rKey}
              onClick={() => setSelectedRoute(r.rKey)}
            >
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <div className="flex items-start gap-2">
                  {r.displayShortName ? (
                    <span className="text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                      {r.displayShortName}
                    </span>
                  ) : null}
                  <span className={r.displayShortName
                    ? 'min-w-0 text-xs font-bold text-[var(--text-muted)] line-clamp-2 break-words'
                    : 'min-w-0 text-xs font-black text-[var(--text-primary)] line-clamp-2 break-words'}
                    title={r.routeLongName || r.agencyName}>
                    {r.routeLongName || r.agencyName}
                  </span>
                  {/* The frequency as every other route row shows it: the shared badge with its tier dot. */}
                  {r.headway != null ? (
                    <HeadwayBadge
                      headway={r.headway}
                      label={r.sharedHeadway != null ? headwayEveryRange(r.sharedHeadway, r.headway) : undefined}
                      className="ml-auto"
                    />
                  ) : (r.limited || r.noRegular) && (
                    <LimitedBadge label={r.noRegular ? NO_REGULAR_SERVICE_SHORT_LABEL : 'limited'} className="ml-auto" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-dim)] font-bold truncate leading-tight">
                  {titleCase(r.nearestStopName)} · {fmtDist(r.distanceMeters)}
                </p>
              </div>
            </ListRow>
          ))}
        </PanelBody>
      )}
    </Panel>
  );
});
