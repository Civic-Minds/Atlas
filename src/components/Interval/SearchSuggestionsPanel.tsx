import React from 'react';
import type { Agency } from '../../App';
import {
  PANEL_SECTION_HEAD,
  LIST_ROW_DIM,
} from '../../styles';
import Panel from '../ui/Panel';
import { shortenAgencyName, routeLabels } from '../../utils/format';
import { splitRouteKey } from '../../utils/routeKey';
import RouteListRow from '../RouteListRow';
import { NO_REGULAR_SERVICE_SHORT_LABEL, routeListHeadwayText, type RouteListDisplay } from '../../utils/effectiveHeadway';
import ListRow from '../ui/ListRow';

// Reusable/helper interfaces for route snippets
export interface RecentRoute {
  key: string;
  /** The feed's raw route_type, when known (lets a numeric id hide the same way as on the agency page). */
  routeType?: number;
  shortName: string;
  longName: string | null;
  agencyName: string;
  headway?: number | null;
}

export interface SuggestedRoute {
  key: string;
  routeType?: number;
  shortName: string;
  longName: string | null;
  agencyName: string;
  headway?: number | null;
  limited?: boolean;
  noRegular?: boolean;
  /** Lower end of a shared-stretch range (display only). */
  sharedHeadway?: number;
}

interface SearchSuggestionsPanelProps {
  recentSearches: string[];
  clearRecentSearches: () => void;
  setQuery: (q: string) => void;
  recentlyViewed: RecentRoute[];
  suggestedRoutes: SuggestedRoute[];
  pickRoute: (key: string) => void;
  displayForRouteKey: (key: string) => RouteListDisplay;
}

/** A route's bold and lighter parts for a list row. Same cleaned names as the card title (see shared/routeDisplay.ts). */
export function routeRowLabels(route: Parameters<typeof routeLabels>[0]) {
  const { primary, secondary } = routeLabels(route);
  return { shortName: primary, name: secondary };
}

export function routeRowRight(agencyName: string, headway?: number | null, stacked = false, limited = false, sharedHeadway?: number | null, noRegular = false) {
  const agency = shortenAgencyName(agencyName);
  const layout = stacked
    ? 'block max-w-full truncate mt-1 ml-0 text-left'
    : 'min-w-0 max-w-[34%] truncate shrink-0 ml-2 text-right';
  if (headway != null && headway < 999) {
    return (
      <span className={`${LIST_ROW_DIM} ${layout} whitespace-nowrap`}>
        {agency}
        <span className="text-[var(--text-dim)] font-normal"> · </span>
        {routeListHeadwayText(headway, sharedHeadway)}
      </span>
    );
  }
  if (limited || noRegular) {
    return (
      <span className={`${LIST_ROW_DIM} ${layout} whitespace-nowrap`}>
        {agency}
        <span className="text-[var(--text-dim)] font-normal"> · </span>
        {noRegular ? NO_REGULAR_SERVICE_SHORT_LABEL : 'limited'}
      </span>
    );
  }
  return (
    <span className={`${LIST_ROW_DIM} ${layout}`}>{agency}</span>
  );
}

export const SearchSuggestionsPanel: React.FC<SearchSuggestionsPanelProps> = ({
  recentSearches,
  clearRecentSearches,
  setQuery,
  recentlyViewed,
  suggestedRoutes,
  pickRoute,
  displayForRouteKey,
}) => {
  return (
    <Panel className="shrink-0">
      {recentSearches.length > 0 && (
        <>
          <div className={`flex items-center justify-between ${PANEL_SECTION_HEAD}`}>
            <span>Recent searches</span>
            <button
              onClick={clearRecentSearches}
              className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              Clear
            </button>
          </div>
          <div>
            {recentSearches.map((s, i) => (
              <ListRow
                key={i}
                onClick={() => setQuery(s)}
                className="border-b-0"
              >
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight">{s}</span>
                <span className="text-xs text-[var(--text-dim)] font-mono">↵</span>
              </ListRow>
            ))}
          </div>
        </>
      )}

      <>
          {recentlyViewed.length > 0 && (
            <>
              {recentSearches.length > 0 && <div className="mx-4 border-t border-[var(--border-primary)]" />}
              <div className={PANEL_SECTION_HEAD}>
                Recent routes
              </div>
              <div>
                {recentlyViewed.map((r) => {
                  const labels = routeRowLabels({ shortName: r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: splitRouteKey(r.key).agencySlug, agencyName: r.agencyName });
                  return (
                    <RouteListRow
                      key={r.key}
                      shortName={labels.shortName}
                      name={labels.name}
                      right={(() => {
                        const display = displayForRouteKey(r.key);
                        return routeRowRight(r.agencyName, display.headway, true, display.limited, display.sharedHeadway, display.noRegular);
                      })()}
                      stacked
                      onClick={() => pickRoute(r.key)}
                      className="border-b-0"
                    />
                  );
                })}
              </div>
            </>
          )}
          {suggestedRoutes.length > 0 && (
            <>
              {(recentSearches.length > 0 || recentlyViewed.length > 0) && <div className="mx-4 border-t border-[var(--border-primary)]" />}
              <div className={PANEL_SECTION_HEAD}>
                Suggested routes
              </div>
              <div>
                {suggestedRoutes.map((r) => {
                  const labels = routeRowLabels({ shortName: r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: splitRouteKey(r.key).agencySlug, agencyName: r.agencyName });
                  return (
                    <RouteListRow
                      key={r.key}
                      shortName={labels.shortName}
                      name={labels.name}
                      right={routeRowRight(r.agencyName, r.headway, true, r.limited, r.sharedHeadway, r.noRegular)}
                      stacked
                      onClick={() => pickRoute(r.key)}
                      className="border-b-0"
                    />
                  );
                })}
              </div>
            </>
          )}
          {recentSearches.length === 0 && recentlyViewed.length === 0 && suggestedRoutes.length === 0 && (
            <p className="text-xs text-[var(--text-dim)] italic px-4 py-3">No route suggestions in this area.</p>
          )}
      </>
    </Panel>
  );
};
