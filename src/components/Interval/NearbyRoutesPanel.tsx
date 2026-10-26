import React, { forwardRef } from 'react';
import { titleCase } from '../../utils/format';
import { HeadwayBadge, LimitedBadge } from './cardUi';
import { headwayEveryRange } from '../../utils/headwayText';
import { NO_REGULAR_SERVICE_SHORT_LABEL } from '../../utils/effectiveHeadway';
import type { NearbyRoute } from '../../hooks/useNearbyRoutes';
import { PANEL_TITLE, sidebarFrameStyle } from '../../styles';
import Panel, { PanelBody, PanelTitleBar } from '../ui/Panel';
import ListRow from '../ui/ListRow';
import { ROUTE_ROW_NAME } from '../RouteRowName';
import PanelEmpty from '../ui/PanelEmpty';
import { loadingText } from '../../content/stateCopy';

interface NearbyRoutesPanelProps {
  routes: NearbyRoute[];
  loading?: boolean;
  setSelectedRoute: (key: string | null) => void;
  sidebarLeft?: number;
  /** The search bar's width on desktop, so the card lines up with it like every other card. */
  searchBarWidth?: number;
}

function fmtDist(m: number): string {
  return m < 100 ? `${Math.round(m)} m` : `${Math.round(m / 10) * 10} m`;
}

export const NearbyRoutesPanel = forwardRef<HTMLDivElement, NearbyRoutesPanelProps>(function NearbyRoutesPanel({
  routes,
  loading = false,
  setSelectedRoute,
  sidebarLeft,
  searchBarWidth,
}, ref) {
  return (
    // The left card slot at the shared card width, where the in-view lists open (CIV-930).
    <Panel
      sidebar
      enter
      ref={ref}
      style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}
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
              variant="spaced"
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
                  {/* The list rule (CIV-928): the name after a number is the light weight, in its own colour. */}
                  <span className={r.displayShortName
                    ? `flex-auto text-xs leading-snug ${ROUTE_ROW_NAME}`
                    : 'flex-auto text-xs leading-snug font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors'}
                    title={r.routeLongName || r.agencyName}>
                    {r.routeLongName || r.agencyName}
                  </span>
                  {/* The frequency as every other route row shows it: the shared badge with its tier dot, kept on the right
                      even when a long name pushes it to its own line. */}
                  {r.headway != null ? (
                    <HeadwayBadge
                      headway={r.headway}
                      label={r.sharedHeadway != null ? headwayEveryRange(r.sharedHeadway, r.headway) : undefined}
                      className="ml-auto"
                    />
                  ) : (r.limited || r.noRegular) ? (
                    <LimitedBadge label={r.noRegular ? NO_REGULAR_SERVICE_SHORT_LABEL : 'limited'} className="ml-auto" />
                  ) : (
                    // No frequency and no words: the grey dot alone, as the row showed before the shared badge.
                    <LimitedBadge className="ml-auto" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-dim)] font-medium truncate leading-tight">
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
