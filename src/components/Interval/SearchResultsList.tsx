import React from 'react';
import { PANEL_SECTION_HEAD, PANEL_SEARCH_SUBHEAD, LIST_ROW_DIM } from '../../styles';
import type { AgencySearchGroup } from '../../utils/agencySearch';
import type { RouteSearchResult, StopSearchResult } from '../../utils/searchResults';
import RouteListRow from '../RouteListRow';
import { routeRowLabels, routeRowRight } from './SearchSuggestionsPanel';
import { shortenAgencyName, titleCase } from '../../utils/format';

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
    <div className="flex flex-col">
      <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)] mb-1`}>{headLabel}</div>
      {split && <div className={`${PANEL_SEARCH_SUBHEAD} pt-2 pb-1`}>In this area</div>}
      {inView.map(item => <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>)}
      {split && <div className={`${PANEL_SEARCH_SUBHEAD} pt-4 pb-1`}>Elsewhere</div>}
      {elsewhere.map(item => <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>)}
    </div>
  );
}

interface SearchResultsListProps {
  query: string;
  displayAgencyGroups: AgencySearchGroup[];
  displayRouteResults: RouteSearchResult[];
  displayStopResults?: StopSearchResult[];
  agencySections: { inView: AgencySearchGroup[]; elsewhere: AgencySearchGroup[] };
  routeSections: { inView: RouteSearchResult[]; elsewhere: RouteSearchResult[] };
  stopSections?: { inView: StopSearchResult[]; elsewhere: StopSearchResult[] };
  routesFirst: boolean;
  agencyResultsHeadLabel: string;
  routeResultsHeadLabel: string;
  stopResultsHeadLabel?: string;
  matchedAgencyGroups: AgencySearchGroup[];
  selectedRoute: string | null;
  setSelectedRoute: (route: string | null) => void;
  selectedStop?: string | null;
  setSelectedStop?: (stop: string | null) => void;
  setSelectedAgencySlug?: (slug: string | null) => void;
  setQuery: (q: string) => void;
  setSearchFocused?: (focused: boolean) => void;
  saveRecentSearch: (q: string) => void;
  headwayForRouteKey: (key: string) => number | null;
  /** Highlight the hovered result's route on the map (null on leave). */
  onRouteHover?: (key: string | null) => void;
}

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  query,
  displayAgencyGroups,
  displayRouteResults,
  displayStopResults = [],
  agencySections,
  routeSections,
  stopSections,
  routesFirst,
  agencyResultsHeadLabel,
  routeResultsHeadLabel,
  stopResultsHeadLabel = '',
  matchedAgencyGroups,
  selectedRoute,
  setSelectedRoute,
  selectedStop = null,
  setSelectedStop,
  setSelectedAgencySlug,
  setQuery,
  setSearchFocused,
  saveRecentSearch,
  headwayForRouteKey,
  onRouteHover,
}) => {
  const agencyBlock = displayAgencyGroups.length > 0 && setSelectedAgencySlug ? (
    <SearchSplitList
      headLabel={agencyResultsHeadLabel}
      inView={agencySections.inView}
      elsewhere={agencySections.elsewhere}
      itemKey={(g: AgencySearchGroup) => g.key}
      renderItem={(g: AgencySearchGroup) => (
        <RouteListRow
          shortName={shortenAgencyName(g.name)}
          className="border-b-0"
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
        const name = r.variantCount && r.variantCount > 1
          ? `${labels.name ? `${labels.name} · ` : ''}${r.variantCount} variants`
          : labels.name;
        return (
          <RouteListRow
            shortName={labels.shortName}
            name={name}
            selected={selectedRoute === r.key}
            className="border-b-0"
            onHoverChange={onRouteHover ? (h => onRouteHover(h ? r.key : null)) : undefined}
            onClick={() => {
              onRouteHover?.(null);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedRoute(selectedRoute === r.key ? null : r.key);
            }}
            right={routeRowRight(r.agencyName || '', headwayForRouteKey(r.key))}
          />
        );
      }}
    />
  ) : null;

  const stopBlock = displayStopResults.length > 0 && stopSections && setSelectedStop ? (
    <SearchSplitList
      headLabel={stopResultsHeadLabel}
      inView={stopSections.inView}
      elsewhere={stopSections.elsewhere}
      itemKey={(s: StopSearchResult) => s.key}
      renderItem={(s: StopSearchResult) => {
        const name = `${titleCase(s.stopName)}${s.direction ? ` — ${s.direction}` : ''}`;
        return (
          <RouteListRow
            shortName={s.stopCode || name}
            name={name}
            selected={selectedStop === s.key}
            className="border-b-0"
            onClick={() => {
              saveRecentSearch(query);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedStop(s.key);
            }}
            right={
              <div className="flex flex-col items-end text-right ml-2 shrink-0">
                {s.routes.length > 0 && (
                  <span className="text-[9px] font-bold text-[var(--text-secondary)] truncate max-w-[120px]">
                    {s.routes.join(', ')}
                  </span>
                )}
                <span className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-wider">
                  {shortenAgencyName(s.agencyName || '')}
                </span>
              </div>
            }
          />
        );
      }}
    />
  ) : null;

  const noResults =
    displayAgencyGroups.length === 0 &&
    displayRouteResults.length === 0 &&
    displayStopResults.length === 0;

  return (
    <div className="-mx-4 mb-4 flex flex-col gap-5">
      {noResults ? (
        <div className="px-4 text-[10px] font-bold text-[var(--text-dim)] py-2">
          No matches found.
        </div>
      ) : routesFirst ? (
        <>
          {routeBlock}
          {stopBlock && <div className="border-t border-[var(--border-primary)] pt-3">{stopBlock}</div>}
          {agencyBlock && <div className="border-t border-[var(--border-primary)] pt-3">{agencyBlock}</div>}
        </>
      ) : (
        <>
          {agencyBlock}
          {routeBlock && <div className="border-t border-[var(--border-primary)] pt-3">{routeBlock}</div>}
          {stopBlock && <div className="border-t border-[var(--border-primary)] pt-3">{stopBlock}</div>}
        </>
      )}
    </div>
  );
};
