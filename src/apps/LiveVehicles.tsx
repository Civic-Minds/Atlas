import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info, Moon, Sun, WifiOff, ArrowLeft, ChevronRight } from 'lucide-react';
import { useLiveVehiclesMapOverlay } from '../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { LIVE_POLLING_ROUTES, LIVE_AGENCY_BBOXES, LIVE_AGENCY_PLACES, hasLiveAnalysis, agencyHasLiveAnalysis } from '../../shared/livePollingConfig';
import { useViewport } from '../context/ViewportContext';
import type { OpenInfoFn } from '../components/InfoPanel';
import type { Agency } from '../App';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import { ICON_BTN, TRANSITION_SLOW, LIST_ROW_DIM, PANEL_SIDEBAR, Z_HEADER, SIDEBAR_LEFT_FALLBACK, PANEL_TITLE, PANEL_CARD_HEADER, PANEL_SECTION_HEAD, PANEL_EMPTY, SIDEBAR_PANEL_WIDTH } from '../styles';
import RouteListRow from '../components/RouteListRow';
import RouteCardTitle from '../components/RouteCardTitle';
import { getVehicleColors } from '../utils/colors';
import { useColorVision } from '../context/ColorVisionContext';
import { agencyDisplayParts, cleanRouteShortName, cleanRouteDisplayName, shortenAgencyName, agencyDisplayName, routeListCompanionName, liveVehicleRowLabel, vehicleModeWord } from '../utils/format';
import { branchDisplayPeriodHeadway } from '../utils/routeFacts';
import { periodKeyForHour } from '../../shared/config';
import { andOthers } from '../../shared/overflowText';
import { inferLiveDirection } from '../utils/liveDirection';
import { CHIP } from '../pageStyles';
import { CardDirectionRow, SidebarCardListRows, CARD_LIST_ROUTE } from '../components/Interval/cardUi';
import { liveVehiclesFingerprint } from '../utils/liveVehiclesFingerprint';
import { capitalizeFirst, delayAmount, headwayAbout, headwayEvery } from '../utils/headwayText';
import Panel, { PanelBody, PanelTitleBar } from '../components/ui/Panel';
import LiveRoutePerformance from '../components/Live/LiveRoutePerformance';
import { useLiveFeeds } from '../hooks/useLiveFeeds';
import { useLiveCardMapLink, useLiveRouteRequest, useLiveViewUrl } from '../hooks/useLiveView';
import { useSegmentDelay } from '../hooks/useSegmentDelay';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  active: boolean;
  onInfoOpen?: OpenInfoFn;
  query: string;
  layers?: Record<string, GeoJSON.FeatureCollection>;
  sidebarLeft?: number;
  selectionActive?: boolean;
  /** A route picked on the map or in a link, handed over from the main map. */
  routeRequest?: { slug: string; routeShortName: string; ts: number } | null;
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

// After this many consecutive failures (~45s), stop implying the feed will
// definitely recover — it may be structurally broken, not a transient blip.
const STUCK_FAIL_THRESHOLD = 3;

// Eligible slugs: no API key required, or explicitly marked active
const ELIGIBLE_SLUGS = new Set(
  LIVE_POLLING_ROUTES
    .filter(r => (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar) || r.active)
    .map(r => r.slug)
);

/** Schedule status for a vehicle, or '' when the feed gives none (never a "No data" placeholder). */
function delayLabel(v: LiveVehicle): string {
  if (v.statusLabel) return v.statusLabel;
  if (v.delayMin === null) return '';
  if (v.delayMin <= -1.5) return `${delayAmount(Math.round(Math.abs(v.delayMin)))} early`;
  if (v.delayMin >= 5.5) return `${delayAmount(Math.round(v.delayMin))} late`;
  return 'On time';
}

function BrowseLiveAgenciesLink({ onInfoOpen }: { onInfoOpen?: OpenInfoFn }) {
  if (!onInfoOpen) return null;
  return (
    <button
      type="button"
      onClick={() => onInfoOpen('agencies', { featureFilter: 'live' })}
      className="text-xs font-bold text-[var(--accent)] hover:underline px-4 pb-2"
    >
      Browse all live agencies
    </button>
  );
}

const MIN_LIVE_ZOOM = 9;

/** Direction work per polled vehicle, kept across zoom steps (see resolvedVehiclesBySlug). */
const resolvedDirections = new WeakMap<LiveVehicle, LiveVehicle>();

export default function LiveVehicles({ agencies, lightMode, setLightMode, active, onInfoOpen, query, layers = {}, sidebarLeft, selectionActive = false, routeRequest = null }: Props) {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const { setOverlay } = useLiveVehiclesMapOverlay();
  const { bounds, zoom } = useViewport();

  // Locally-fetched agency GeoJSON (fallback when Interval layers haven't loaded yet)
  const [localLayers, setLocalLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});


  // selectedRoute is a composite "slug::routeShortName" key
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const selectedRouteRef = useRef(selectedRoute);
  selectedRouteRef.current = selectedRoute;
  const [focusedVehicle, setFocusedVehicle] = useState<{ id: string; lat: number; lon: number; ts: number } | null>(null);
  const [focusArea, setFocusArea] = useState<{ bounds: [number, number, number, number]; minZoom?: number; ts: number } | null>(null);
  const { fitArea, highlight, setHighlight, zoomToStretch, registerMapClick, mapLineClickRef } = useLiveCardMapLink();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // With the performance card shown, the vehicle list folds behind one row.
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  // A route handed over from the main map (or a link), waiting for its agency to come into view.
  const pendingRouteRef = useRef<string | null>(null);

  const isZoomedIn = zoom !== null && zoom >= MIN_LIVE_ZOOM;

  // Agency picked from "Live in these places": the list shows only its routes, since
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

  const { vehiclesBySlug, headwaysBySlug, loadingBySlug, errorBySlug, failCountBySlug, degradedBySlug } = useLiveFeeds(active, visibleSlugs, visibleSlugKey);

  // Fill missing direction metadata from static directional route shapes. Some
  // GTFS-RT feeds provide vehicle positions without direction_id or headsign.
  const resolvedVehiclesBySlug = useMemo(() => {
    const resolved: Record<string, LiveVehicle[]> = {};
    for (const [slug, vehicles] of Object.entries(vehiclesBySlug)) {
      const fc = layers[slug] ?? localLayers[slug];
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
        const cached = resolvedDirections.get(vehicle);
        if (cached) return cached;
        const routeFeatures = featuresByRoute.get(vehicle.routeShortName) ?? [];
        const match = inferLiveDirection(vehicle, routeFeatures);
        const out = { ...vehicle, directionId: match.directionId, headsign: match.headsign };
        if (routeFeatures.length > 0) resolvedDirections.set(vehicle, out);
        return out;
      });
    }
    return resolved;
  }, [vehiclesBySlug, layers, localLayers]);

  useLiveRouteRequest({
    active, routeRequest, visibleSlugs, pendingRouteRef,
    open: key => { setFocusedVehicle(null); setSelectedRoute(key); },
    flyTo: slug => {
      const bbox = LIVE_AGENCY_BBOXES[slug];
      if (bbox) setFocusArea({ bounds: bbox, minZoom: MIN_LIVE_ZOOM + 0.2, ts: Date.now() });
    },
  });
  useEffect(() => { setHighlight(null); setDetailsOpen(false); setVehiclesOpen(false); }, [selectedRoute]);


  // Clear selected route when it's no longer in view
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug] = selectedRoute.split('::');
    if (!visibleSlugs.includes(slug)) {
      setSelectedRoute(null);
      setFocusedVehicle(null);
    }
  }, [visibleSlugs, selectedRoute]);

  const allVehicles = useMemo(() => Object.values(resolvedVehiclesBySlug).flat(), [resolvedVehiclesBySlug]);
  const isLoading = Object.values(loadingBySlug).some(Boolean);
  const errors = Object.values(errorBySlug).filter(Boolean) as string[];

  // Group failing agencies by identical message+stuck-state so "everyone's down
  // for the same reason" reads as one line instead of repeating per agency.
  const errorGroups = useMemo(() => {
    const groups = new Map<string, { message: string; stuck: boolean; agencyNames: string[] }>();
    for (const [slug, message] of Object.entries(errorBySlug)) {
      if (!message) continue;
      const stuck = (failCountBySlug[slug] ?? 0) >= STUCK_FAIL_THRESHOLD;
      const key = `${message}::${stuck}`;
      const agencyName = agencyDisplayName(agencies, slug);
      if (!groups.has(key)) groups.set(key, { message, stuck, agencyNames: [] });
      groups.get(key)!.agencyNames.push(agencyName);
    }
    return Array.from(groups.values());
  }, [errorBySlug, failCountBySlug, agencies]);

  // Fetch GeoJSON for any visible agency that has live vehicles and isn't loaded yet
  // (shared IDB/LRU path — same as Frequency / Corridors).
  useEffect(() => {
    const slugsNeeded = new Set<string>();
    if (selectedRoute) {
      const [slug] = selectedRoute.split('::');
      if (slug) slugsNeeded.add(slug);
    }
    for (const slug of Object.keys(vehiclesBySlug)) slugsNeeded.add(slug);
    for (const slug of slugsNeeded) {
      if (layers[slug] || localLayers[slug]) continue;
      const agency = agencies.find(a => a.slug === slug);
      if (!agency) continue;
      fetchAgencyGeo({ slug: agency.slug, name: agency.name, url: agency.url ?? '', betaOnly: agency.betaOnly })
        .then((data: GeoJSON.FeatureCollection) => setLocalLayers(prev => ({ ...prev, [slug]: data })))
        .catch(() => {});
    }
  }, [selectedRoute, vehiclesBySlug, layers, localLayers, agencies]);

  // Route shapes: show selected route only, or all active routes by default
  const routeFeatures = useMemo(() => {
    if (selectedRoute) {
      const [slug, rsn] = selectedRoute.split('::');
      if (!slug || !rsn) return [];
      const fc = layers[slug] ?? localLayers[slug];
      if (!fc || !hasLiveAnalysis(slug, rsn)) return [];
      return fc.features.filter(f => {
        const p = f.properties as any;
        return p && p.routeShortName === rsn;
      });
    }
    const result: GeoJSON.Feature[] = [];
    for (const [slug, vehicles] of Object.entries(vehiclesBySlug)) {
      const fc = layers[slug] ?? localLayers[slug];
      if (!fc) continue;
      const activeRSNs = new Set(vehicles.map(v => v.routeShortName).filter(rsn => hasLiveAnalysis(slug, rsn)));
      fc.features.forEach(f => {
        const p = f.properties as any;
        if (p && activeRSNs.has(p.routeShortName)) result.push(f);
      });
    }
    return result;
  }, [layers, localLayers, selectedRoute, vehiclesBySlug]);

  // Filter map overlay to selected route when one is active
  const overlayVehicles = useMemo(() => {
    if (!selectedRoute) return allVehicles;
    return allVehicles.filter(v => `${v.agencySlug}::${v.routeShortName}` === selectedRoute);
  }, [allVehicles, selectedRoute]);

  // Update map overlay — no cleanup that nulls overlay (prevents zoom-reset on poll).
  // Fingerprint skips setOverlay when poll data is unchanged so MapCanvas/deck don't churn.
  const lastOverlayFpRef = useRef('');
  useEffect(() => {
    if (!active) {
      lastOverlayFpRef.current = '';
      return;
    }
    const fp = [
      liveVehiclesFingerprint(overlayVehicles),
      selectedRoute ?? '',
      focusedVehicle?.id ?? '',
      focusedVehicle?.ts ?? '',
      routeFeatures.length,
      focusArea?.ts ?? '',
      fitArea?.ts ?? '',
      highlight?.length ?? 0,
      highlight?.[0]?.join(',') ?? '',
    ].join('::');
    if (fp === lastOverlayFpRef.current) return;
    lastOverlayFpRef.current = fp;
    setOverlay({
      vehicles: overlayVehicles, focusedVehicle, routeFeatures, selectedRouteKey: selectedRoute, focusArea, fitArea, highlight,
      onMapClick: (lonLat, vehicle, toleranceM) => {
        if (vehicle) {
          const key = `${vehicle.agencySlug}::${vehicle.routeShortName}`;
          if (key !== selectedRouteRef.current) setSelectedRoute(key);
          return;
        }
        mapLineClickRef.current?.(lonLat, toleranceM);
      },
    });
  }, [active, overlayVehicles, focusedVehicle, routeFeatures, selectedRoute, focusArea, fitArea, highlight, setOverlay]);


  // Clear overlay when deactivating or unmounting
  useEffect(() => {
    if (!active) setOverlay(null);
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
          (v.headsign && v.headsign.toLowerCase().includes(q))
        )
      : allVehicles;

    const map = new Map<string, LiveVehicle[]>();
    for (const v of filtered) {
      const key = `${v.agencySlug}::${v.routeShortName}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }

    const routeNamesByKey = new Map<string, string>();
    for (const [slug, collection] of Object.entries({ ...localLayers, ...layers })) {
      for (const feature of collection.features) {
        const properties = feature.properties as { routeShortName?: string | null; routeLongName?: string | null } | null;
        if (!properties?.routeShortName || !properties.routeLongName) continue;
        routeNamesByKey.set(`${slug}::${properties.routeShortName}`, properties.routeLongName);
      }
    }

    return [...map.entries()]
      .sort(([keyA], [keyB]) => {
        const [slugA, rsnA] = keyA.split('::');
        const [slugB, rsnB] = keyB.split('::');
        if (slugA !== slugB) return slugA.localeCompare(slugB);
        const numA = parseInt(rsnA), numB = parseInt(rsnB);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return rsnA.localeCompare(rsnB);
      })
      .map(([key, vs]) => {
        const [agencySlug, routeShortName] = key.split('::');
        const lateCount = vs.filter(v => v.status === 'late').length;
        const earlyCount = vs.filter(v => v.status === 'early').length;
        const dominantStatus: LiveVehicle['status'] =
          lateCount > 0 ? 'late' : earlyCount > 0 ? 'early' : vs[0].status;
        const displayName = cleanRouteDisplayName(
          routeNamesByKey.get(`${agencySlug}::${routeShortName}`) || vs[0].displayName || `Route ${routeShortName}`,
          routeShortName,
        );
        return { agencySlug, routeShortName, displayName, vehicles: vs, lateCount, earlyCount, dominantStatus };
      });
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
        key: `${r.slug}::${r.displayRouteShortName}`,
        agencySlug: r.slug,
        routeShortName: r.displayRouteShortName,
        label: r.displayName ?? r.displayRouteShortName,
        agencyName: shortenAgencyName(agencies.find(a => a.slug === r.slug)?.name ?? r.slug),
      }));
  }, [visibleSlugs, agencies]);

  // Live-enabled places, for the coverage list shown when nothing is trackable here
  const livePlaces = useMemo(() => {
    return Object.keys(LIVE_AGENCY_BBOXES)
      .filter(slug => ELIGIBLE_SLUGS.has(slug))
      .map(slug => ({
        slug,
        place: LIVE_AGENCY_PLACES[slug] ?? slug,
        agencyName: shortenAgencyName(agencies.find(a => a.slug === slug)?.name ?? ''),
        withPerformance: agencyHasLiveAnalysis(slug),
      }))
      .sort((a, b) => a.place.localeCompare(b.place));
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

  const renderRouteGroupList = (groups: RouteGroup[]) => {
    let lastSlug = '';
    let agencyHeaderIndex = 0;
    return groups.map(g => {
      const key = `${g.agencySlug}::${g.routeShortName}`;
      const isSelected = selectedRoute === key;
      const colors = getVehicleColors(g.dominantStatus, colorMode);
      const statusLabel = g.lateCount > 0
        ? `${g.lateCount} late`
        : g.earlyCount > 0
          ? `${g.earlyCount} early`
          : null;

      const showAgencyHeader = multipleAgencies && g.agencySlug !== lastSlug;
      lastSlug = g.agencySlug;
      const agency = agencies.find(a => a.slug === g.agencySlug);
      const rawAgencyName = agency?.name ?? g.agencySlug;
      const { primary: agencyName, secondary: agencyPlace } = agencyDisplayParts(rawAgencyName, agency?.cities, agency?.displayArea);

      return (
        <React.Fragment key={key}>
          {showAgencyHeader && (
            <div className={`${PANEL_SECTION_HEAD} ${agencyHeaderIndex++ > 0 ? 'border-t' : 'border-b'} border-[var(--border-primary)]`}>
              {agencyName}
              {agencyPlace && <span className="font-normal text-[var(--text-dim)]"> · {agencyPlace}</span>}
            </div>
          )}
          <RouteListRow
            shortName={cleanRouteShortName(g.routeShortName)}
            name={routeListCompanionName(g.displayName, g.routeShortName)}
            selected={isSelected}
            onClick={() => handleRouteClick(key)}
            variant="spaced"
            right={
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <span className={`${LIST_ROW_DIM} shrink-0`}>{g.vehicles.length} veh</span>
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
      const vehicles = vehiclesBySlug[key.split('::')[0]] ?? [];
      const v = vehicles.find(v => `${v.agencySlug}::${v.routeShortName}` === key);
      if (v) setFocusedVehicle({ id: v.id, lat: v.lat, lon: v.lon, ts: Date.now() });
      return key;
    });
  }, [vehiclesBySlug]);

  // Data for route card view
  const selectedGroup = selectedRoute
    ? routeGroups.find(g => `${g.agencySlug}::${g.routeShortName}` === selectedRoute) ?? null
    : null;
  const performance = useSegmentDelay(selectedGroup?.agencySlug, selectedGroup?.routeShortName);
  const selectedAgencyName = selectedGroup
    ? (agencies.find(a => a.slug === selectedGroup.agencySlug)?.name ?? selectedGroup.agencySlug)
    : null;

  // Look up route long name from loaded GeoJSON layers for the selected route
  const selectedRouteLongName = useMemo(() => {
    if (!selectedGroup) return null;
    const fc = layers[selectedGroup.agencySlug] ?? localLayers[selectedGroup.agencySlug];
    if (!fc) return null;
    const feature = fc.features.find(f => (f.properties as any)?.routeShortName === selectedGroup.routeShortName);
    return (feature?.properties as any)?.routeLongName ?? null;
  }, [selectedGroup, layers, localLayers]);

  // Vehicle word for the selected route's mode ("Streetcar 4508", not "Bus 4508")
  const selectedRouteModeWord = useMemo(() => {
    if (!selectedGroup) return 'Bus';
    const fc = layers[selectedGroup.agencySlug] ?? localLayers[selectedGroup.agencySlug];
    const feature = fc?.features.find(f => (f.properties as any)?.routeShortName === selectedGroup.routeShortName);
    return vehicleModeWord((feature?.properties as any)?.routeType);
  }, [selectedGroup, layers, localLayers]);

  // Direction label lookup from GeoJSON features (headsign per directionId)
  const directionLabels = useMemo(() => {
    if (!selectedGroup) return new Map<number, string>();
    const fc = layers[selectedGroup.agencySlug] ?? localLayers[selectedGroup.agencySlug];
    if (!fc) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const f of fc.features) {
      const p = f.properties as any;
      if (!p || p.routeShortName !== selectedGroup.routeShortName) continue;
      if (p.directionId != null && p.headsign) map.set(Number(p.directionId), String(p.headsign));
    }
    return map;
  }, [selectedGroup, layers, localLayers]);

  // Direction drill-down within a route
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  useEffect(() => { setSelectedDirection(null); }, [selectedRoute]);
  useLiveViewUrl({
    active, selectedRoute, focusedVehicle, selectedDirection, selectedGroup, pendingRouteRef,
    onRestore: (vehicle, group) => {
      if (vehicle) setFocusedVehicle({ id: vehicle.id, lat: vehicle.lat, lon: vehicle.lon, ts: Date.now() });
      if (group) { setSelectedDirection(group); setVehiclesOpen(true); }
    },
  });

  // Group vehicles by headsign if available, else by directionId
  const vehiclesByDirection = useMemo(() => {
    if (!selectedGroup) return null;
    const useHeadsign = selectedGroup.vehicles.some(v => v.headsign);
    const map = new Map<string, LiveVehicle[]>();
    for (const v of selectedGroup.vehicles) {
      // A car whose direction can't be told is left out of the groups (no "Unknown" group).
      const key = useHeadsign ? v.headsign : v.directionId != null ? String(v.directionId) : null;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return map;
  }, [selectedGroup]);

  // True when we can actually show meaningful direction groups (more than one, or one with a real label)
  const canGroupByDirection = useMemo(() => {
    if (!vehiclesByDirection) return false;
    if (vehiclesByDirection.size === 0) return false;
    if (vehiclesByDirection.size > 1) return true;
    const [soleKey] = [...vehiclesByDirection.keys()];
    const useHeadsign = selectedGroup?.vehicles.some(v => v.headsign) ?? false;
    if (!useHeadsign) {
      const label = directionLabels.get(parseInt(soleKey));
      if (!label) return false; // no label from GeoJSON either — not useful
    }
    return true;
  }, [vehiclesByDirection, directionLabels, selectedGroup]);

  const useHeadsignGrouping = useMemo(
    () => selectedGroup?.vehicles.some(v => v.headsign) ?? false,
    [selectedGroup]
  );

  const getDirectionLabel = (key: string): string => {
    if (useHeadsignGrouping) return key;
    const dirId = parseInt(key);
    return directionLabels.get(dirId) ?? (dirId === 0 ? 'Outbound' : 'Inbound');
  };

  // Observed vs scheduled headway line for the selected route ("Every ~7 min · scheduled every 6 min")
  const selectedRouteHeadwayLine = useMemo((): string | null => {
    if (!selectedGroup) return null;
    const observed = headwaysBySlug[selectedGroup.agencySlug]?.[selectedGroup.routeShortName];
    if (!observed || observed.samples < 3) return null;
    const gap = Math.round(observed.gapMin);

    const fc = layers[selectedGroup.agencySlug] ?? localLayers[selectedGroup.agencySlug];
    let scheduled: number | null = null;
    if (fc) {
      const now = new Date();
      const day = now.getDay() === 0 ? 'Sunday' : now.getDay() === 6 ? 'Saturday' : 'Weekday';
      const hour = now.getHours();
      const vehicleHeadsigns = new Set(selectedGroup.vehicles.map(v => v.headsign).filter((h): h is string => !!h));
      for (const f of fc.features) {
        const p = f.properties as any;
        if (!p || p.routeShortName !== selectedGroup.routeShortName) continue;
        if (p.day && p.day !== day) continue;
        if (vehicleHeadsigns.size > 0 && p.headsign && !vehicleHeadsigns.has(p.headsign)) continue;
        const hw = branchDisplayPeriodHeadway(p, periodKeyForHour(hour) ?? 'all');
        if (hw != null && (scheduled === null || Number(hw) < scheduled)) scheduled = Number(hw);
      }
    }

    return scheduled != null
      ? `${capitalizeFirst(headwayAbout(gap))} · scheduled ${headwayEvery(Math.round(scheduled))}`
      : capitalizeFirst(headwayAbout(gap));
  }, [selectedGroup, headwaysBySlug, layers, localLayers]);

  if (!active) return null;

  const totalVehicles = allVehicles.length;
  const hasAnyError = errors.length > 0 && totalVehicles === 0;
  const hasLiveElsewhere = offScreenOnly && !query;

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none" inert={!active}>
      <div
        className={`${PANEL_SIDEBAR} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100dvh-170px)] sm:max-h-[calc(100vh-92px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} ${selectionActive ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
        style={{ '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px` } as React.CSSProperties}
      >
        <Panel enter>

          {/* Header */}
          {selectedGroup ? (
            <div className={PANEL_CARD_HEADER}>
              <button
                onClick={selectedDirection
                  ? () => setSelectedDirection(null)
                  : () => { setSelectedRoute(null); setFocusedVehicle(null); }}
                className="p-0.5 -ml-0.5 mt-0.5 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                aria-label={selectedDirection ? 'Back to directions' : 'Back to route list'}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <RouteCardTitle
                routeShortName={selectedGroup.routeShortName}
                routeLongName={selectedRouteLongName}
                agencyName={selectedAgencyName}
              />
            </div>
          ) : (
            <PanelTitleBar>
              {!isZoomedIn ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--text-dim)] shrink-0" />
              ) : vehiclesInViewport > 0 ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-positive)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-positive)]" />
                </span>
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
              <span className={PANEL_TITLE}>Live</span>
            </PanelTitleBar>
          )}

          {/* Content */}
          <PanelBody>
            {selectedGroup ? (
              <>
              <div className="px-4 pt-4">
                <LiveRoutePerformance
                  key={selectedRoute ?? ''}
                  slug={selectedGroup.agencySlug}
                  routeShortName={selectedGroup.routeShortName}
                  feedDegraded={!!degradedBySlug[selectedGroup.agencySlug] || !!errorBySlug[selectedGroup.agencySlug]}
                  onZoom={zoomToStretch}
                  onHighlight={setHighlight}
                  registerMapClick={registerMapClick}
                  onDetailsChange={setDetailsOpen}
                />
              </div>
              {!detailsOpen && performance && (
                <button
                  type="button"
                  onClick={() => setVehiclesOpen(o => !o)}
                  aria-expanded={vehiclesOpen}
                  className="mx-4 mt-3 mb-4 pt-3 w-[calc(100%-2rem)] border-t border-[var(--border-primary)] flex items-center justify-between text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <span>Vehicles · {selectedGroup.vehicles.length}</span>
                  <ChevronRight className={`w-3 h-3 transition-transform ${vehiclesOpen ? 'rotate-90' : ''}`} />
                </button>
              )}
              {!detailsOpen && (!performance || vehiclesOpen) && (
              <div className="px-4 py-4">
                {!performance && (
                  <div className="text-xs font-bold text-[var(--text-muted)] mb-3">Route performance isn't available for this route</div>
                )}
                {selectedRouteHeadwayLine && (
                  <div className="text-xs font-black text-[var(--text-dim)] mb-4">
                    {selectedRouteHeadwayLine}
                  </div>
                )}
                {/* Match static route cards: destinations first, live vehicles second. */}
                {selectedGroup.vehicles.length === 0 ? (
                  <p className={`${PANEL_EMPTY} text-center`}>No vehicles on this route</p>
                ) : canGroupByDirection && !selectedDirection ? (
                  <SidebarCardListRows>
                    {[...(vehiclesByDirection ?? [])].map(([dirKey, vehicles]) => {
                      const label = getDirectionLabel(dirKey);
                      const preview = vehicles.slice(0, 3);
                      const extra = vehicles.length - preview.length;
                      return (
                        <div key={dirKey} className="relative pr-4">
                          <CardDirectionRow
                            label={label}
                            subLabel={preview.some(v => delayLabel(v))
                              ? `${preview.map(delayLabel).filter(Boolean).join(' · ')}${extra > 0 ? ` · ${andOthers(extra, 'vehicle')}` : ''}`
                              : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`}
                            onClick={() => setSelectedDirection(dirKey)}
                          />
                          <ChevronRight className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-dim)]" />
                        </div>
                      );
                    })}
                  </SidebarCardListRows>
                ) : (
                  <SidebarCardListRows>
                    {(selectedDirection
                      ? (vehiclesByDirection?.get(selectedDirection) ?? [])
                      : selectedGroup.vehicles
                    ).map((v, i) => {
                      const colors = getVehicleColors(v.status, colorMode);
                      return (
                        <div key={v.id} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`${CARD_LIST_ROUTE} truncate`}>
                              {liveVehicleRowLabel(v, i, selectedRouteModeWord)}
                            </p>
                            {v.speedKmh != null && (
                              <p className="text-xs font-bold text-[var(--text-dim)] mt-0.5">{v.speedKmh} km/h</p>
                            )}
                          </div>
                          <span
                            style={{ color: v.status === 'no_data' ? undefined : colors.border }}
                            className={`text-xs font-black shrink-0 whitespace-nowrap ${v.status === 'no_data' ? 'text-[var(--text-muted)]' : ''}`}
                          >
                            {delayLabel(v)}
                          </span>
                        </div>
                      );
                    })}
                  </SidebarCardListRows>
                )}
              </div>
              )}
              </>
            ) : !isZoomedIn || (visibleSlugs.length === 0 && !isLoading) ? (
              <>
                <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)]`}>
                  Live in these places
                </div>
                {livePlaces.map(p => (
                  <RouteListRow
                    key={p.slug}
                    shortName={p.place}
                    name={p.agencyName}
                    variant="spaced"
                    onClick={() => handlePlaceClick(p.slug)}
                    subtitle={(
                      <span className={`${CHIP} inline-block mt-1.5 whitespace-nowrap`}>{p.withPerformance ? 'Vehicles + performance' : 'Vehicles'}</span>
                    )}
                    right={<ChevronRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0" />}
                  />
                ))}
                <BrowseLiveAgenciesLink onInfoOpen={onInfoOpen} />
              </>
            ) : isLoading && totalVehicles === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6">
                <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-xs font-bold text-[var(--text-muted)]">Loading feed…</span>
              </div>
            ) : hasAnyError ? (
              <div className="py-6 text-center px-4 flex flex-col items-center gap-3">
                <WifiOff className="w-5 h-5 text-[var(--text-dim)]" />
                {(() => {
                  const totalFailing = errorGroups.reduce((n, g) => n + g.agencyNames.length, 0);
                  const allStuck = errorGroups.every(g => g.stuck);
                  // Naming every agency only helps when there's one to name — once
                  // everything in view is down, a single generic line reads cleaner.
                  if (totalFailing === 1) {
                    const { message, stuck, agencyNames } = errorGroups[0];
                    return (
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{agencyNames[0]}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                          {message}
                          {stuck ? ' — still trying, but this has been down for a while.' : ' It will retry automatically.'}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Live feeds unavailable</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                        {allStuck
                          ? 'Still trying, but these have been down for a while.'
                          : "Can't reach the live feeds in this area right now. They'll retry automatically."}
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : displayedRouteGroups.length === 0 && routeGroups.length === 0 ? (
              query ? (
                <p className={`${PANEL_EMPTY} text-center`}>No routes match your search.</p>
              ) : (
                <div className="py-5 px-4 flex flex-col gap-3">
                  <div className="text-center">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Nothing active on tracked routes</p>
                    <p className="text-xs font-bold text-[var(--text-muted)] mt-1 leading-relaxed">
                      Buses appear here when they are running on a monitored route.
                    </p>
                  </div>
                  {monitoredRoutes.length > 0 && (
                    <>
                      <div className={`${PANEL_SECTION_HEAD} border-t border-[var(--border-primary)]`}>
                        Tracking in this area
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 pb-1">
                        {monitoredRoutes.map(r => (
                          <span
                            key={r.key}
                            className="text-xs font-bold text-[var(--text-muted)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2.5 py-1"
                          >
                            {r.agencyName} {r.label}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  <BrowseLiveAgenciesLink onInfoOpen={onInfoOpen} />
                </div>
              )
            ) : (
              <>
                {errors.length > 0 && (
                  <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-primary)] text-xs font-bold text-[var(--status-caution-text)]">
                    <WifiOff className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {Object.entries(errorBySlug)
                        .filter((entry): entry is [string, string] => Boolean(entry[1]))
                        .map(([slug]) => agencies.find(a => a.slug === slug)?.name ?? slug)
                        .join(', ')} unreachable
                    </span>
                  </div>
                )}
                {offScreenOnly && !query && (
                  <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)]`}>
                    Outside this view · {totalVehicles} vehicle{totalVehicles === 1 ? '' : 's'}
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
      </div>

      {/* Toolbar */}
      <div className={`absolute top-6 right-6 ${Z_HEADER} flex items-center gap-1.5 pointer-events-auto`}>
        <button onClick={() => setLightMode(!lightMode)} className={ICON_BTN} aria-label="Toggle light mode">
          {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        {onInfoOpen && (
          <button onClick={() => onInfoOpen('about')} className={ICON_BTN} aria-label="About Atlas">
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
