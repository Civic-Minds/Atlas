import React from 'react';
import type { Agency } from '../../App';
import {
  FLOATING_CARD,
  PANEL_SECTION_HEAD,
  LIST_ROW,
  LIST_ROW_PRIMARY,
  LIST_ROW_DIM,
} from '../../styles';
import {
  titleCase,
  shortenAgencyName,
  cleanRouteShortName,
  routeListCompanionName,
} from '../../utils/format';
import RouteListRow from '../RouteListRow';

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
}

interface SearchSuggestionsPanelProps {
  recentSearches: string[];
  clearRecentSearches: () => void;
  setQuery: (q: string) => void;
  suggestedFareAgencies: Array<{ slug: string; name: string }>;
  recentlyViewed: RecentRoute[];
  suggestedRoutes: SuggestedRoute[];
  pickRoute: (key: string) => void;
  fareView: boolean;
  headwayForRouteKey: (key: string) => number | null;
}

export function routeRowLabels(shortName: string, longName: string | null) {
  const short = cleanRouteShortName(shortName);
  const companion = routeListCompanionName(longName ? titleCase(longName) : null, shortName);
  return {
    shortName: titleCase(short),
    name: companion ? titleCase(companion) : undefined,
  };
}

export function routeRowRight(agencyName: string, headway?: number | null, stacked = false) {
  const agency = shortenAgencyName(agencyName);
  const layout = stacked
    ? 'block max-w-full truncate mt-1 ml-0 text-left'
    : 'min-w-0 max-w-[34%] truncate shrink-0 ml-2 text-right';
  if (headway != null && headway < 999) {
    return (
      <span className={`${LIST_ROW_DIM} ${layout} whitespace-nowrap`}>
        {agency}
        <span className="text-[var(--text-dim)] font-normal"> · </span>
        every {headway}m
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
  suggestedFareAgencies,
  recentlyViewed,
  suggestedRoutes,
  pickRoute,
  fareView,
  headwayForRouteKey,
}) => {
  return (
    <div className={`${FLOATING_CARD} shrink-0 flex flex-col overflow-hidden`}>
      {recentSearches.length > 0 && (
        <>
          <div className={`flex items-center justify-between border-b border-[var(--border-primary)] ${PANEL_SECTION_HEAD}`}>
            <span>Recent searches</span>
            <button
              onClick={clearRecentSearches}
              className="text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              Clear
            </button>
          </div>
          <div>
            {recentSearches.map((s, i) => (
              <button
                key={i}
                onClick={() => setQuery(s)}
                className={`${LIST_ROW} border-b-0`}
              >
                <span className={LIST_ROW_PRIMARY}>{s}</span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">↵</span>
              </button>
            ))}
          </div>
        </>
      )}

      {fareView ? (
        <>
          {suggestedFareAgencies.length > 0 && (
            <>
              <div className={`${PANEL_SECTION_HEAD} ${recentSearches.length > 0 ? 'border-t border-[var(--border-primary)]' : 'border-b border-[var(--border-primary)]'}`}>
                Suggested agencies
              </div>
              <div>
                {suggestedFareAgencies.map((a) => (
                  <button
                    key={a.slug}
                    onClick={() => setQuery(a.name)}
                    className={`${LIST_ROW} border-b-0`}
                  >
                    <span className={LIST_ROW_PRIMARY}>{shortenAgencyName(a.name)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {suggestedFareAgencies.length === 0 && recentSearches.length === 0 && (
            <p className="text-[11px] text-[var(--text-dim)] italic px-4 py-3">No agencies with fare data in this area.</p>
          )}
        </>
      ) : (
        <>
          {recentlyViewed.length > 0 && (
            <>
              <div className={`${PANEL_SECTION_HEAD} ${recentSearches.length > 0 ? 'border-t border-[var(--border-primary)]' : 'border-b border-[var(--border-primary)]'}`}>
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
                      right={routeRowRight(r.agencyName, headwayForRouteKey(r.key) ?? r.headway, true)}
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
              <div className={`${PANEL_SECTION_HEAD} ${(recentSearches.length > 0 || recentlyViewed.length > 0) ? 'border-t border-[var(--border-primary)]' : 'border-b border-[var(--border-primary)]'}`}>
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
                      right={routeRowRight(r.agencyName, r.headway, true)}
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
            <p className="text-[11px] text-[var(--text-dim)] italic px-4 py-3">No route suggestions in this area.</p>
          )}
        </>
      )}
    </div>
  );
};
