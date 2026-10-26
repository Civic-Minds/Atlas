import React, { forwardRef } from 'react';
import { titleCase } from '../../utils/format';
import { HeadwayBadge, LimitedBadge } from './cardUi';
import { headwayEveryRange } from '../../utils/headwayText';
import { NO_REGULAR_SERVICE_SHORT_LABEL } from '../../utils/effectiveHeadway';
import type { NearbyRoute } from '../../hooks/useNearbyRoutes';
import { NEARBY_PANEL_SLOT, PANEL_TITLE } from '../../styles';
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
      className={NEARBY_PANEL_SLOT}
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
                <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                  {r.displayShortName ? (
                    <span className="text-xs leading-snug font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                      {r.displayShortName}
                    </span>
                  ) : null}
                  {/* The name takes the row's free width and wraps between words, like the route card's direction rows;
                      it sizes to its text and never splits a word (its narrowest is its longest word), so the badge sits beside a name that fits and moves to the next line only when it can't. */}
                  <span className={r.displayShortName
                    ? 'flex-auto text-xs leading-snug font-bold text-[var(--text-muted)]'
                    : 'flex-auto text-xs leading-snug font-black text-[var(--text-primary)]'}
                    title={r.routeLongName || r.agencyName}>
                    {r.routeLongName || r.agencyName}
                  </span>
                  {/* The frequency as every other route row shows it: the shared badge with its tier dot. */}
                  {r.headway != null ? (
                    <HeadwayBadge
                      headway={r.headway}
                      label={r.sharedHeadway != null ? headwayEveryRange(r.sharedHeadway, r.headway) : undefined}
                    />
                  ) : (r.limited || r.noRegular) ? (
                    <LimitedBadge label={r.noRegular ? NO_REGULAR_SERVICE_SHORT_LABEL : 'limited'} />
                  ) : (
                    // No frequency and no words: the grey dot alone, as the row showed before the shared badge.
                    <LimitedBadge />
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
