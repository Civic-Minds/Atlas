import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapContextAgency, MapContextRoute } from '../../utils/mapContext';
import { AGENCY_LIST_FILTERS, FLOATING_CARD, LIST_ROW_PRIMARY, PANEL_TITLE, PILL_SCROLL_ROW, SIDEBAR_PANEL_WIDTH, PANEL_SIDEBAR, sidebarFrameStyle } from '../../styles';
import RouteListRow from '../RouteListRow';
import RegionFilterPills from '../RegionFilterPills';
import Panel, { PanelBody, PanelTitleBar } from '../ui/Panel';
import ListRow from '../ui/ListRow';
import AgencyGroupHeader from '../ui/AgencyGroupHeader';
import AgencyName from '../ui/AgencyName';
import { CARD_SUMMARY } from './cardUi';
import PanelEmpty from '../ui/PanelEmpty';
import { compareAgencyName, compareRegion } from '../../utils/sortCompare';
import { countOf } from '../../../shared/overflowText';
import { NO_MATCHING_AGENCIES, NO_MATCHING_ROUTES, OTHER_REGION_LABEL } from '../../content/noticeCopy';

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
  const regionOf = useCallback((slug: string) => regionBySlug?.get(slug) ?? OTHER_REGION_LABEL, [regionBySlug]);
  // Only regions with routes in view get a pill, so no pill ever matches nothing.
  const regionsInView = useMemo(() => {
    if (!regionBySlug) return [];
    return [...new Set(agencies.filter(agency => agency.routes.length > 0).map(agency => regionOf(agency.slug)))].sort(compareRegion);
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
    const groups = new Map<string, { agencySlug: string; agencyName: string; routes: MapContextRoute[] }>();
    for (const route of routes) {
      const group = groups.get(route.agencySlug) ?? { agencySlug: route.agencySlug, agencyName: route.agencyName, routes: [] };
      group.routes.push(route);
      groups.set(route.agencySlug, group);
    }
    // Same order as the agencies tab: most routes in view first, then A-Z. Routes inside each
    // agency keep the route-number order buildMapContextAgencies gave them.
    return [...groups.values()].sort((a, b) =>
      b.routes.length - a.routes.length
      || compareAgencyName(a.agencyName, b.agencyName)
      || a.agencySlug.localeCompare(b.agencySlug));
  }, [routes]);

  return (
    <Panel
      sidebar
      className="pointer-events-auto"
      style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}
    >
      <PanelTitleBar>
        <div className="min-w-0 flex-1">
          <div className={PANEL_TITLE}>In view</div>
          {/* The count reads like an agency card's facts line under its name (CIV-971). */}
          <div className={CARD_SUMMARY}>
            {mode === 'agencies' ? countOf(count, 'agency', 'agencies') : countOf(count, 'route')}
          </div>
        </div>
      </PanelTitleBar>

      {showRegionPills && (
        // The agency lists' filter row (History, the agency browser): AGENCY_LIST_FILTERS + PILL_SCROLL_ROW (CIV-1117 preview).
        <div className={AGENCY_LIST_FILTERS}>
        <div className={PILL_SCROLL_ROW} style={{ scrollbarWidth: 'none' }}>
          <RegionFilterPills
            regions={regionsInView}
            selectedRegions={regionFilter}
            setSelectedRegions={setRegionFilter}
          />
        </div>
        </div>
      )}

      <PanelBody className="py-1">
        {mode === 'agencies' ? (
          agencies.length > 0 ? agencies.map(agency => {
            return (
              <div key={agency.slug} className="flex items-center">
                <ListRow
                  variant="spaced"
                  onClick={() => onSelectAgency?.(agency.slug)}
                  className={`min-w-0 flex-1 ${onSelectAgency ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {/* "Agency · place", as every agency list writes it (CIV-971). */}
                  <span className={`${LIST_ROW_PRIMARY} min-w-0 truncate text-left`} title={agency.name}>
                    <AgencyName primary={agency.display?.primary ?? agency.name} secondary={agency.display?.secondary} />
                  </span>
                </ListRow>
              </div>
            );
          }) : (
            <PanelEmpty>{NO_MATCHING_AGENCIES}</PanelEmpty>
          )
        ) : (
          filteredRouteGroups.length > 0 ? filteredRouteGroups.map(group => (
            <section key={group.agencyName}>
              <AgencyGroupHeader rule="none">
                {(() => {
                  const display = agencies.find(agency => agency.slug === group.agencySlug)?.display;
                  return <AgencyName primary={display?.primary ?? group.agencyName} secondary={display?.secondary} />;
                })()}
              </AgencyGroupHeader>
              {group.routes.map((route: MapContextRoute) => {
                const labels = { shortName: route.label.primary, name: route.label.secondary };
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
            <PanelEmpty>{NO_MATCHING_ROUTES}</PanelEmpty>
          )
        )}
      </PanelBody>
    </Panel>
  );
};
