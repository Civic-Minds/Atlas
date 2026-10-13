import React from 'react';
import type { Agency } from '../../App';
import {
  PANEL_SECTION_HEAD,
  LIST_ROW_DIM,
} from '../../styles';
import Panel from '../ui/Panel';
import {
  titleCase,
  shortenAgencyName,
  cleanRouteShortName,
  routeListCompanionName,
  shouldHideNumericRouteShortName,
} from '../../utils/format';
import RouteListRow from '../RouteListRow';
import type { RouteListDisplay } from '../../utils/effectiveHeadway';
import { headwayEvery } from '../../utils/headwayText';
import ListRow from '../ui/ListRow';

// Reusable/helper interfaces for route snippets
export interface RecentRoute {
  key: string;
  shortName: string;
  longName: string | null;
  agencyName: string;
  headway?: number | null;
}

export interface SuggestedRoute {
  key: string;
  shortName: string;
  longName: string | null;
  agencyName: string;
  headway?: number | null;
  limited?: boolean;
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

export function routeRowLabels(shortName: string | null | undefined, longName: string | null) {
  const blankShortName = !shortName || !shortName.trim();
  const hiddenShortName = blankShortName || shouldHideNumericRouteShortName(shortName, longName);
  if (hiddenShortName && longName) {
    return { shortName: titleCase(longName), name: undefined };
  }
  const displayShortName = hiddenShortName ? '' : shortName;
  const short = cleanRouteShortName(displayShortName);
  const companion = routeListCompanionName(longName ? titleCase(longName) : null, displayShortName ?? '');
  return {
    shortName: titleCase(short),
    name: companion ? titleCase(companion) : undefined,
  };
}

export function routeRowRight(agencyName: string, headway?: number | null, stacked = false, limited = false) {
  const agency = shortenAgencyName(agencyName);
  const layout = stacked
    ? 'block max-w-full truncate mt-1 ml-0 text-left'
    : 'min-w-0 max-w-[34%] truncate shrink-0 ml-2 text-right';
  if (headway != null && headway < 999) {
    return (
      <span className={`${LIST_ROW_DIM} ${layout} whitespace-nowrap`}>
        {agency}
        <span className="text-[var(--text-dim)] font-normal"> · </span>
        {headwayEvery(headway)}
      </span>
    );
  }
  if (limited) {
    return (
      <span className={`${LIST_ROW_DIM} ${layout} whitespace-nowrap`}>
        {agency}
        <span className="text-[var(--text-dim)] font-normal"> · </span>
        limited
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
                  const labels = routeRowLabels(r.shortName, r.longName);
                  return (
                    <RouteListRow
                      key={r.key}
                      shortName={labels.shortName}
                      name={labels.name}
                      right={(() => {
                        const display = displayForRouteKey(r.key);
                        return routeRowRight(r.agencyName, display.headway, true, display.limited);
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
                  const labels = routeRowLabels(r.shortName, r.longName);
                  return (
                    <RouteListRow
                      key={r.key}
                      shortName={labels.shortName}
                      name={labels.name}
                      right={routeRowRight(r.agencyName, r.headway, true, r.limited)}
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
