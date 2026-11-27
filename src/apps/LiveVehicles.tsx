import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useSidebarFrame } from '../context/SidebarFrame';
import { createPortal } from 'react-dom';
import { CardBackLink } from '../components/CardBack';
import { Info, Moon, Sun, ChevronRight } from 'lucide-react';
import { useLiveFeedsDown, useLiveVehiclesMapOverlay } from '../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { LIVE_AGENCY_SLUGS, LIVE_POLLING_ROUTES, LIVE_AGENCY_BBOXES, LIVE_AGENCY_PLACES, getPolledRoute } from '../../shared/livePollingConfig';
import { useViewport } from '../context/ViewportContext';
import type { OpenInfoFn } from '../components/InfoPanel';
import type { Agency } from '../App';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import { ICON_BTN, TRANSITION_SLOW, LIST_ROW_DIM, CARD_NOTICE, PANEL_SIDEBAR, Z_HEADER, PANEL_TITLE, PANEL_SECTION_HEAD, SIDEBAR_PANEL_WIDTH } from '../styles';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { BOTTOM_SHEET_FIT_CONTENT, BOTTOM_SHEET_FRAME, BottomSheetHandle, bottomSheetBodyClass, useBottomSheet } from '../components/ui/BottomSheet';
import Tag from '../components/ui/Tag';
import { useRouteAnalysis } from '../hooks/useRouteAnalysisPatterns';
import { useLiveTripDirections } from '../hooks/useLiveTripDirections';
import { streetJoin } from '../utils/stopLabel';
import ArrowLink from '../components/ui/ArrowLink';
import { AgencyList, AgencyListRow } from '../components/ui/AgencyList';
import RouteListRow from '../components/RouteListRow';
import RouteCardTitle from '../components/RouteCardTitle';
import { getVehicleColors, vehicleStatus } from '../utils/colors';
import { useColorVision } from '../context/ColorVisionContext';
import { effectiveMode, knownModeLabel, type EffectiveModeInput } from '../../shared/modes';
import { cleanRouteShortName, cleanRouteDisplayName, routeListCompanionName, vehicleModeWord, vehicleModeCount, nameCase, routeShortLabel, GENERIC_VEHICLE } from '../utils/format';
import { agencyNames, agencyShortNameBySlug } from '../utils/agencyName';
import { liveScheduledHeadway, liveScheduledRowsNow } from '../utils/liveScheduledHeadway';
import { routeDirectionOverrides } from '../utils/routeCardDirectionGroups';
import { periodKeyForHour } from '../../shared/config';
import { andOthers, countOf } from '../../shared/overflowText';
import { liveAgencyStatus, newestReportSec, worstLiveStatus, type LiveAgencyFeed } from '../../shared/liveStatus';
import { LiveStatusDot } from '../components/Live/LiveStatusPill';
import { inferLiveDirection } from '../utils/liveDirection';
import { compareLiveRoutes, focusDirectionKey, groupVehiclesByDirection, orderAlongRoute, orderDirectionGroups, riderHeadsign, routeDirectionLabels, rowDirectionKey } from '../utils/liveGrouping';
import { liveRouteReportDetails, liveVehicleReportDetails } from '../components/Live/liveReport';
import { agencyTime } from '../components/Live/LiveRoutePerformance';
import { RIGHT_NOW_STALE_SEC } from '../../shared/rules/live';
import { CardDirectionRow, CardHelpNotice, CardReportButton, SidebarCardHeaderBlock, SidebarCardSection, SidebarCardShell, SIDEBAR_CARD_BODY, REPORT_REASON } from '../components/Interval/cardUi';
import { liveVehiclesFingerprint } from '../utils/liveVehiclesFingerprint';
import { buildRouteKey, routeFeatureForShortName, routeKeyForShortName, splitRouteKey } from '../utils/routeKey';
import type { MapFocus } from '../utils/routeFocus';
import { getNowDay } from '../../shared/dayTypes';
import { capitalizeFirst, headwayAbout, headwayEvery } from '../utils/headwayText';
import { cardTripEnd, delayLabel, placedRows, vehicleCardName, vehicleCardRows, vehicleRowName } from '../components/Live/vehicleCardModel';
import Panel, { PanelBody, PanelTitleBar } from '../components/ui/Panel';
import LiveRoutePerformance, { agencyHour } from '../components/Live/LiveRoutePerformance';
import { RouteCardHeadway } from '../components/Interval/panels/RouteCardHeadway';
import { buildCurrentRoute, routeCardFeedDates, routeVariantFamily } from '../utils/routeCardRoute';
import { buildDirectionGroups } from '../utils/routeCardDirectionGroups';
import type { HoveredBranch, TimePeriod } from '../hooks/useIntervalStats';
import { NO_HEADWAY_LIMIT } from '../../shared/rules/limits';
import { useLiveFeeds } from '../hooks/useLiveFeeds';
import { useLiveRouteRequest, useLiveViewUrl } from '../hooks/useLiveView';
import PanelEmpty from '../components/ui/PanelEmpty';
import AgencyName from '../components/ui/AgencyName';
import AgencyGroupHeader from '../components/ui/AgencyGroupHeader';
import { loadingText, liveReportFlagTitle, LIVE_COVERED_ROUTES_HEADING, LIVE_NOTHING_ACTIVE, LIVE_NOTHING_ACTIVE_HINT, LIVE_NO_ROUTE_MATCHES, LIVE_NO_VEHICLES_ON_ROUTE, liveRouteEmptyNotice, ABOUT_ATLAS, TOGGLE_DARK_MODE_LABEL, BROWSE_LIVE_AGENCIES_LINK, LIVE_TAB_LABEL, liveListTitle } from '../content/noticeCopy';
import { speedText } from '../../shared/unitText';
import { directionBranchFallback } from '../../shared/headsignDisplay';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  active: boolean;
  onInfoOpen?: OpenInfoFn;
  query: string;
  layers?: Record<string, GeoJSON.FeatureCollection>;
  selectionActive?: boolean;
  /** A route picked on the map or in a link, handed over from the main map. */
  routeRequest?: { slug: string; routeShortName: string; ts: number } | null;
  /** Opens the agency's page (the route card's agency name links there, like the regular card). */
  onAgencyClick?: (slug: string) => void;
}

interface RouteGroup {
  agencySlug: string;
  routeShortName: string;
  displayName: string;
  vehicles: LiveVehicle[];
  lateCount: number;
  earlyCount: number;
  dominantStatus: LiveVehicle['status'];
}


// Eligible slugs: the one list of live agencies (CIV-1691, CIV-1797).
const ELIGIBLE_SLUGS = new Set(LIVE_AGENCY_SLUGS);

/** One-line summary of a destination's vehicles: "10 vehicles · 2 late" (a streetcar route), "3 buses". */
function directionSummary(vehicles: LiveVehicle[], modeWord: string): string {
  const count = vehicleModeCount(vehicles.length, modeWord);
  const late = vehicles.filter(v => vehicleStatus(v) === 'late').length;
  return late > 0 ? `${count} · ${late} late` : count;
}

/** MOCK (#1877 mock C): the count and the late count, "0 late" included, left out only when no vehicle reports how late it is. */
function mockCountLine(vehicles: LiveVehicle[], modeWord: string): string {
  const count = vehicleModeCount(vehicles.length, modeWord);
  if (!vehicles.some(v => v.delayMin != null)) return count;
  return `${count} · ${vehicles.filter(v => vehicleStatus(v) === 'late').length} late`;
}

function BrowseLiveAgenciesLink({ onInfoOpen }: { onInfoOpen?: OpenInfoFn }) {
  if (!onInfoOpen) return null;
  return (
    <ArrowLink as="button" tone="inline" size="xs" onClick={() => onInfoOpen('agencies', { featureFilter: 'live' })} className="mx-4 mb-2">
      {BROWSE_LIVE_AGENCIES_LINK}
    </ArrowLink>
  );
}

/** The phone sheet renders at the page root, so it sits above the map's controls as the map's own route sheet does. */
function SheetPortal({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? createPortal(children, document.body) : <>{children}</>;
}

const MIN_LIVE_ZOOM = 9;

/** Direction work per polled vehicle, kept across zoom steps (see resolvedVehiclesBySlug). */
const resolvedDirections = new WeakMap<LiveVehicle, LiveVehicle>();
const NO_VEHICLES: LiveVehicle[] = [];

export default function LiveVehicles({ agencies, lightMode, setLightMode, active, onInfoOpen, query, layers = {}, selectionActive = false, routeRequest = null, onAgencyClick }: Props) {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const { setOverlay } = useLiveVehiclesMapOverlay();
  const { bounds, zoom } = useViewport();

  // Locally-fetched agency GeoJSON (fallback when Interval layers haven't loaded yet)
  const [localLayers, setLocalLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  // One route lookup for the whole card: the agency's shapes, and a route's first shape by short name.
  const routeLayer = useCallback(
    (slug: string): GeoJSON.FeatureCollection | undefined => layers[slug] ?? localLayers[slug],
    [layers, localLayers],
  );
  const routeFeature = useCallback((slug: string, routeShortName: string) => {
    const fc = routeLayer(slug);
    return fc ? routeFeatureForShortName(fc.features, routeShortName) : undefined;
  }, [routeLayer]);
  // The card over the map, so the map frames routes, places and vehicles clear of it.
  const cardRef = useRef<HTMLDivElement>(null);


  // selectedRoute is Live's route key, buildRouteKey(slug, routeShortName) ("ttc::504"): Live keys routes by short name,
  // and this is the value its links carry in ?route=.
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const selectedRouteRef = useRef(selectedRoute);
  selectedRouteRef.current = selectedRoute;
  const [vehicleFly, setVehicleFly] = useState<{ lat: number; lon: number; ts: number } | null>(null);
  // The vehicle whose card is open, tied to its route so a route change closes it.
  const [vehicleCard, setVehicleCard] = useState<{ routeKey: string; id: string } | null>(null);
  // Vehicles under a map click on overlapping dots, waiting for the user to pick one.
  const [vehiclePick, setVehiclePick] = useState<string[] | null>(null);
  const [focusedVehicle, setFocusedVehicle] = useState<{ id: string; lat: number; lon: number; ts: number } | null>(null);
  const [focusArea, setFocusArea] = useState<{ bounds: [number, number, number, number]; minZoom?: number; ts: number } | null>(null);
  // A route handed over from the main map (or a link), waiting for its agency to come into view.
  const pendingRouteRef = useRef<string | null>(null);

  const isZoomedIn = zoom !== null && zoom >= MIN_LIVE_ZOOM;

  // Agency picked from the zoomed-out agency list: the list shows only its routes, since
  // neighbouring agencies' bboxes overlap (Toronto / York Region).
  const [placeScope, setPlaceScope] = useState<string | null>(null);
  const placeScopeArrivedRef = useRef(false);

  // Which agency slugs are currently in the viewport
  const visibleSlugs = useMemo(() => {
    if (!bounds || !isZoomedIn) return [];
    return Object.entries(LIVE_AGENCY_BBOXES)
      .filter(([slug, [w, s, e, n]]) =>
        ELIGIBLE_SLUGS.has(slug) &&
        bounds.e > w && bounds.w < e &&
        bounds.n > s && bounds.s < n
      )
      .map(([slug]) => slug);
  }, [bounds]);

  // Drop the scope once the user leaves that agency's area or zooms back out.
  useEffect(() => {
    if (!placeScope) { placeScopeArrivedRef.current = false; return; }
    if (isZoomedIn && visibleSlugs.length > 0) {
      placeScopeArrivedRef.current = true;
      if (!visibleSlugs.includes(placeScope)) setPlaceScope(null);
    } else if (!isZoomedIn && placeScopeArrivedRef.current) {
      setPlaceScope(null);
    }
  }, [placeScope, isZoomedIn, visibleSlugs]);

  const visibleSlugKey = useMemo(() => [...visibleSlugs].sort().join(','), [visibleSlugs]);

  const { vehiclesBySlug, headwaysBySlug, loadingBySlug, errorBySlug, degradedBySlug, nextPollAt } = useLiveFeeds(active, visibleSlugs, visibleSlugKey);
  // CIV-2084: each agency in view as last polled (its newest vehicle report, or a failed poll), for the map's status pill.
  // An agency whose first poll hasn't answered yet is left out until it does.
  const { setFeeds } = useLiveFeedsDown();
  const statusFeeds = useMemo<LiveAgencyFeed[] | null>(() => (!active ? null : visibleSlugs
    .filter(slug => vehiclesBySlug[slug] != null || errorBySlug[slug] != null)
    .map(slug => ({ slug, name: agencyShortNameBySlug(agencies, slug), newestSec: newestReportSec(vehiclesBySlug[slug] ?? []), failed: errorBySlug[slug] != null }))),
  [active, visibleSlugs, vehiclesBySlug, errorBySlug, agencies]);
  useEffect(() => { setFeeds(statusFeeds); }, [statusFeeds, setFeeds]);
  useEffect(() => () => setFeeds(null), [setFeeds]);

  // The picked route's vehicles' directions from their trips (the analysis's timetable, via useLiveTripDirections below).
  const [tripDirections, setTripDirections] = useState<ReadonlyMap<string, number> | null>(null);

  // Fill missing direction metadata from static directional route shapes. Some
  // GTFS-RT feeds provide vehicle positions without direction_id or headsign.
  const resolvedVehiclesBySlug = useMemo(() => {
    const resolved: Record<string, LiveVehicle[]> = {};
    for (const [slug, vehicles] of Object.entries(vehiclesBySlug)) {
      const fc = routeLayer(slug);
      if (!fc) { resolved[slug] = vehicles; continue; }
      // Group the route shapes once, not once per vehicle.
      const featuresByRoute = new Map<string, GeoJSON.Feature[]>();
      for (const feature of fc.features) {
        const name = (feature.properties as any)?.routeShortName;
        const list = featuresByRoute.get(name);
        if (list) list.push(feature); else featuresByRoute.set(name, [feature]);
      }
      resolved[slug] = vehicles.map(vehicle => {
        // `layers` is rebuilt on every zoom step, but a vehicle's direction doesn't change until the next
        // poll gives a new vehicle object, so work it out once per vehicle.
        const routeFeatures = featuresByRoute.get(vehicle.routeShortName) ?? [];
        // A direction the trip itself gives wins over the nearest-shape guess, which can pick the other
        // direction's shape where the two run close together, as at a terminal loop (#1164).
        const known = vehicle.directionId == null && buildRouteKey(slug, vehicle.routeShortName) === selectedRoute ? tripDirections?.get(vehicle.id) : undefined;
        const cached = resolvedDirections.get(vehicle);
        if (cached && (known == null || cached.directionId === known)) return cached;
        const match = inferLiveDirection(known == null ? vehicle : { ...vehicle, directionId: known }, routeFeatures);
        // Destinations read with "&" between two street names, like the direction labels below (CIV-1043); an
        // internal headsign ("506 Carlton Short Turn") never reaches the list or the card (CIV-1062).
        const headsign = riderHeadsign(match.headsign, vehicle.routeShortName);
        const out = { ...vehicle, directionId: match.directionId, headsign: headsign && streetJoin(headsign) };
        if (routeFeatures.length > 0) resolvedDirections.set(vehicle, out);
        return out;
      });
    }
    return resolved;
  }, [vehiclesBySlug, routeLayer, selectedRoute, tripDirections]);

  useLiveRouteRequest({
    active, routeRequest, visibleSlugs, pendingRouteRef,
    open: key => { setFocusedVehicle(null); setSelectedRoute(key); },
    flyTo: slug => {
      const bbox = LIVE_AGENCY_BBOXES[slug];
      if (bbox) setFocusArea({ bounds: bbox, minZoom: MIN_LIVE_ZOOM + 0.2, ts: Date.now() });
    },
  });


  // Clear selected route when it's no longer in view
  useEffect(() => {
    if (!selectedRoute) return;
    if (!visibleSlugs.includes(splitRouteKey(selectedRoute).agencySlug)) {
      setSelectedRoute(null);
      setFocusedVehicle(null);
    }
  }, [visibleSlugs, selectedRoute]);

  const allVehicles = useMemo(() => Object.values(resolvedVehiclesBySlug).flat(), [resolvedVehiclesBySlug]);
  const isLoading = Object.values(loadingBySlug).some(Boolean);
  const errors = Object.values(errorBySlug).filter(Boolean) as string[];


  // Fetch GeoJSON for any visible agency that has live vehicles and isn't loaded yet
  // (shared IDB/LRU path — same as Frequency / Corridors).
  useEffect(() => {
    const slugsNeeded = new Set<string>();
    if (selectedRoute) {
      const { agencySlug: slug } = splitRouteKey(selectedRoute);
      if (slug) slugsNeeded.add(slug);
    }
    for (const slug of Object.keys(vehiclesBySlug)) slugsNeeded.add(slug);
    for (const slug of slugsNeeded) {
      if (routeLayer(slug)) continue;
      const agency = agencies.find(a => a.slug === slug);
      if (!agency) continue;
      fetchAgencyGeo({ slug: agency.slug, name: agency.name, url: agency.url ?? '', betaOnly: agency.betaOnly })
        .then((data: GeoJSON.FeatureCollection) => setLocalLayers(prev => ({ ...prev, [slug]: data })))
        .catch(() => {});
    }
  }, [selectedRoute, vehiclesBySlug, routeLayer, agencies]);

  // The picked route in the map's own key form, so the map's shared selected-route styling and framing draw it.
  const mapRouteKey = useMemo(() => {
    if (!selectedRoute) return null;
    const { agencySlug: slug, routeId: rsn } = splitRouteKey(selectedRoute);
    const fc = slug ? routeLayer(slug) : undefined;
    return fc && rsn ? routeKeyForShortName(slug, fc.features, rsn, getNowDay()) : null;
  }, [routeLayer, selectedRoute]);

  // A vehicle's card, from a dot click, the overlapping-dots pick list, or a shared link.
  const openVehicleCard = useCallback((vehicle: LiveVehicle) => {
    const key = buildRouteKey(vehicle.agencySlug, vehicle.routeShortName);
    setVehiclePick(null);
    if (key !== selectedRouteRef.current) setSelectedRoute(key);
    setVehicleCard({ routeKey: key, id: vehicle.id });
    // Framed beside the card (or above the phone sheet) like a vehicle picked from the list.
    setVehicleFly({ lat: vehicle.lat, lon: vehicle.lon, ts: Date.now() });
    setFocusedVehicle({ id: vehicle.id, lat: vehicle.lat, lon: vehicle.lon, ts: Date.now() });
  }, []);

  // Clear overlay when deactivating or unmounting. The camera requests go too, or re-entering Live replays the
  // last vehicle or place flight.
  useEffect(() => {
    if (active) return;
    setOverlay(null);
    setVehicleFly(null);
    setFocusArea(null);
  }, [active, setOverlay]);
  useEffect(() => {
    return () => setOverlay(null);
  }, [setOverlay]);

  // Filter + group by (agencySlug, routeShortName)
  const routeGroups = useMemo<RouteGroup[]>(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? allVehicles.filter(v =>
          v.routeShortName.toLowerCase().includes(q) ||
          (v.displayName && v.displayName.toLowerCase().includes(q)) ||
          (v.headsign && v.headsign.toLowerCase().includes(q)) ||
          // A vehicle number ("4503") finds that vehicle: whole number only, so "50" doesn't pull in every 50xx car (#1470).
          v.id.toLowerCase() === q ||
          (v.vehicleLabel != null && v.vehicleLabel.toLowerCase() === q)
        )
      : allVehicles;

    const map = new Map<string, LiveVehicle[]>();
    for (const v of filtered) {
      const key = buildRouteKey(v.agencySlug, v.routeShortName);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }

    const routeNamesByKey = new Map<string, string>();
    for (const [slug, collection] of Object.entries({ ...localLayers, ...layers })) {
      for (const feature of collection.features) {
        const properties = feature.properties as { routeShortName?: string | null; routeLongName?: string | null } | null;
        if (!properties?.routeShortName || !properties.routeLongName) continue;
        routeNamesByKey.set(buildRouteKey(slug, properties.routeShortName), properties.routeLongName);
      }
    }

    return [...map.entries()]
      .map(([key, vs]) => {
        const { agencySlug, routeId: routeShortName } = splitRouteKey(key);
        const lateCount = vs.filter(v => v.status === 'late').length;
        const earlyCount = vs.filter(v => v.status === 'early').length;
        const dominantStatus: LiveVehicle['status'] =
          lateCount > 0 ? 'late' : earlyCount > 0 ? 'early' : vs[0].status;
        const displayName = nameCase(cleanRouteDisplayName(
          routeNamesByKey.get(key) || vs[0].displayName || routeShortLabel(routeShortName),
          routeShortName,
        ), 'route');
        return { agencySlug, routeShortName, displayName, vehicles: vs, lateCount, earlyCount, dominantStatus };
      })
      .sort(compareLiveRoutes);
  }, [allVehicles, query, layers, localLayers]);

  // Viewport-filter the sidebar list: only show routes with at least one vehicle on screen
  const displayedRouteGroups = useMemo(() => {
    const scoped = placeScope ? routeGroups.filter(g => g.agencySlug === placeScope) : routeGroups;
    if (!bounds) return scoped;
    return scoped.filter(g =>
      g.vehicles.some(v => v.lat >= bounds.s && v.lat <= bounds.n && v.lon >= bounds.w && v.lon <= bounds.e)
    );
  }, [routeGroups, bounds, placeScope]);

  const vehiclesInViewport = useMemo(() => {
    if (!bounds) return allVehicles.length;
    return allVehicles.filter(v =>
      v.lat >= bounds.s && v.lat <= bounds.n && v.lon >= bounds.w && v.lon <= bounds.e,
    ).length;
  }, [allVehicles, bounds]);

  const monitoredRoutes = useMemo(() => {
    return LIVE_POLLING_ROUTES
      .filter(r => ELIGIBLE_SLUGS.has(r.slug) && visibleSlugs.includes(r.slug))
      .map(r => ({
        key: buildRouteKey(r.slug, r.displayRouteShortName),
        agencySlug: r.slug,
        routeShortName: r.displayRouteShortName,
        label: r.displayName ? nameCase(r.displayName, 'route') : r.displayRouteShortName,
        agencyName: agencyShortNameBySlug(agencies, r.slug),
      }));
  }, [visibleSlugs, agencies]);

  // Live-enabled places, for the coverage list shown when nothing is trackable here
  const livePlaces = useMemo(() => {
    return Object.keys(LIVE_AGENCY_BBOXES)
      .filter(slug => ELIGIBLE_SLUGS.has(slug))
      .map(slug => {
        const agency = agencies.find(a => a.slug === slug);
        return { slug, ...agencyNames({ name: agency?.name ?? LIVE_AGENCY_PLACES[slug] ?? slug, cities: agency?.cities, displayArea: agency?.displayArea }).card };
      })
      .sort((a, b) => a.primary.localeCompare(b.primary));
  }, [agencies]);

  const handlePlaceClick = useCallback((slug: string) => {
    const bounds = LIVE_AGENCY_BBOXES[slug];
    if (!bounds) return;
    setPlaceScope(slug);
    // Land safely above the tracking threshold so vehicles appear right away
    setFocusArea({ bounds, minZoom: MIN_LIVE_ZOOM + 0.2, ts: Date.now() });
  }, []);

  const offScreenOnly = displayedRouteGroups.length === 0 && routeGroups.length > 0;
  const sidebarRouteGroups = offScreenOnly ? (placeScope ? routeGroups.filter(g => g.agencySlug === placeScope) : routeGroups) : displayedRouteGroups;

  const multipleAgencies = useMemo(() => {
    const slugs = new Set(sidebarRouteGroups.map(g => g.agencySlug));
    return slugs.size > 1;
  }, [sidebarRouteGroups]);
  // CIV-2902 (#1797): the header dot's state by the shared rule (CIV-2084).
  const headerStatus = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    // CIV-2902 (Ryan's pick): the header names no agency, so its dot is the worst in view, as the bottom-right pill's.
    return worstLiveStatus((statusFeeds ?? []).map(f => liveAgencyStatus(f, nowSec)));
  }, [statusFeeds]);

  const renderRouteGroupList = (groups: RouteGroup[]) => {
    let lastSlug = '';
    let agencyHeaderIndex = 0;
    return groups.map(g => {
      const key = buildRouteKey(g.agencySlug, g.routeShortName);
      const isSelected = selectedRoute === key;
      const colors = getVehicleColors(g.dominantStatus, colorMode);
      const statusLabel = g.lateCount > 0
        ? `${g.lateCount} late`
        : g.earlyCount > 0
          ? `${g.earlyCount} early`
          : null;

      const showAgencyHeader = multipleAgencies && g.agencySlug !== lastSlug;
      lastSlug = g.agencySlug;
      // CIV-2042 (Ryan: a small "TTC" heading above the TTC routes and "MBTA" above Boston's): the short name.
      const agencyName = agencyShortNameBySlug(agencies, g.agencySlug);

      return (
        <React.Fragment key={key}>
          {showAgencyHeader && (
            <AgencyGroupHeader rule={agencyHeaderIndex++ > 0 ? 'above' : 'below'}>
              <AgencyName primary={agencyName} />
            </AgencyGroupHeader>
          )}
          <RouteListRow
            shortName={cleanRouteShortName(g.routeShortName)}
            name={routeListCompanionName(g.displayName, g.routeShortName)}
            selected={isSelected}
            onClick={() => handleRouteClick(key)}
            variant="spaced"
            right={
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <span className={`${LIST_ROW_DIM} shrink-0`}>{countOf(g.vehicles.length, 'vehicle')}</span>
                {statusLabel && (
                  <span style={{ color: colors.border }} className="text-xs font-bold">
                    · {statusLabel}
                  </span>
                )}
                <ChevronRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
              </div>
            }
          />
        </React.Fragment>
      );
    });
  };

  const handleRouteClick = useCallback((key: string) => {
    setSelectedRoute(prev => {
      if (prev === key) {
        setFocusedVehicle(null);
        return null;
      }
      const vehicles = vehiclesBySlug[splitRouteKey(key).agencySlug] ?? [];
      const v = vehicles.find(v => buildRouteKey(v.agencySlug, v.routeShortName) === key);
      if (v) setFocusedVehicle({ id: v.id, lat: v.lat, lon: v.lon, ts: Date.now() });
      return key;
    });
  }, [vehiclesBySlug]);

  // Data for route card view
  const selectedGroup = selectedRoute
    ? routeGroups.find(g => buildRouteKey(g.agencySlug, g.routeShortName) === selectedRoute) ?? null
    : null;
  const cardVehicle = vehicleCard && vehicleCard.routeKey === selectedRoute
    ? selectedGroup?.vehicles.find(v => v.id === vehicleCard.id) ?? null
    : null;
  // CIV-2024: the card's Updated row counts up each second while a vehicle card is open.
  const [cardNowSec, setCardNowSec] = useState(() => Date.now() / 1000);
  const cardClockOn = cardVehicle != null;
  useEffect(() => {
    if (!cardClockOn) return;
    setCardNowSec(Date.now() / 1000);
    const t = setInterval(() => setCardNowSec(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, [cardClockOn]);
  // The picked route's trip directions, kept on the route card and the vehicle card alike (a card opened from a link
  // has never shown the route card) (CIV-1068).
  const routeTrips = useLiveTripDirections(selectedGroup?.agencySlug ?? null, selectedGroup?.routeShortName ?? null, selectedGroup?.vehicles ?? NO_VEHICLES);
  useEffect(() => { setTripDirections(routeTrips.byVehicle); }, [routeTrips.byVehicle]);
  // The card's Direction and Ends at rows wait until the vehicles have been placed by their trips (and, below, until the
  // route's analysis has said short turn or branch), so it never shows the nearest-shape guess first.
  const cardDirectionsReady = routeTrips.settled && tripDirections === routeTrips.byVehicle;
  const selectedAgencyName = selectedGroup
    // The full feed name, not agencyDisplayName: RouteCardTitle's routeLabels keys agency-specific name rules on it.
    ? (agencies.find(a => a.slug === selectedGroup.agencySlug)?.name ?? selectedGroup.agencySlug)
    : null;

  // The selected route's long name and the feed's route_type (so the title reads the same as the regular route card's).
  const selectedRouteProps = useMemo(() => {
    const feature = selectedGroup ? routeFeature(selectedGroup.agencySlug, selectedGroup.routeShortName) : undefined;
    return (feature?.properties ?? null) as { routeLongName?: string | null; routeType?: number | null } | null;
  }, [selectedGroup, routeFeature]);
  const selectedRouteLongName = selectedRouteProps?.routeLongName ?? null;
  const selectedRouteType = selectedRouteProps?.routeType ?? null;
  // CIV-2024: the vehicle card's heading, the route's mode as the map reads it (CIV-1812), e.g. "Streetcar".
  const selectedRouteModeLabel = selectedRouteProps?.routeType == null || !selectedGroup ? null
    : knownModeLabel(effectiveMode({ ...(selectedRouteProps as EffectiveModeInput), agencySlug: selectedGroup.agencySlug }));

  // Vehicle word for the selected route's mode ("Streetcar 4508", not "Bus 4508")
  const modeWordFor = useCallback(
    (agencySlug: string, routeShortName: string) => {
      // The route's mode as the map reads it (CIV-1812): an LRT line or a monorail is a train, even when its feed type is tram.
      const props = routeFeature(agencySlug, routeShortName)?.properties as EffectiveModeInput | null | undefined;
      return vehicleModeWord(props?.routeType == null ? null : effectiveMode({ ...props, agencySlug }));
    },
    [routeFeature],
  );
  /**
   * CIV-2044: the noun a vehicle row leads with, "Streetcar 4632": the vehicle word, or the mode's own name where the
   * vehicle word alone would be "Vehicle" (a streetcar shows its bare number elsewhere, CIV-926).
   */
  const vehicleNounFor = useCallback(
    (agencySlug: string, routeShortName: string) => {
      const word = modeWordFor(agencySlug, routeShortName);
      if (word !== GENERIC_VEHICLE) return word;
      const props = routeFeature(agencySlug, routeShortName)?.properties as EffectiveModeInput | null | undefined;
      return (props?.routeType == null ? null : knownModeLabel(effectiveMode({ ...props, agencySlug }))) ?? word;
    },
    [modeWordFor, routeFeature],
  );
  const selectedRouteModeWord = useMemo(
    () => (selectedGroup ? modeWordFor(selectedGroup.agencySlug, selectedGroup.routeShortName) : 'Bus'),
    [selectedGroup, modeWordFor],
  );

  // Overlapping dots: the vehicles under the click that are still in the feed.
  const pickVehicles = useMemo(() => {
    if (!vehiclePick) return [];
    const byId = new Map(allVehicles.map(v => [v.id, v]));
    return vehiclePick.map(id => byId.get(id)).filter((v): v is LiveVehicle => !!v);
  }, [vehiclePick, allVehicles]);

  // Short turn or branch, from the route's Live analysis, read only while a vehicle card is open (CIV-1043).
  const { value: cardAnalysis, settled: cardAnalysisSettled } = useRouteAnalysis(selectedGroup?.agencySlug ?? null, selectedGroup?.routeShortName ?? null, !!cardVehicle);

  // Direction label lookup from GeoJSON features: the route's main destination per direction, i.e. the
  // headsign of its longest shape (a short turn like Roncesvalles must not rename the Humber direction).
  const directionLabels = useMemo(() => {
    if (!selectedGroup) return new Map<number, string>();
    const fc = routeLayer(selectedGroup.agencySlug);
    return fc ? new Map([...routeDirectionLabels(fc.features, selectedGroup.routeShortName)].map(([d, l]) => [d, streetJoin(l)])) : new Map<number, string>();
  }, [selectedGroup, routeLayer]);

  // Direction drill-down within a route
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  useEffect(() => { setSelectedDirection(null); }, [selectedRoute]);
  useLiveViewUrl({
    active, selectedRoute, cardVehicleId: cardVehicle?.id ?? null, selectedDirection, selectedGroup, pendingRouteRef,
    onRestore: (vehicle, group) => {
      if (vehicle) openVehicleCard(vehicle);
      if (group) setSelectedDirection(group);
    },
  });

  // The vehicles the list shows: every one on the route, as "Right now" shows every direction (CIV-2901 v3).
  const listVehicles = useMemo(() => selectedGroup?.vehicles ?? [], [selectedGroup]);

  // Group vehicles by destination; every listed vehicle lands in a group (see groupVehiclesByDirection).
  const vehiclesByDirection = useMemo(
    () => (selectedGroup ? groupVehiclesByDirection(listVehicles, directionLabels) : null),
    [selectedGroup, listVehicles, directionLabels],
  );

  // Worth showing groups when there is more than one, or the one group has a real destination name.
  const destination = selectedDirection;
  const canGroupByDirection = useMemo(() => {
    if (!vehiclesByDirection || vehiclesByDirection.size === 0) return false;
    if (vehiclesByDirection.size > 1) return true;
    // A sole group named only by the unnamed-direction fallback says nothing; a real name (even an agency's own
    // "Outbound") is worth showing.
    const [[soleKey, soleVehicles]] = [...vehiclesByDirection.entries()];
    return !soleVehicles.some(v => v.directionId != null && soleKey === directionBranchFallback(v.directionId));
  }, [vehiclesByDirection]);

  // Every vehicle stays on the map; a picked route keeps its own at full strength and fades the rest. A picked
  // direction, or the direction of the vehicle whose card is open, narrows that to the direction's vehicles.
  const focusDirection = focusDirectionKey(selectedDirection, cardVehicle, directionLabels);
  const focusIds = focusDirection ? (vehiclesByDirection?.get(focusDirection) ?? []).map(v => v.id).join(',') : null;
  const focus = useMemo<MapFocus | null>(() => {
    if (!selectedRoute) return null;
    const { agencySlug, routeId: routeShortName } = splitRouteKey(selectedRoute);
    return { agencySlug, routeShortName, ids: focusIds != null ? focusIds.split(',').filter(Boolean) : null };
  }, [selectedRoute, focusIds]);

  const cardVehicleId = cardVehicle?.id ?? null;
  // Update map overlay — no cleanup that nulls overlay (prevents zoom-reset on poll).
  // Fingerprint skips setOverlay when poll data is unchanged so MapCanvas/deck don't churn.
  const lastOverlayFpRef = useRef('');
  useEffect(() => {
    if (!active) {
      lastOverlayFpRef.current = '';
      return;
    }
    const fp = [
      liveVehiclesFingerprint(allVehicles),
      mapRouteKey ?? '',
      focus ? `${focus.agencySlug}::${focus.routeShortName}::${focus.ids?.join(',') ?? '*'}` : '',
      focusedVehicle?.id ?? '',
      focusedVehicle?.ts ?? '',
      vehicleFly?.ts ?? '',
      cardVehicleId ?? '',
      focusArea?.ts ?? '',
    ].join('::');
    if (fp === lastOverlayFpRef.current) return;
    lastOverlayFpRef.current = fp;
    setOverlay({
      vehicles: allVehicles, focusedVehicle, vehicleFly, vehicleCardId: cardVehicleId, mapRouteKey, focus, cardRef, focusArea,
      onMapClick: (_lonLat, vehicles) => {
        if (vehicles.length === 1) { openVehicleCard(vehicles[0]); return; }
        if (vehicles.length > 1) { setVehiclePick(vehicles.map(v => v.id)); return; }
        setVehiclePick(null);
      },
    });
  }, [active, allVehicles, focusedVehicle, vehicleFly, cardVehicleId, mapRouteKey, focus, focusArea, setOverlay]);


  // Observed vs scheduled headway line for the selected route ("Every ~7 min · scheduled every 6 min")
  const selectedRouteHeadwayLine = useMemo((): string | null => {
    if (!selectedGroup) return null;
    const observed = headwaysBySlug[selectedGroup.agencySlug]?.[selectedGroup.routeShortName];
    if (!observed || observed.samples < 3) return null;
    const gap = Math.round(observed.gapMin);

    // The route card's own number for the picked direction (#1234): pooled branches read as the card does.
    const fc = routeLayer(selectedGroup.agencySlug);
    const routeKey = fc ? routeKeyForShortName(selectedGroup.agencySlug, fc.features, selectedGroup.routeShortName, getNowDay()) : null;
    const scheduled = fc && routeKey
      ? liveScheduledHeadway(
        fc, routeKey, getNowDay(), periodKeyForHour(new Date().getHours()) ?? 'all', null,
        routeDirectionOverrides(agencies, selectedGroup.agencySlug, selectedGroup.routeShortName), null,
      )
      : null;

    return scheduled != null
      ? `${capitalizeFirst(headwayAbout(gap))} · scheduled ${headwayEvery(Math.round(scheduled))}`
      : capitalizeFirst(headwayAbout(gap));
  }, [selectedGroup, headwaysBySlug, routeLayer, agencies]);



  // A route picked (from a link or the address) that has no card: say why, never show nothing.
  const requestedRouteNote = useMemo((): string | null => {
    if (!selectedRoute || selectedGroup || isLoading) return null;
    const { agencySlug: slug, routeId: routeShortName } = splitRouteKey(selectedRoute);
    const agencyName = agencyShortNameBySlug(agencies, slug);
    if (!getPolledRoute(slug, routeShortName)) {
      const followed = LIVE_POLLING_ROUTES.filter(r => r.slug === slug).map(r => r.displayRouteShortName);
      return liveRouteEmptyNotice(agencyName, routeShortName, false, followed);
    }
    return liveRouteEmptyNotice(agencyName, routeShortName, true, []);
  }, [selectedRoute, selectedGroup, isLoading, agencies]);

  // A route or vehicle card opens in the map card's body; on phones, in its bottom sheet (as SidebarControls).
  const cardOpen = !!selectedGroup && pickVehicles.length <= 1;
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const sheetMode = isPhone && cardOpen;
  const { style: frameStyle } = useSidebarFrame();
  const { expanded: sheetExpanded, handle: sheetHandle } = useBottomSheet(cardOpen ? `${selectedRoute}|${cardVehicle?.id ?? ''}|${selectedDirection ?? ''}` : null);

  // CIV-1125 option D: how many vehicle rows fit in the card without it scrolling.
  // Listed along the route, first stop to last, so a cut-off is always the vehicles nearest the end (Ryan, CIV-1125).
  const allListed = useMemo(() => {
    const list = destination ? (vehiclesByDirection?.get(destination) ?? []) : listVehicles;
    const fc = selectedGroup ? routeLayer(selectedGroup.agencySlug) : undefined;
    return fc && selectedGroup ? orderAlongRoute(list, fc.features, selectedGroup.routeShortName) : list;
  }, [destination, vehiclesByDirection, listVehicles, selectedGroup, routeLayer]);
  const [fitCount, setFitCount] = useState<number | null>(null);
  // CIV-2901: the route card's vehicle list, closed until "N vehicles ›" is tapped; a new route or direction closes it.
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  useEffect(() => { setVehiclesOpen(false); }, [selectedRoute, selectedDirection]);
  const vehicleListRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setFitCount(null); }, [selectedRoute, selectedDirection, allListed.length]);
  // A taller window may fit them all again: measure afresh.
  useEffect(() => {
    const reset = () => setFitCount(null);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  useLayoutEffect(() => {
    const list = vehicleListRef.current;
    if (!list) return;
    let scroller: HTMLElement | null = list.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const overflow = scroller.scrollHeight - scroller.clientHeight;
    const rows = list.querySelectorAll<HTMLElement>(':scope > button, :scope > div[role]');
    if (overflow <= 0 || rows.length === 0) return;
    const rowH = rows[0].getBoundingClientRect().height || 50;
    const current = fitCount ?? allListed.length;
    // Room for the "and N other vehicles" line too.
    const next = Math.max(1, current - Math.ceil((overflow + 28) / rowH));
    if (next < current) setFitCount(next);
  });
  const shownVehicles = fitCount != null && fitCount < allListed.length ? allListed.slice(0, fitCount) : allListed;
  const hiddenVehicles = allListed.length - shownVehicles.length;

  const totalVehicles = allVehicles.length;
  const hasAnyError = errors.length > 0 && totalVehicles === 0;
  // CIV-1768: every feed in view down: the map's loading pill reads "Unable to load · Retrying in 12s".
  // #1812: these hooks run before the early return below, so leaving or opening Live keeps the hook count the same.
  const { setRetryAt } = useLiveFeedsDown();
  const feedsDownRetryAt = active && hasAnyError ? nextPollAt : null;
  useEffect(() => { setRetryAt(feedsDownRetryAt); }, [feedsDownRetryAt, setRetryAt]);
  useEffect(() => () => setRetryAt(null), [setRetryAt]);

  // CIV-2901 v3 (Ryan: "why are we not using the same code as in the regular app"): the route view is the map's own route
  // card (RouteCardHeadway), built by the map's own builders from the agency's route layer for today and the agency's
  // current period; Live's "Right now" and the vehicle list sit in the card's own section slot.
  const [cardPeriod, setCardPeriod] = useState<TimePeriod>('all');
  const [hoveredBranch, setHoveredBranch] = useState<HoveredBranch | null>(null);
  useEffect(() => {
    setCardPeriod(selectedGroup ? (periodKeyForHour(agencyHour(selectedGroup.agencySlug)) ?? 'all') : 'all');
    setHoveredBranch(null);
  }, [selectedRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeCard = useMemo(() => {
    if (!selectedGroup) return null;
    const slug = selectedGroup.agencySlug;
    const fc = routeLayer(slug);
    const day = getNowDay();
    const key = fc ? routeKeyForShortName(slug, fc.features, selectedGroup.routeShortName, day) : null;
    if (!fc || !key) return null;
    const layer = { [slug]: fc };
    const currentRoute = buildCurrentRoute(key, layer, day, cardPeriod);
    if (!currentRoute) return null;
    const { directionLabels: labelOverrides, directionHeadsigns } = routeDirectionOverrides(agencies, slug, selectedGroup.routeShortName);
    const agency = agencies.find(a => a.slug === slug);
    return {
      slug, fc, agency, currentRoute,
      variantFamily: routeVariantFamily(currentRoute, layer, day, cardPeriod),
      directionGroups: buildDirectionGroups(currentRoute, cardPeriod, labelOverrides, directionHeadsigns),
      ...routeCardFeedDates(agency),
    };
  }, [selectedGroup, routeLayer, agencies, cardPeriod]);
  // Each direction's own destination rows for "Right now" (CIV-2045), every direction at once.
  const scheduledRowsFor = useCallback((directionId: number, label: string) => (
    selectedGroup ? liveScheduledRowsNow(routeLayer(selectedGroup.agencySlug), agencies, selectedGroup.agencySlug, selectedGroup.routeShortName, { directionId, label }) : null
  ), [selectedGroup, routeLayer, agencies]);

  if (!active) return null;

  const hasLiveElsewhere = offScreenOnly && !query;
  const fade = selectionActive ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto';

  const cardDirectionLabel = cardVehicle?.directionId != null ? directionLabels.get(cardVehicle.directionId) : undefined;
  // The vehicle card is a few lines: on phones its sheet is only as tall as they are, up to the route card's short height (CIV-1413 D).
  const vehicleCardOpen = !!(selectedGroup && cardVehicle);
  // The report flag's title names the agency as the card's back link does (CIV-1795), never the address.
  const reportAgency = selectedGroup ? agencies.find(a => a.slug === selectedGroup.agencySlug) : undefined;
  const reportAgencyName = reportAgency ? agencyShortNameBySlug(agencies, reportAgency.slug) : null;
  // The same title on the vehicle card and the direction list.
  const routeCardTitle = selectedGroup ? (
    <RouteCardTitle
      routeShortName={selectedGroup.routeShortName}
      routeLongName={selectedRouteLongName}
      routeType={selectedRouteType}
      agencySlug={selectedGroup.agencySlug}
      agencyName={selectedAgencyName}
      onAgencyClick={onAgencyClick ? () => onAgencyClick(selectedGroup.agencySlug) : undefined}
      showAgency={false}
    />
  ) : null;
  // #1877 (Ryan: "I don't like how the Live vehicles is separate here from the regular destinations"): a destination row
  // of the route card carries its own vehicles, a count under its name that opens them.
  // MOCK for Ryan's review (#1877, not for merge): ?mock1877=a keeps "every X min" with the bus count under it;
  // ?mock1877=b puts the bus count in its place. Both leave out "Right now", so each destination shows once.
  const mock1877 = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mock1877') : null;
  // ?mock1877=c: "every X min" from the vehicles on the road now (a new number: each row's median live gap, the same gap
  // calculation as "Right now"'s longest gap), with the vehicle count and late count under it where "until 9:37 AM" goes.
  const [mockEvery, setMockEvery] = useState<ReadonlyMap<string, number>>(new Map());
  const onRowEvery = useCallback((_dir: number, every: ReadonlyMap<string, number>) => {
    if (!selectedGroup) return;
    setMockEvery(prev => {
      const next = new Map(prev);
      for (const [h, m] of every) { const k = rowDirectionKey(h, selectedGroup.routeShortName); if (k) next.set(k, m); }
      return next.size === prev.size && [...next].every(([k, v]) => prev.get(k) === v) ? prev : next;
    });
  }, [selectedGroup]);
  const liveRowFor = useCallback((feature: { headsign?: unknown }) => {
    if (!selectedGroup || !vehiclesByDirection || !canGroupByDirection) return null;
    const key = rowDirectionKey(feature.headsign, selectedGroup.routeShortName);
    const vehicles = key ? vehiclesByDirection.get(key) : undefined;
    if (mock1877 === 'c') {
      const every = key ? mockEvery.get(key) : undefined;
      const value = (
        <span className="flex flex-col items-end text-right whitespace-nowrap">
          {every != null && <span className="text-sm font-black text-[var(--text-primary)]">{headwayEvery(every)}</span>}
          <span className={every != null ? 'text-xs font-medium text-[var(--text-secondary)]' : 'text-sm font-black text-[var(--text-primary)]'}>{mockCountLine(vehicles ?? [], selectedRouteModeWord)}</span>
        </span>
      );
      if (!key || !vehicles?.length) return { key: `none:${String(feature.headsign)}`, value };
      return { key, value, onClick: () => setSelectedDirection(key) };
    }
    if (mock1877 === 'b') {
      const count = <span className="text-sm font-black text-[var(--text-primary)] whitespace-nowrap">{directionSummary(vehicles ?? [], selectedRouteModeWord)}</span>;
      if (!key || !vehicles?.length) return { key: `none:${String(feature.headsign)}`, value: count };
      return { key, value: count, onClick: () => setSelectedDirection(key) };
    }
    if (!key || !vehicles?.length) return null;
    return { key, subLabel: directionSummary(vehicles, selectedRouteModeWord), onClick: () => setSelectedDirection(key) };
  }, [selectedGroup, vehiclesByDirection, canGroupByDirection, selectedRouteModeWord, mock1877, mockEvery]);
  // Live's own sections of the route card, the same in the map's route card and in the fallback while its route layer
  // loads. `claimed`: the destinations the card's rows already carry (#1877); only the rest are listed here.
  const liveRouteSections = (claimed: ReadonlySet<string>) => {
    if (!selectedGroup) return null;
    const unclaimed = orderDirectionGroups(vehiclesByDirection ?? new Map(), directionLabels).filter(([dirKey]) => !claimed.has(dirKey));
    const grouped = selectedGroup.vehicles.length > 0 && canGroupByDirection && !destination;
    return (
    <>
      {(!mock1877 || mock1877 === 'c') && <div className={mock1877 === 'c' ? 'hidden' : undefined}><LiveRoutePerformance
        key={selectedRoute ?? ''}
        slug={selectedGroup.agencySlug}
        routeShortName={selectedGroup.routeShortName}
        vehicles={selectedGroup.vehicles}
        feedDegraded={!!degradedBySlug[selectedGroup.agencySlug] || !!errorBySlug[selectedGroup.agencySlug]}
        scheduledRowsFor={scheduledRowsFor}
        onRowEvery={mock1877 === 'c' ? onRowEvery : undefined}
      /></div>}
      {mock1877 === 'c' && (() => {
        // MOCK (#1877 mock C): with "Right now" gone, its stale note sits here, under the destination rows. It shows when the
        // newest vehicle report (each vehicle's own timestamp in the agency's feed) is over 2 min old; ?mockStale=1|2|3 forces
        // one of the wording options for the review page.
        const opt = new URLSearchParams(window.location.search).get('mockStale');
        const newest = Math.max(0, ...selectedGroup.vehicles.map(v => v.tsEpoch ?? 0));
        if (!newest || (!opt && Date.now() / 1000 - newest <= RIGHT_NOW_STALE_SEC)) return null;
        const at = agencyTime(selectedGroup.agencySlug, new Date(newest * 1000));
        const word = selectedRouteModeWord === 'bus' ? 'bus' : 'vehicle';
        const text = opt === '2' ? `Live positions as of ${at}` : opt === '3' ? `Last ${word} report ${at}` : `No ${word} has reported its position since ${at}`;
        return <CardHelpNotice message={text} />;
      })()}
      {!(grouped && unclaimed.length === 0) && <SidebarCardSection label={destination ?? (vehiclesOpen ? selectedRouteHeadwayLine : null) ?? undefined}>
        {/* Match static route cards: destinations first, live vehicles second. */}
        {selectedGroup.vehicles.length === 0 ? (
          <PanelEmpty>{LIVE_NO_VEHICLES_ON_ROUTE}</PanelEmpty>
        ) : grouped ? (
          unclaimed.map(([dirKey, vehicles]) => (
            <CardDirectionRow
              key={dirKey}
              label={dirKey}
              subLabel={directionSummary(vehicles, selectedRouteModeWord)}
              onClick={() => setSelectedDirection(dirKey)}
              chevron
            />
          ))
        ) : !vehiclesOpen && !destination ? (
          // CIV-2901 (mock v2): the vehicle list waits behind "N vehicles ›"; the counts per destination are in Right now above.
          <CardDirectionRow label={countOf(allListed.length, 'vehicle')} labelWeight="regular" chevron onClick={() => setVehiclesOpen(true)} />
        ) : (
          <div ref={vehicleListRef} className="space-y-2">
          {shownVehicles.map((v, i) => {
            const colors = getVehicleColors(v.status, colorMode);
            return (
              // The route card's direction row (CIV-1117 preview), with the vehicle's delay at the right end.
              <CardDirectionRow
                key={v.id}
                label={vehicleRowName(v, i, selectedRouteModeWord)}
                labelWeight="regular"
                singleLine
                onClick={() => {
                  setVehicleFly({ lat: v.lat, lon: v.lon, ts: Date.now() });
                  setFocusedVehicle({ id: v.id, lat: v.lat, lon: v.lon, ts: Date.now() });
                  setVehicleCard({ routeKey: buildRouteKey(v.agencySlug, v.routeShortName), id: v.id });
                }}
                // No status at all where the feed gives none (TTC streetcars), not an empty field (CIV-1043).
                // One line per vehicle (CIV-1125 option B): the speed beside the delay, at the right.
                value={(v.speedKmh != null || delayLabel(v)) ? (
                  <span className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap">
                    {v.speedKmh != null && <span className={CARD_NOTICE}>{speedText(v.speedKmh)}</span>}
                    {delayLabel(v) && (
                      <span
                        style={{ color: v.status === 'no_data' ? undefined : colors.border }}
                        className={`text-xs font-black ${v.status === 'no_data' ? 'text-[var(--text-muted)]' : ''}`}
                      >
                        {delayLabel(v)}
                      </span>
                    )}
                  </span>
                ) : undefined}
              />
            );
          })}
          {/* The card never scrolls: at the busiest times it lists as many vehicles as fit and counts the rest (all are on the map). */}
          {hiddenVehicles > 0 && <p className="text-xs font-bold text-[var(--text-dim)] pt-1">{andOthers(hiddenVehicles, 'vehicle')}</p>}
          </div>
        )}
      </SidebarCardSection>}
    </>
    );
  };
  const cardBody = selectedGroup && cardVehicle ? (
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        {/* Same header as the Live route card, with the report flag beside it as on the static route card (CIV-932). */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {/* CIV-2041: back to the list, titled "Live" whatever agencies are on screen. */}
            <CardBackLink onClick={() => { setVehicleCard(null); setSelectedRoute(null); setFocusedVehicle(null); }}>
              {LIVE_TAB_LABEL}
            </CardBackLink>
            {routeCardTitle}
          </div>
          <CardReportButton
            title={liveReportFlagTitle(reportAgencyName, agencies.length > 0, selectedGroup.routeShortName, vehicleRowName(cardVehicle, Math.max(0, allListed.findIndex(v => v.id === cardVehicle.id)), selectedRouteModeWord))}
            details={liveVehicleReportDetails({ agencySlug: selectedGroup.agencySlug, agencyName: selectedAgencyName ?? selectedGroup.agencySlug, routeShortName: selectedGroup.routeShortName, vehicle: cardVehicle })}
            showLiveReason
            excludeReasons={[REPORT_REASON.stop]}
          />
        </div>
      </SidebarCardHeaderBlock>
      {/* CIV-2024: the heading names the mode ("Streetcar", where the vehicle word alone would be "Vehicle"); the
          vehicle's number is the card's first row. */}
      <SidebarCardSection label={selectedRouteModeLabel ?? selectedRouteModeWord}>
        {placedRows(vehicleCardRows(cardVehicle, cardDirectionLabel, cardTripEnd(cardVehicle.headsign, cardDirectionLabel, cardAnalysis), cardNowSec), cardDirectionsReady && cardAnalysisSettled).map(row => (
          // #1876: the route card's direction row, as the vehicle list above uses it: the label in regular weight and only
          // the figure you scan for (the vehicle's early or late reading) in bold, the type rule of CIV-918.
          <CardDirectionRow
            key={row.label}
            label={row.label}
            labelWeight="regular"
            value={
              <span
                style={row.status && row.status !== 'no_data' ? { color: getVehicleColors(row.status, colorMode).border } : undefined}
                className={`text-xs leading-snug text-right min-w-0 ${row.status ? 'font-black' : 'font-normal text-[var(--text-primary)]'}`}
              >
                {row.tag ? (
                  // The name stays whole; the tag drops under it when both don't fit on one line.
                  <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                    <span>{row.value}</span>
                    <Tag className="whitespace-nowrap">{row.tag}</Tag>
                  </span>
                ) : row.value}
              </span>
            }
          />
        ))}
      </SidebarCardSection>
    </SidebarCardShell>
  ) : selectedGroup && routeCard ? (
    <RouteCardHeadway
      currentRoute={routeCard.currentRoute}
      agencyFeatures={routeCard.fc.features}
      variantFamily={routeCard.variantFamily}
      routeSlug={routeCard.slug}
      routeAgency={routeCard.agency}
      setSelectedAgencySlug={undefined}
      // A variant link names a map route key, which Live can't open; going back closes the card.
      setSelectedRoute={r => { if (r == null) { setSelectedRoute(null); setFocusedVehicle(null); } }}
      back={destination
        ? { to: agencyShortNameBySlug(agencies, selectedGroup.agencySlug), onClick: () => setSelectedDirection(null) }
        : { to: LIVE_TAB_LABEL, onClick: () => { setSelectedRoute(null); setFocusedVehicle(null); } }}
      // Live has no frequency filter, so every row shows as it is and no filter notice applies.
      maxHeadway={NO_HEADWAY_LIMIT}
      period={cardPeriod}
      setPeriod={setCardPeriod}
      directionGroups={routeCard.directionGroups}
      hideSpan={false}
      routeIsStale={routeCard.routeIsStale}
      selectedRouteOutOfFilter={false}
      hideFilterNotices
      expDateStr={routeCard.expDateStr}
      hoveredBranch={hoveredBranch}
      setHoveredBranch={setHoveredBranch}
      onInfoOpen={onInfoOpen}
      extra={liveRouteSections}
      rowLive={liveRowFor}
    />
  ) : selectedGroup ? (
    // The route layer hasn't loaded (or has no such route): Live's own header over the same sections.
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        {/* The same header in the direction list as on the route and vehicle cards; the back link goes up one level.
            The report flag sits beside it, as on the static route card (CIV-932). */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardBackLink
              onClick={destination
                ? () => setSelectedDirection(null)
                : () => { setSelectedRoute(null); setFocusedVehicle(null); }}
            >
              {/* CIV-2041 (Ryan: "1", "← Back to Live"): the list's own title, not the route's agency. */}
              {destination ? agencyShortNameBySlug(agencies, selectedGroup.agencySlug) : LIVE_TAB_LABEL}
            </CardBackLink>
            {routeCardTitle}
          </div>
          <CardReportButton
            title={liveReportFlagTitle(reportAgencyName, agencies.length > 0, selectedGroup.routeShortName)}
            details={liveRouteReportDetails({ agencySlug: selectedGroup.agencySlug, agencyName: selectedAgencyName ?? selectedGroup.agencySlug, routeShortName: selectedGroup.routeShortName, direction: selectedDirection, vehicles: allListed })}
            showLiveReason
            excludeReasons={[REPORT_REASON.stop]}
          />
        </div>
      </SidebarCardHeaderBlock>
      {liveRouteSections(new Set())}
    </SidebarCardShell>
  ) : null;

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none" inert={!active}>
      <SheetPortal on={sheetMode}>
      <div
        ref={cardRef}
        className={sheetMode
          ? `${BOTTOM_SHEET_FRAME} ${fade}`
          : `${PANEL_SIDEBAR} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100dvh-170px)] sm:max-h-[calc(100vh-132px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} ${fade}`}
        style={sheetMode ? undefined : frameStyle}
      >
        {cardOpen ? (
          // The report form takes the card's width (CIV-932), as History's card does (CIV-1117).
          <div data-report-anchor="true" className={sheetMode ? bottomSheetBodyClass(sheetExpanded, vehicleCardOpen ? BOTTOM_SHEET_FIT_CONTENT : undefined) : SIDEBAR_CARD_BODY}>
            {sheetMode && <BottomSheetHandle expanded={sheetExpanded} handle={sheetHandle} />}
            {cardBody}
          </div>
        ) : (
        <Panel enter>

          {/* Header */}
          {!selectedGroup && (
            <PanelTitleBar>
              {!isZoomedIn ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--text-dim)] shrink-0" />
              ) : headerStatus === 'live' && vehiclesInViewport > 0 ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-positive)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-positive)]" />
                </span>
              ) : headerStatus && headerStatus !== 'live' ? (
                // CIV-2902 (#1797): the shared Live / Delayed / Unavailable rule for the agency the header names (else the
                // worst in view), never green while that agency's vehicles can't be shown.
                <LiveStatusDot status={headerStatus} />
              ) : isLoading ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-caution)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-caution)]" />
                </span>
              ) : hasAnyError ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-negative)] shrink-0" />
              ) : hasLiveElsewhere ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-caution)] shrink-0" />
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--text-dim)] shrink-0" />
              )}
              {/* CIV-2902 (Ryan, 2026-11-24, "1"): the header just says "Live"; problems stay in the bottom-right pill. */}
              <span className={PANEL_TITLE}>{liveListTitle(null)}</span>
            </PanelTitleBar>
          )}

          {/* Content */}
          <PanelBody>
            {requestedRouteNote && <PanelEmpty>{requestedRouteNote}</PanelEmpty>}
            {pickVehicles.length > 1 ? (
              pickVehicles.map((v, i) => {
                const modeWord = modeWordFor(v.agencySlug, v.routeShortName);
                const colors = getVehicleColors(v.status, colorMode);
                // CIV-2044 (Ryan: "1", "Streetcar 4632 · 501"): each row is one vehicle, so it leads with the vehicle.
                const number = vehicleCardName(v, GENERIC_VEHICLE);
                return (
                  <RouteListRow
                    key={v.id}
                    shortName={number ? `${vehicleNounFor(v.agencySlug, v.routeShortName)} ${number}` : vehicleRowName(v, i, modeWord)}
                    name={`· ${cleanRouteShortName(v.routeShortName)}`}
                    onClick={() => openVehicleCard(v)}
                    variant="spaced"
                    right={delayLabel(v) ? (
                      <span
                        style={{ color: v.status === 'no_data' ? undefined : colors.border }}
                        className={`text-xs font-black shrink-0 whitespace-nowrap ml-3 ${v.status === 'no_data' ? 'text-[var(--text-muted)]' : ''}`}
                      >
                        {delayLabel(v)}
                      </span>
                    ) : undefined}
                  />
                );
              })
            ) : !isZoomedIn || (visibleSlugs.length === 0 && !isLoading) ? (
              <>
                <AgencyList>
                  {livePlaces.map(p => (
                    <AgencyListRow key={p.slug} primary={p.primary} secondary={p.secondary} onClick={() => handlePlaceClick(p.slug)} />
                  ))}
                </AgencyList>
                <BrowseLiveAgenciesLink onInfoOpen={onInfoOpen} />
              </>
            ) : isLoading && totalVehicles === 0 ? (
              <PanelEmpty kind="loading">{loadingText('live vehicles')}</PanelEmpty>
            ) : hasAnyError ? (
              // CIV-1768 (Ryan): every feed in view down reads only in the map's loading badge, "Unable to load ·
              // Retrying in 12s"; the panel adds no second line saying the same.
              null
            ) : displayedRouteGroups.length === 0 && routeGroups.length === 0 ? (
              query ? (
                <PanelEmpty>{LIVE_NO_ROUTE_MATCHES}</PanelEmpty>
              ) : (
                <>
                  <PanelEmpty detail={<CardHelpNotice message={LIVE_NOTHING_ACTIVE_HINT} />}>{LIVE_NOTHING_ACTIVE}</PanelEmpty>
                  {monitoredRoutes.length > 0 && (
                    <>
                      <div className={`${PANEL_SECTION_HEAD} border-t border-[var(--border-primary)]`}>
                        {LIVE_COVERED_ROUTES_HEADING}
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                        {monitoredRoutes.map(r => (
                          <Tag key={r.key} size="md">{r.agencyName} {r.label}</Tag>
                        ))}
                      </div>
                    </>
                  )}
                  <BrowseLiveAgenciesLink onInfoOpen={onInfoOpen} />
                </>
              )
            ) : (
              <>
                {offScreenOnly && !query && (
                  <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)]`}>
                    Outside this view · {countOf(totalVehicles, 'vehicle')}
                  </div>
                )}
                {renderRouteGroupList(sidebarRouteGroups)}
                {offScreenOnly && !query && (
                  <BrowseLiveAgenciesLink onInfoOpen={onInfoOpen} />
                )}
              </>
            )}
          </PanelBody>
        </Panel>
        )}
      </div>
      </SheetPortal>

      {/* Toolbar */}
      <div data-map-overlay="live-toolbar" className={`absolute top-6 right-6 ${Z_HEADER} flex items-center gap-1.5 pointer-events-auto`}>
        <button onClick={() => setLightMode(!lightMode)} className={ICON_BTN} aria-label={TOGGLE_DARK_MODE_LABEL}>
          {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        {onInfoOpen && (
          <button onClick={() => onInfoOpen('about')} className={ICON_BTN} aria-label={ABOUT_ATLAS}>
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
