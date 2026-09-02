import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { MapContextAgency, MapContextRoute } from '../../utils/mapContext';
import { FLOATING_CARD, LIST_ROW_SPACED, LIST_ROW_PRIMARY, PANEL_SECTION_HEAD, PANEL_TITLE_BAR, PANEL_TITLE, SEARCH_FIELD, SEARCH_PILL, SIDEBAR_PANEL_WIDTH, PANEL_SIDEBAR, SIDEBAR_LEFT_FALLBACK, Z_PANEL } from '../../styles';
import RouteListRow from '../RouteListRow';
import { routeRowLabels } from './SearchSuggestionsPanel';

interface MapContextPanelProps {
  agencies: MapContextAgency[];
  mode: 'agencies' | 'routes';
  sidebarLeft?: number;
  searchBarWidth?: number;
  onSelectAgency?: (slug: string) => void;
  onSelectRoute?: (key: string) => void;
}

export const MapContextPanel: React.FC<MapContextPanelProps> = ({ agencies, mode, sidebarLeft, searchBarWidth, onSelectAgency, onSelectRoute }) => {
  const [query, setQuery] = useState('');
  const routes = useMemo(() => agencies.flatMap(agency => agency.routes), [agencies]);
  const count = mode === 'agencies' ? agencies.length : routes.length;
  const filteredAgencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? agencies.filter(agency => agency.name.toLowerCase().includes(q)) : agencies;
  }, [agencies, query]);
  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? routes.filter(route => [route.shortName, route.longName, route.agencyName].some(value => value?.toLowerCase().includes(q)))
      : routes;
  }, [query, routes]);
  const filteredRouteGroups = useMemo(() => {
    const groups = new Map<string, { agencyName: string; routes: MapContextRoute[] }>();
    for (const route of filteredRoutes) {
      const group = groups.get(route.agencySlug) ?? { agencyName: route.agencyName, routes: [] };
      group.routes.push(route);
      groups.set(route.agencySlug, group);
    }
    return [...groups.values()].sort((a, b) => a.agencyName.localeCompare(b.agencyName));
  }, [filteredRoutes]);

  return (
    <div
      className={`${PANEL_SIDEBAR} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100vh-132px)] ${FLOATING_CARD} flex flex-col overflow-hidden pointer-events-auto`}
      style={{
        '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
        ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
      } as React.CSSProperties}
    >
      <div className={PANEL_TITLE_BAR}>
        <div className="min-w-0 flex-1">
          <div className={PANEL_TITLE}>In view</div>
          <div className="text-[11px] font-bold text-[var(--text-primary)]">
            {count} {count === 1 ? (mode === 'agencies' ? 'agency' : 'route') : (mode === 'agencies' ? 'agencies' : 'routes')}
          </div>
        </div>
      </div>

      {(mode === 'agencies' ? agencies.length : routes.length) > 5 && (
        <label className={`${SEARCH_PILL} mx-3 mt-2`}>
          <Search className="w-3 h-3 shrink-0 text-[var(--text-dim)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={mode === 'agencies' ? 'Filter agencies' : 'Filter routes'}
            aria-label={mode === 'agencies' ? 'Filter agencies in view' : 'Filter routes in view'}
            className={SEARCH_FIELD}
          />
        </label>
      )}

      <div className="custom-scrollbar overflow-y-auto py-1">
        {mode === 'agencies' ? (
          filteredAgencies.length > 0 ? filteredAgencies.map(agency => (
            <button
              key={agency.slug}
              type="button"
              onClick={() => onSelectAgency?.(agency.slug)}
              className={`${LIST_ROW_SPACED} ${onSelectAgency ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`${LIST_ROW_PRIMARY} min-w-0 truncate text-left`}>{agency.name}</span>
            </button>
          )) : (
            <div className="px-4 py-3 text-[10px] font-bold text-[var(--text-dim)]">No matching agencies.</div>
          )
        ) : (
          filteredRouteGroups.length > 0 ? filteredRouteGroups.map(group => (
            <section key={group.agencyName}>
              <div className={`${PANEL_SECTION_HEAD} pt-2 pb-1`}>{group.agencyName}</div>
              {group.routes.map((route: MapContextRoute) => {
                const labels = routeRowLabels(route.shortName, route.longName);
                return (
                  <RouteListRow
                    key={route.key}
                    shortName={labels.shortName}
                    name={labels.name}
                    variant="spaced"
                    onClick={() => onSelectRoute?.(route.key)}
                    className={onSelectRoute ? 'cursor-pointer' : 'cursor-default'}
                  />
                );
              })}
            </section>
          )) : (
            <div className="px-4 py-3 text-[10px] font-bold text-[var(--text-dim)]">No matching routes.</div>
          )
        )}
      </div>
    </div>
  );
};
