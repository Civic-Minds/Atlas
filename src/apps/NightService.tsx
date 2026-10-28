import React, { useEffect, useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import { useViewport } from '../context/ViewportContext';
import { PANEL_TITLE } from '../styles';
import { R2_PUBLIC_URL } from '../../shared/config';
import { plural } from '../../shared/overflowText';
import type { NightServiceFrequency } from '../../shared/nightService';
import { nightServiceKey, routeNightGrade } from '../../shared/nightService';
import Panel, { PanelBody, PanelTitleBar } from '../components/ui/Panel';
import CardRouteList from '../components/Interval/CardRouteList';
import { CardReportButton } from '../components/Interval/cardUi';
import { reportDetails } from '../utils/reportIssue';
import { routeLabels } from '../utils/format';
import { placeAlreadyInName } from '../utils/agencyName';
import { headwayEvery, headwayOrBetter } from '../utils/headwayText';
import ResearchInfo from '../components/ResearchInfo';
import { NIGHT_INFO_HEADING, nightRuleText } from '../content/researchRules';
import { compareRouteNumber } from '../utils/sortCompare';
import PanelEmpty from '../components/ui/PanelEmpty';
import { CARD_SUMMARY } from '../components/Interval/cardUi';
import AgencyGroupHeader from '../components/ui/AgencyGroupHeader';
import AgencyName from '../components/ui/AgencyName';
import { loadingText, NIGHT_LOAD_FAILED, nightNoRoutesNotice, NO_AGENCIES_MATCH_SEARCH } from '../content/noticeCopy';
import { boundingBox, lineCoordinates } from '../../shared/routeGeometry';

interface NightServiceRoute {
  agencySlug: string;
  agencyName: string;
  region: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  directionId: number | null;
  headsign: string | null;
}

interface NightServiceRouteSummary {
  routeId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  /** GTFS route_type, from the map's route features (needed to decide whether a numeric id is hidden). */
  routeType?: number;
  partOfRoute?: boolean;
  destinations: string[];
}

interface NightServiceFeatureProperties {
  nightService?: boolean;
  nightService30?: boolean;
  nightService60?: boolean;
  nightServicePartOfRoute?: boolean;
  routeId?: string | null;
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeType?: number;
  headsign?: string | null;
  agencyName?: string | null;
}

/** What a report from the Night list sends (CIV-932): the view, every agency and route it lists with its night value, and the map's bounds. */
function nightReportDetails(
  frequency: NightServiceFrequency,
  agencies: { name: string; routes: string[] }[],
  bounds: { n: number; s: number; e: number; w: number } | null | undefined,
): string {
  return reportDetails([
    ['View', `routes ${headwayOrBetter(frequency)} from 2am to 5am`],
    ['Map bounds', bounds ? `${bounds.s.toFixed(4)},${bounds.w.toFixed(4)} to ${bounds.n.toFixed(4)},${bounds.e.toFixed(4)}` : 'unknown'],
    '**Listed:**',
    ...(agencies.length > 0 ? agencies.flatMap(agency => [`- ${agency.name}`, ...agency.routes.map(route => `  - ${route}`)]) : ['- Nothing listed']),
  ]);
}

function nightRouteLabel(route: NightServiceRouteSummary, agency: { slug: string; agencyName: string }) {
  const label = routeLabels({ shortName: route.routeShortName, longName: route.routeLongName, routeType: route.routeType, agencySlug: agency.slug, agencyName: agency.agencyName });
  return label.primary ? label : { primary: 'Unnamed route', secondary: undefined };
}

interface NightServiceIndexFile {
  criteria: string;
  agencyCount: number;
  routeCount: number;
  routes: NightServiceRoute[];
}

interface Props {
  active?: boolean;
  sidebarLeft?: number;
  searchBarWidth?: number;
  layers: Record<string, GeoJSON.FeatureCollection>;
  query?: string;
  frequency: NightServiceFrequency;
  onRouteSelect?: (agencySlug: string, routeId: string) => void;
  /** The info card's back link: leaves Night for the main map at the same spot (CIV-929). */
  onBackToMap: () => void;
  /** A route is selected: its card takes this panel's place, as in Live. */
  selectionActive?: boolean;
}

function featureIntersectsBounds(feature: GeoJSON.Feature, bounds: { s: number; w: number; n: number; e: number }): boolean {
  const box = boundingBox(lineCoordinates(feature.geometry));
  if (!box) return false;
  return box.maxLng >= bounds.w && box.minLng <= bounds.e && box.maxLat >= bounds.s && box.minLat <= bounds.n;
}

export default function NightService({ active, sidebarLeft, searchBarWidth, layers, query = '', frequency, onRouteSelect, onBackToMap, selectionActive = false }: Props) {
  const [data, setData] = useState<NightServiceIndexFile | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const { bounds } = useViewport();
  const visibleRoutes = useMemo(() => {
    if (!bounds || Object.keys(layers).length === 0) return [];
    const routes: Array<{ agencySlug: string; properties: NightServiceFeatureProperties }> = [];
    for (const [agencySlug, collection] of Object.entries(layers)) {
      for (const feature of collection.features) {
        const properties = feature.properties as NightServiceFeatureProperties | null;
        if (properties?.[nightServiceKey(frequency)] !== true && !(frequency === 60 && properties?.nightService === true)) continue;
        if (!featureIntersectsBounds(feature, bounds)) continue;
        routes.push({ agencySlug, properties });
      }
    }
    return routes;
  }, [bounds, layers, frequency]);
  // Every row of each route that runs at night, in either view and anywhere on the map, so a route's night
  // value covers all of it: a direction that only makes 60 keeps the route at 60 in the 30 view too (CIV-931).
  const nightGrades = useMemo(() => {
    const rows = new Map<string, { nightService30?: boolean }[]>();
    for (const [agencySlug, collection] of Object.entries(layers)) {
      for (const feature of collection.features) {
        const properties = feature.properties as NightServiceFeatureProperties | null;
        if (!properties || (properties.nightService60 !== true && properties.nightService !== true && properties.nightService30 !== true)) continue;
        const key = `${agencySlug}::${properties.routeShortName ?? ''}::${properties.routeLongName ?? ''}`;
        rows.set(key, [...(rows.get(key) ?? []), { nightService30: properties.nightService30 }]);
      }
    }
    return new Map([...rows].map(([key, routeRows]) => [key, routeNightGrade(routeRows)]));
  }, [layers]);
  useEffect(() => {
    fetch(`${R2_PUBLIC_URL}/atlas/night-service.json`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: NightServiceIndexFile) => {
        setData(json);
        setLoadState('ready');
      })
      .catch(() => {
        // The map features are authoritative for what is visible. The index only
        // enriches them with agency regions and destination labels.
        setData({ criteria: '', agencyCount: 0, routeCount: 0, routes: [] });
        setLoadState('ready');
      });
  }, []);

  const agencies = useMemo(() => {
    if (!data) return [];
    const indexRoutes = new Map(data.routes.map(route => [
      `${route.agencySlug}::${route.routeShortName ?? ''}::${route.routeLongName ?? ''}`,
      route,
    ]));
    const byAgency = new Map<string, { agencyName: string; region: string | null; routes: Map<string, NightServiceRouteSummary> }>();
    for (const visible of visibleRoutes) {
      const properties = visible.properties;
      const routeKey = `${visible.agencySlug}::${properties.routeShortName ?? ''}::${properties.routeLongName ?? ''}`;
      const indexed = indexRoutes.get(routeKey);
      const entry = byAgency.get(visible.agencySlug) ?? {
        agencyName: properties.agencyName ?? indexed?.agencyName ?? visible.agencySlug,
        region: indexed?.region ?? null,
        routes: new Map(),
      };
      const summaryKey = `${properties.routeShortName ?? ''}::${properties.routeLongName ?? ''}`;
      const summary = entry.routes.get(summaryKey) ?? {
        routeId: properties.routeId ?? null,
        routeShortName: properties.routeShortName ?? indexed?.routeShortName ?? null,
        routeLongName: properties.routeLongName ?? indexed?.routeLongName ?? null,
        routeType: properties.routeType,
        destinations: [],
      };
      // Part of the route only when every lit row of it is partial.
      const partial = frequency === 60 && properties.nightServicePartOfRoute === true;
      summary.partOfRoute = summary.partOfRoute === undefined ? partial : summary.partOfRoute && partial;
      const headsign = properties.headsign ?? indexed?.headsign;
      if (headsign && !summary.destinations.includes(headsign)) summary.destinations.push(headsign);
      entry.routes.set(summaryKey, summary);
      byAgency.set(visible.agencySlug, entry);
    }
    const q = query.trim().toLowerCase();
    // Routes in number order within each agency, by the shared route sort (#1155: MiWay read 2, 3, 1, 7, 17).
    const list = [...byAgency.entries()].map(([slug, entry]) => ({
      slug,
      ...entry,
      routes: [...entry.routes.values()].sort((x, y) => compareRouteNumber(x.routeShortName, y.routeShortName, x.routeLongName, y.routeLongName)),
    }));
    if (!q) return list;
    return list
      .map(agency => ({
        ...agency,
        routes: agency.routes.filter(r =>
          agency.agencyName.toLowerCase().includes(q) ||
          (r.routeShortName ?? '').toLowerCase().includes(q) ||
          (r.routeLongName ?? '').toLowerCase().includes(q) ||
          r.destinations.some(destination => destination.toLowerCase().includes(q))
        ),
      }))
      .filter(agency => agency.agencyName.toLowerCase().includes(q) || agency.routes.length > 0);
  }, [data, query, visibleRoutes, frequency]);

  const nightGrade = (route: NightServiceRouteSummary, agencySlug: string) =>
    nightGrades.get(`${agencySlug}::${route.routeShortName ?? ''}::${route.routeLongName ?? ''}`) ?? 60;

  if (!active) return null;

  return (
    <ResearchInfo heading={NIGHT_INFO_HEADING} onBack={onBackToMap} sidebarLeft={sidebarLeft} searchBarWidth={searchBarWidth} hidden={selectionActive} below={
      <Panel sidebarSurface data-report-anchor="true" className="min-h-0 flex-1">
        <PanelTitleBar>
          <Moon className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
          <span className={PANEL_TITLE}>Overnight service</span>
          {/* The list shows data, so it has the report flag (CIV-932); the negative margin keeps the bar's height. */}
          <div className="ml-auto -my-1">
            <CardReportButton
              title={`Night service (${frequency} min view)`}
              details={nightReportDetails(frequency, agencies.map(agency => ({
                name: agency.agencyName,
                routes: agency.routes.map(route => {
                  const { primary, secondary } = nightRouteLabel(route, agency);
                  return `${secondary ? `${primary} ${secondary}` : primary} (${headwayEvery(nightGrade(route, agency.slug))}${route.partOfRoute ? ', part of the route' : ''})`;
                }),
              })), bounds)}
              excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
            />
          </div>
        </PanelTitleBar>

        <PanelBody>
          {loadState === 'loading' && <PanelEmpty kind="loading">{loadingText('night service')}</PanelEmpty>}
          {loadState === 'error' && <PanelEmpty kind="error">{NIGHT_LOAD_FAILED}</PanelEmpty>}
          {loadState === 'ready' && agencies.length === 0 && (
            <PanelEmpty>{query.trim() ? NO_AGENCIES_MATCH_SEARCH : nightNoRoutesNotice(frequency)}</PanelEmpty>
          )}
          {loadState === 'ready' && agencies.map((agency, agencyIndex) => (
            <div key={agency.slug}>
              {/* The shared agency heading of the list panels (CIV-1019), with the route count under it in the card facts line's own spacing. */}
              <AgencyGroupHeader rule={agencyIndex > 0 ? 'above' : 'below'}>
                <AgencyName primary={agency.agencyName} secondary={agency.region && !placeAlreadyInName(agency.agencyName, agency.region) ? agency.region : undefined} />
                <p className={`${CARD_SUMMARY} tracking-normal`}>{agency.routes.length} {plural(agency.routes.length, 'route')}</p>
              </AgencyGroupHeader>
              {/* The agency card's route list (CIV-931): "**300** Bloor-Danforth" and the night frequency on the right.
                  Destinations stay on the route card. */}
              <CardRouteList
                rows={agency.routes.map(route => ({
                  key: `${route.routeShortName ?? ''}-${route.routeLongName ?? ''}`,
                  route: nightRouteLabel(route, agency),
                  // Ryan's approved row: "● every 30 min". The grade is an upper bound, so this never overstates.
                  headway: nightGrade(route, agency.slug),
                  subLabel: route.partOfRoute ? 'Night service on part of the route' : undefined,
                  disabled: !route.routeId || !onRouteSelect,
                }))}
                onSelect={key => {
                  const route = agency.routes.find(r => `${r.routeShortName ?? ''}-${r.routeLongName ?? ''}` === key);
                  if (route?.routeId) onRouteSelect?.(agency.slug, route.routeId);
                }}
              />
            </div>
          ))}
        </PanelBody>
      </Panel>
    }>{nightRuleText(frequency)}</ResearchInfo>
  );
}
