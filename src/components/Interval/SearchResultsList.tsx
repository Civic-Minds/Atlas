import React from 'react';
import { PANEL_SECTION_HEAD, LIST_ROW_PRIMARY, LIST_ROW_DIM, SELECTION_ACTIVE, SELECTION_ACTIVE_TEXT } from '../../styles';
import type { AgencySearchGroup } from '../../utils/agencySearch';
import type { RouteSearchResult, StopSearchResult } from '../../utils/searchResults';
import RouteListRow from '../RouteListRow';
import { routeRowLabels, routeRowRight } from './SearchSuggestionsPanel';
import { splitRouteKey } from '../../utils/routeKey';
import { agencyDisplayParts, shortenAgencyName, titleCase } from '../../utils/format';
import type { RouteListDisplay } from '../../utils/effectiveHeadway';
import ListRow from '../ui/ListRow';
import type { AreaSearchResult } from '../../../shared/areaSearch';
import { plural } from '../../../shared/overflowText';

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
  /** Metro areas matching the query; selecting one zooms the map to it. */
  areaResults?: AreaSearchResult[];
  onSelectArea?: (area: AreaSearchResult) => void;
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
  displayForRouteKey: (key: string) => RouteListDisplay;
  /** Highlight the hovered result's route on the map (null on leave). */
  onRouteHover?: (key: string | null) => void;
  hasMoreResults?: boolean;
  onShowMoreResults?: () => void;
}

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  query,
  areaResults = [],
  onSelectArea,
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
  displayForRouteKey,
  onRouteHover,
  hasMoreResults = false,
  onShowMoreResults,
}) => {
  const areaBlock = areaResults.length > 0 && onSelectArea ? (
    <SearchSplitList
      headLabel={`Areas · ${areaResults.length} ${plural(areaResults.length, 'match', 'matches')}`}
      inView={areaResults}
      elsewhere={[]}
      itemKey={(a: AreaSearchResult) => a.slug}
      renderItem={(a: AreaSearchResult) => (
        <RouteListRow
          shortName={a.name}
          variant="spaced"
          onClick={() => {
            saveRecentSearch(query);
            setQuery('');
            setSearchFocused?.(false);
            onSelectArea(a);
          }}
          right={(
            <span className={`${LIST_ROW_DIM} shrink-0 ml-2 text-right`}>
              {a.agencyCount} {plural(a.agencyCount, 'agency', 'agencies')}
            </span>
          )}
        />
      )}
    />
  ) : null;

  const agencyBlock = displayAgencyGroups.length > 0 && setSelectedAgencySlug ? (
    <SearchSplitList
      headLabel={agencyResultsHeadLabel}
      inView={agencySections.inView}
      elsewhere={agencySections.elsewhere}
      itemKey={(g: AgencySearchGroup) => g.key}
      renderItem={(g: AgencySearchGroup) => {
        const { primary, secondary } = agencyDisplayParts(g.name, g.cities, g.displayArea);
        return (
          <RouteListRow
            shortName={primary}
            variant="spaced"
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
        const labels = routeRowLabels({ shortName: r.routeShortName ?? '', longName: r.routeLongName, routeType: r.routeType, agencySlug: splitRouteKey(r.key).agencySlug, agencyName: r.agencyName });
        const name = r.variantCount && r.variantCount > 1
          ? `${labels.name ? `${labels.name} · ` : ''}${r.variantCount} variants`
          : labels.name;
        return (
          <RouteListRow
            shortName={labels.shortName}
            name={name}
            stacked
            selected={selectedRoute === r.key}
            variant="spaced"
            onHoverChange={onRouteHover ? (h => onRouteHover(h ? r.key : null)) : undefined}
            onClick={() => {
              onRouteHover?.(null);
              saveRecentSearch(query);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedRoute(selectedRoute === r.key ? null : r.key);
            }}
            right={(() => {
              const display = displayForRouteKey(r.key);
              return routeRowRight(r.agencyName || '', display.headway, true, display.limited, display.sharedHeadway, display.noRegular);
            })()}
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
          <ListRow
            variant="spaced"
            selected={selectedStop === s.key}
            className="items-start gap-3"
            onClick={() => {
              saveRecentSearch(query);
              setQuery('');
              setSearchFocused?.(false);
              setSelectedStop(s.key);
            }}
          >
            <div className="min-w-0 flex-1">
              <p className={`${LIST_ROW_PRIMARY} line-clamp-2 leading-snug ${selectedStop === s.key ? SELECTION_ACTIVE_TEXT : ''} break-words`} title={name}>{name}</p>
              {s.stopCode && <p className={`${LIST_ROW_DIM} truncate mt-0.5`}>Stop {s.stopCode}</p>}
            </div>
            <div className="flex flex-col items-end text-right ml-2 shrink-0 min-w-0 max-w-[34%]">
              {s.routes.length > 0 && (
                <span className="text-xs font-bold text-[var(--text-secondary)] truncate max-w-full">
                  {s.routes.length === 1 ? `Route ${s.routes[0]}` : `Routes ${s.routes.join(', ')}`}
                </span>
              )}
              <span className="text-xs font-black text-[var(--text-dim)] truncate max-w-full">
                {shortenAgencyName(s.agencyName || '')}
              </span>
            </div>
          </ListRow>
        );
      }}
    />
  ) : null;

  const noResults =
    !areaBlock &&
    displayAgencyGroups.length === 0 &&
    displayRouteResults.length === 0 &&
    displayStopResults.length === 0;

  return (
    <div className="-mx-4 mb-4 flex flex-col gap-5">
      {noResults ? (
        <div className="px-4 text-xs font-bold text-[var(--text-dim)] py-2">
          No matches found.
        </div>
      ) : routesFirst ? (
        <>
          {areaBlock}
          {routeBlock && <div className={areaBlock ? 'pt-3' : undefined}>{routeBlock}</div>}
          {stopBlock && <div className="pt-3">{stopBlock}</div>}
          {agencyBlock && <div className="pt-3">{agencyBlock}</div>}
        </>
      ) : (
        <>
          {areaBlock}
          {agencyBlock && <div className={areaBlock ? 'pt-3' : undefined}>{agencyBlock}</div>}
          {routeBlock && <div className="pt-3">{routeBlock}</div>}
          {stopBlock && <div className="pt-3">{stopBlock}</div>}
        </>
      )}
      {hasMoreResults && onShowMoreResults && (
        <button
          type="button"
          onClick={onShowMoreResults}
          className="mx-4 mt-2 rounded-lg bg-[var(--bg-btn-hover)] px-3 py-2 text-xs font-black text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
        >
          Show more results
        </button>
      )}
    </div>
  );
};
