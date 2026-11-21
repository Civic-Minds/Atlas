import { createContext, useContext, useMemo, type CSSProperties } from 'react';
import StudioPanel from '../../components/ui/WidePanel';
import { PanelBody } from '../../components/ui/Panel';
import { SearchResultsList } from '../../components/Interval/SearchResultsList';
import { routeListResults } from '../../utils/searchResults';
import { NO_MATCHING_ROUTES } from '../../content/noticeCopy';
import { countOf } from '../../../shared/overflowText';

/**
 * CIV-2001 (Ryan: "In Studio should we have the search bar too"; option 1): the main map's search box, in Studio's top bar.
 * App owns the box and its words; Studio reads them here. The results are the main map's shared list, over the open page's
 * own routes, so every result opens something the page has.
 */
export interface StudioSearchState {
  query: string;
  focused: boolean;
  setQuery: (q: string) => void;
  setFocused: (focused: boolean) => void;
}

export const STUDIO_NO_SEARCH: StudioSearchState = { query: '', focused: false, setQuery: () => {}, setFocused: () => {} };
const StudioSearchContext = createContext<StudioSearchState>(STUDIO_NO_SEARCH);
export const StudioSearchProvider = StudioSearchContext.Provider;

/** Whether the search's results take the panel's place: the box has focus and something typed, as on the main map. */
export function useStudioSearchOpen(): boolean {
  const { query, focused } = useContext(StudioSearchContext);
  return focused && query.trim() !== '';
}

/** The results panel, in the page panel's place while a search is open. */
export function StudioRouteSearch({ agencySlug, agencyName, routes, onPick, frameStyle }: {
  agencySlug: string;
  agencyName: string;
  routes: ReadonlyArray<{ route: string; longName?: string | null; routeType?: number | null }>;
  onPick: (route: string) => void;
  frameStyle: CSSProperties;
}) {
  const { query, setQuery, setFocused } = useContext(StudioSearchContext);
  const results = useMemo(() => routeListResults(routes.map(r => ({ ...r, agencySlug, agencyName })), query), [routes, agencySlug, agencyName, query]);
  // A result's key is "<agency>::<route>"; the page opens the route by its own name.
  const routeOf = useMemo(() => new Map(results.map(r => [r.key, r.key.slice(r.key.indexOf('::') + 2)])), [results]);
  return (
    <StudioPanel style={frameStyle} aria-label={query}>
      <PanelBody className="px-4 pt-4">
        <SearchResultsList
          query={query}
          displayAgencyGroups={[]}
          displayRouteResults={results}
          agencySections={{ inView: [], elsewhere: [] }}
          routeSections={{ inView: results, elsewhere: [] }}
          routesFirst
          agencyResultsHeadLabel=""
          routeResultsHeadLabel={`Routes · ${countOf(results.length, 'match', 'matches')}`}
          matchedAgencyGroups={[]}
          selectedRoute={null}
          setSelectedRoute={key => { const r = key && routeOf.get(key); if (r) onPick(r); }}
          setQuery={setQuery}
          setSearchFocused={setFocused}
          saveRecentSearch={() => {}}
          displayForRouteKey={() => ({ headway: null, limited: false })}
          emptyText={NO_MATCHING_ROUTES}
        />
      </PanelBody>
    </StudioPanel>
  );
}
