import React from 'react';
import { PANEL_SECTION_HEAD, PANEL_SEARCH_SUBHEAD, LIST_ROW_DIM } from '../../styles';
import type { AgencySearchGroup } from '../../utils/agencySearch';
import type { RouteSearchResult } from '../../utils/searchResults';
import RouteListRow from '../RouteListRow';
import { routeRowLabels, routeRowRight } from './SearchSuggestionsPanel';

interface SearchSplitListProps<T> {
  headLabel: string;
  inView: T[];
  elsewhere: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
}

export function SearchSplitList<T>({
  headLabel,
  inView,
  elsewhere,
  itemKey,
  renderItem,
}: SearchSplitListProps<T>) {
  if (inView.length === 0 && elsewhere.length === 0) return null;
  const split = inView.length > 0 && elsewhere.length > 0;
  return (
    <div>
      <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)]`}>{headLabel}</div>
      {split && <div className={`${PANEL_SEARCH_SUBHEAD} pt-1`}>In this area</div>}
      {inView.map(item => <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>)}
      {split && <div className={PANEL_SEARCH_SUBHEAD}>Elsewhere</div>}
      {elsewhere.map(item => <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>)}
    </div>
  );
}

interface SearchResultsListProps {
  query: string;
  displayAgencyGroups: AgencySearchGroup[];
  displayRouteResults: RouteSearchResult[];
  agencySections: { inView: AgencySearchGroup[]; elsewhere: AgencySearchGroup[] };
  routeSections: { inView: RouteSearchResult[]; elsewhere: RouteSearchResult[] };
  routesFirst: boolean;
  agencyResultsHeadLabel: string;
  routeResultsHeadLabel: string;
  matchedAgencyGroups: AgencySearchGroup[];
  selectedRoute: string | null;
  setSelectedRoute: (route: string | null) => void;
  setSelectedAgencySlug?: (slug: string | null) => void;
  setQuery: (q: string) => void;
  setSearchFocused?: (focused: boolean) => void;
  saveRecentSearch: (q: string) => void;
  headwayForRouteKey: (key: string) => number | null;
}

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  query,
  displayAgencyGroups,
  displayRouteResults,
  agencySections,
  routeSections,
  routesFirst,
  agencyResultsHeadLabel,
  routeResultsHeadLabel,
  matchedAgencyGroups,
  selectedRoute,
  setSelectedRoute,
  setSelectedAgencySlug,
  setQuery,
  setSearchFocused,
  saveRecentSearch,
  headwayForRouteKey,
}) => {
  const agencyBlock = displayAgencyGroups.length > 0 && setSelectedAgencySlug ? (
    <SearchSplitList
      headLabel={agencyResultsHeadLabel}
      inView={agencySections.inView}
      elsewhere={agencySections.elsewhere}
      itemKey={(g: AgencySearchGroup) => g.key}
      renderItem={(g: AgencySearchGroup) => (
        <RouteListRow
          shortName={g.name}
          onClick={() => {
            setSelectedAgencySlug?.(g.slug);
            setQuery('');
            setSearchFocused?.(false);
          }}
          right={
            <span className={`${LIST_ROW_DIM} shrink-0 ml-2 text-right`}>
              {g.region}
            </span>
          }
        />
      )}
    />
  ) : null;

  const routeBlock = displayRouteResults.length > 0 ? (
    <SearchSplitList
      headLabel={routeResultsHeadLabel}
      inView={routeSections.inView}
      elsewhere={routeSections.elsewhere}
      itemKey={(r: RouteSearchResult) => r.key}
      renderItem={(r: RouteSearchResult) => {
        const labels = routeRowLabels(r.routeShortName ?? '', r.routeLongName);
        return (
          <RouteListRow
            shortName={labels.shortName}
            name={labels.name}
            selected={selectedRoute === r.key}
            onClick={() => {
              saveRecentSearch(query);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedRoute(selectedRoute === r.key ? null : r.key);
            }}
            right={routeRowRight(r.agencyName || '', headwayForRouteKey(r.key))}
          />
        );
      }}
    />
  ) : matchedAgencyGroups.length === 0 ? (
    <div className="px-4 text-[10px] font-bold text-[var(--text-dim)] py-2">
      No routes match your search.
    </div>
  ) : null;

  return (
    <div className="-mx-4 mb-4 space-y-4">
      {routesFirst ? (
        <>{routeBlock}{agencyBlock}</>
      ) : (
        <>{agencyBlock}{routeBlock}</>
      )}
    </div>
  );
};
