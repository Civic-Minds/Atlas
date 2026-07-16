import React from 'react';
import { PANEL_SECTION_HEAD, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM } from '../../styles';
import type { AgencySearchGroup } from '../../utils/agencySearch';
import type { RouteSearchResult, StopSearchResult } from '../../utils/searchResults';
import RouteListRow from '../RouteListRow';
import { routeRowLabels, routeRowRight } from './SearchSuggestionsPanel';
import { agencyDisplayParts, shortenAgencyName, titleCase } from '../../utils/format';

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
  const items = [...inView, ...elsewhere];
  return (
    <div className="flex flex-col">
      <div className={`${PANEL_SECTION_HEAD} mb-1`}>{headLabel}</div>
      {items.map(item => <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>)}
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
  hasMoreResults?: boolean;
  onShowMoreResults?: () => void;
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
  hasMoreResults = false,
  onShowMoreResults,
}) => {
  const agencyBlock = displayAgencyGroups.length > 0 && setSelectedAgencySlug ? (
    <SearchSplitList
      headLabel={agencyResultsHeadLabel}
      inView={agencySections.inView}
      elsewhere={agencySections.elsewhere}
      itemKey={(g: AgencySearchGroup) => g.key}
      renderItem={(g: AgencySearchGroup) => {
        const { primary, secondary } = agencyDisplayParts(g.name);
        return (
          <RouteListRow
            shortName={primary}
            className="border-b-0"
            onClick={() => {
              setSelectedAgencySlug?.(g.slug);
              setQuery('');
              setSearchFocused?.(false);
            }}
            right={secondary && (
              <span className={`${LIST_ROW_DIM} shrink-0 ml-2 text-right`}>
                {secondary}
              </span>
            )}
          />
        );
      }}
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
            stacked
            selected={selectedRoute === r.key}
            className="border-b-0"
            onHoverChange={onRouteHover ? (h => onRouteHover(h ? r.key : null)) : undefined}
            onClick={() => {
              onRouteHover?.(null);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedRoute(selectedRoute === r.key ? null : r.key);
            }}
            right={routeRowRight(r.agencyName || '', headwayForRouteKey(r.key), true)}
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
          <button
            type="button"
            className={`${LIST_ROW} border-b-0 items-start gap-3 ${selectedStop === s.key ? 'bg-[var(--accent-bg)]' : ''}`}
            onClick={() => {
              saveRecentSearch(query);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedStop(s.key);
            }}
          >
            <div className="min-w-0 flex-1">
              <p className={`${LIST_ROW_PRIMARY} line-clamp-2 leading-snug ${selectedStop === s.key ? 'text-[var(--accent)]' : ''}`}>{name}</p>
              {s.stopCode && <p className={`${LIST_ROW_DIM} truncate mt-0.5`}>Stop {s.stopCode}</p>}
            </div>
            <div className="flex flex-col items-end text-right ml-2 shrink-0 min-w-0 max-w-[34%]">
              {s.routes.length > 0 && (
                <span className="text-[9px] font-bold text-[var(--text-secondary)] truncate max-w-full">
                  {s.routes.length === 1 ? `Route ${s.routes[0]}` : `Routes ${s.routes.join(', ')}`}
                </span>
              )}
              <span className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-wider truncate max-w-full">
                {shortenAgencyName(s.agencyName || '')}
              </span>
            </div>
          </button>
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
          {stopBlock && <div className="pt-3">{stopBlock}</div>}
          {agencyBlock && <div className="pt-3">{agencyBlock}</div>}
        </>
      ) : (
        <>
          {agencyBlock}
          {routeBlock && <div className="pt-3">{routeBlock}</div>}
          {stopBlock && <div className="pt-3">{stopBlock}</div>}
        </>
      )}
      {hasMoreResults && onShowMoreResults && (
        <button
          type="button"
          onClick={onShowMoreResults}
          className="mx-4 mt-2 rounded-lg bg-[var(--bg-btn-hover)] px-3 py-2 text-[10px] font-black text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
        >
          Show more results
        </button>
      )}
    </div>
  );
};
