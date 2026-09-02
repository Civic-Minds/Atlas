import React, { useMemo } from 'react';
import type { MapContextAgency, MapContextRoute } from '../../utils/mapContext';
import { FLOATING_CARD, LIST_ROW_SPACED, LIST_ROW_PRIMARY, PANEL_SECTION_HEAD, PANEL_TITLE_BAR, PANEL_TITLE, SIDEBAR_PANEL_WIDTH, PANEL_SIDEBAR, SIDEBAR_LEFT_FALLBACK } from '../../styles';
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
  const routes = useMemo(() => agencies.flatMap(agency => agency.routes), [agencies]);
  const count = mode === 'agencies' ? agencies.length : routes.length;
  const filteredRouteGroups = useMemo(() => {
    const groups = new Map<string, { agencyName: string; routes: MapContextRoute[] }>();
    for (const route of routes) {
      const group = groups.get(route.agencySlug) ?? { agencyName: route.agencyName, routes: [] };
      group.routes.push(route);
      groups.set(route.agencySlug, group);
    }
    return [...groups.values()].sort((a, b) => a.agencyName.localeCompare(b.agencyName));
  }, [routes]);

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

      <div className="custom-scrollbar overflow-y-auto py-1">
        {mode === 'agencies' ? (
          agencies.length > 0 ? agencies.map(agency => (
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
