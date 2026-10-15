import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapContextAgency, MapContextRoute } from '../../utils/mapContext';
import { FLOATING_CARD, LIST_ROW_PRIMARY, PANEL_TITLE, SIDEBAR_PANEL_WIDTH, PANEL_SIDEBAR, SIDEBAR_LEFT_FALLBACK } from '../../styles';
import RouteListRow from '../RouteListRow';
import { routeRowLabels } from './SearchSuggestionsPanel';
import RegionFilterPills from '../RegionFilterPills';
import Panel, { PanelTitleBar } from '../ui/Panel';
import ListRow from '../ui/ListRow';
import AgencyGroupHeader from '../ui/AgencyGroupHeader';

interface MapContextPanelProps {
  agencies: MapContextAgency[];
  mode: 'agencies' | 'routes';
  /** Agency slug -> state/province, for the same region pills the agency list uses. */
  regionBySlug?: Map<string, string>;
  sidebarLeft?: number;
  searchBarWidth?: number;
  onSelectAgency?: (slug: string) => void;
  onSelectRoute?: (key: string) => void;
}

export const MapContextPanel: React.FC<MapContextPanelProps> = ({ agencies, mode, regionBySlug, sidebarLeft, searchBarWidth, onSelectAgency, onSelectRoute }) => {
  const [regionFilter, setRegionFilter] = useState<Set<string>>(() => new Set());
  const regionOf = useCallback((slug: string) => regionBySlug?.get(slug) ?? 'Other', [regionBySlug]);
  // Only regions with routes in view get a pill, so no pill ever matches nothing.
  const regionsInView = useMemo(() => {
    if (!regionBySlug) return [];
    return [...new Set(agencies.filter(agency => agency.routes.length > 0).map(agency => regionOf(agency.slug)))].sort();
  }, [agencies, regionBySlug, regionOf]);
  useEffect(() => {
    if (regionFilter.size === 0) return;
    const next = new Set([...regionFilter].filter(region => regionsInView.includes(region)));
    if (next.size !== regionFilter.size) setRegionFilter(next);
  }, [regionFilter, regionsInView]);
  const showRegionPills = mode === 'routes' && regionsInView.length > 1;
  const routes = useMemo(() => agencies
    .filter(agency => !showRegionPills || regionFilter.size === 0 || regionFilter.has(regionOf(agency.slug)))
    .flatMap(agency => agency.routes),
  [agencies, showRegionPills, regionFilter, regionOf]);
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
    <Panel
      sidebar
      className="max-h-[calc(100vh-132px)] pointer-events-auto"
      style={{
        '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
        ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
      } as React.CSSProperties}
    >
      <PanelTitleBar>
        <div className="min-w-0 flex-1">
          <div className={PANEL_TITLE}>In view</div>
          <div className="text-xs font-bold text-[var(--text-primary)]">
            {count} {count === 1 ? (mode === 'agencies' ? 'agency' : 'route') : (mode === 'agencies' ? 'agencies' : 'routes')}
          </div>
        </div>
      </PanelTitleBar>

      {showRegionPills && (
        <div className="shrink-0 flex gap-1.5 overflow-x-auto items-center px-4 py-2 border-b border-[var(--border-primary)] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <RegionFilterPills
            regions={regionsInView}
            selectedRegions={regionFilter}
            setSelectedRegions={setRegionFilter}
          />
        </div>
      )}

      <div className="custom-scrollbar overflow-y-auto py-1">
        {mode === 'agencies' ? (
          agencies.length > 0 ? agencies.map(agency => {
            return (
              <div key={agency.slug} className="flex items-center">
                <ListRow
                  variant="spaced"
                  onClick={() => onSelectAgency?.(agency.slug)}
                  className={`min-w-0 flex-1 ${onSelectAgency ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className={`${LIST_ROW_PRIMARY} min-w-0 text-left`} title={agency.name}>{agency.name}</span>
                </ListRow>
              </div>
            );
          }) : (
            <div className="px-4 py-3 text-xs font-bold text-[var(--text-dim)]">No matching agencies.</div>
          )
        ) : (
          filteredRouteGroups.length > 0 ? filteredRouteGroups.map(group => (
            <section key={group.agencyName}>
              <AgencyGroupHeader rule="none">{group.agencyName}</AgencyGroupHeader>
              {group.routes.map((route: MapContextRoute) => {
                const labels = routeRowLabels(route.shortName, route.longName, route.routeType);
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
            <div className="px-4 py-3 text-xs font-bold text-[var(--text-dim)]">No matching routes.</div>
          )
        )}
      </div>
    </Panel>
  );
};
