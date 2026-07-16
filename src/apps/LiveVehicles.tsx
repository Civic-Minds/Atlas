import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info, Moon, Sun, WifiOff, ArrowLeft, ChevronRight } from 'lucide-react';
import { useLiveVehiclesMapOverlay } from '../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { LIVE_POLLING_ROUTES, LIVE_AGENCY_BBOXES, LIVE_AGENCY_PLACES } from '../../shared/livePollingConfig';
import { useViewport } from '../context/ViewportContext';
import type { OpenInfoFn } from '../components/InfoPanel';
import type { Agency } from '../App';
import { getAgencyArtifactUrls } from '../../shared/config';
import { FLOATING_CARD, PANEL_ENTER, ICON_BTN, TRANSITION_SLOW, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM, Z_PANEL, Z_HEADER, SIDEBAR_LEFT_FALLBACK, PANEL_TITLE_BAR, PANEL_TITLE, PANEL_CARD_HEADER, PANEL_SECTION_HEAD, PANEL_BODY, PANEL_EMPTY, SIDEBAR_PANEL_WIDTH } from '../styles';
import RouteListRow from '../components/RouteListRow';
import RouteCardTitle from '../components/RouteCardTitle';
import { STATUS_COLORS } from '../utils/colors';
import { cleanRouteShortName, cleanRouteDisplayName, shortenAgencyName, agencyDisplayName, routeListCompanionName, liveVehicleRowLabel, vehicleModeWord } from '../utils/format';
import { buildRouteServiceSummary } from '../utils/routeFacts';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  active: boolean;
  onInfoOpen?: OpenInfoFn;
  query: string;
  layers?: Record<string, GeoJSON.FeatureCollection>;
  sidebarLeft?: number;
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

const POLL_INTERVAL_MS = 15_000;
// After this many consecutive failures (~45s), stop implying the feed will
// definitely recover — it may be structurally broken, not a transient blip.
const STUCK_FAIL_THRESHOLD = 3;

// Eligible slugs: no API key required, or explicitly marked active
const ELIGIBLE_SLUGS = new Set(
  LIVE_POLLING_ROUTES
    .filter(r => (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar) || r.active)
    .map(r => r.slug)
);

function delayLabel(v: LiveVehicle): string {
  if (v.statusLabel) return v.statusLabel;
  if (v.delayMin === null) return 'No data';
  if (v.delayMin <= -1.5) return `${Math.round(Math.abs(v.delayMin))}m early`;
  if (v.delayMin >= 5.5) return `${Math.round(v.delayMin)}m late`;
  return 'On time';
}

function BrowseLiveAgenciesLink({ onInfoOpen }: { onInfoOpen?: OpenInfoFn }) {
  if (!onInfoOpen) return null;
  return (
    <button
      type="button"
      onClick={() => onInfoOpen('agencies', { featureFilter: 'live' })}
      className="text-[10px] font-bold text-[var(--accent)] hover:underline px-4 pb-2"
    >
      Browse all live agencies
    </button>
  );
}

const MIN_LIVE_ZOOM = 9;

export default function LiveVehicles({ agencies, lightMode, setLightMode, active, onInfoOpen, query, layers = {}, sidebarLeft }: Props) {
  const { setOverlay } = useLiveVehiclesMapOverlay();
  const { bounds, zoom } = useViewport();

  // Per-agency vehicle state
  const [vehiclesBySlug, setVehiclesBySlug] = useState<Record<string, LiveVehicle[]>>({});
  // Observed headways from the API: slug → routeShortName → { gapMin, samples }
  const [headwaysBySlug, setHeadwaysBySlug] = useState<Record<string, Record<string, { gapMin: number; samples: number }>>>({});
  const [loadingBySlug, setLoadingBySlug] = useState<Record<string, boolean>>({});
  const [errorBySlug, setErrorBySlug] = useState<Record<string, string | null>>({});
  // Consecutive failures per slug — used to soften "will retry automatically"
  // once a feed has clearly been down for a while, not just a blip.
  const [failCountBySlug, setFailCountBySlug] = useState<Record<string, number>>({});
  const [degradedBySlug, setDegradedBySlug] = useState<Record<string, string | null>>({});

  // Locally-fetched agency GeoJSON (fallback when Interval layers haven't loaded yet)
  const [localLayers, setLocalLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});

  // selectedRoute is a composite "slug::routeShortName" key
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [focusedVehicle, setFocusedVehicle] = useState<{ id: string; lat: number; lon: number; ts: number } | null>(null);
  const [focusArea, setFocusArea] = useState<{ bounds: [number, number, number, number]; minZoom?: number; ts: number } | null>(null);

  const isZoomedIn = zoom !== null && zoom >= MIN_LIVE_ZOOM;

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

  const visibleSlugKey = useMemo(() => [...visibleSlugs].sort().join(','), [visibleSlugs]);

  const fetchForSlug = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/live-vehicles?agency=${slug}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Can't reach this feed right now.");
      }
      const data = await res.json();
      const tagged: LiveVehicle[] = (data.vehicles || []).map((v: any) => ({ ...v, agencySlug: slug }));
      setVehiclesBySlug(prev => ({ ...prev, [slug]: tagged }));
      setHeadwaysBySlug(prev => ({ ...prev, [slug]: data.headways || {} }));
      setErrorBySlug(prev => ({ ...prev, [slug]: null }));
      setFailCountBySlug(prev => (prev[slug] ? { ...prev, [slug]: 0 } : prev));
      setDegradedBySlug(prev => ({ ...prev, [slug]: data.degraded ? (data.degradedReason ?? 'Some data unavailable') : null }));
    } catch (err: any) {
      setErrorBySlug(prev => ({ ...prev, [slug]: err.message || 'Feed unavailable' }));
      setFailCountBySlug(prev => ({ ...prev, [slug]: (prev[slug] ?? 0) + 1 }));
    }
  }, []);

  // Start/stop polling when visible slugs change
  useEffect(() => {
    if (!active || visibleSlugs.length === 0) {
      setVehiclesBySlug({});
      setHeadwaysBySlug({});
      setLoadingBySlug({});
      setErrorBySlug({});
      setFailCountBySlug({});
      setDegradedBySlug({});
      return;
    }

    // Initial fetch
    const loading: Record<string, boolean> = {};
    visibleSlugs.forEach(s => (loading[s] = true));
    setLoadingBySlug(loading);
    Promise.all(visibleSlugs.map(s => fetchForSlug(s))).finally(() =>
      setLoadingBySlug(prev => {
        const next = { ...prev };
        visibleSlugs.forEach(s => (next[s] = false));
        return next;
      })
    );

    const pollId = setInterval(() => visibleSlugs.forEach(fetchForSlug), POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollId);
      // Clear stale data for slugs that left the viewport
      setVehiclesBySlug(prev => {
        const keep = new Set(visibleSlugs);
        const next: typeof prev = {};
        for (const [s, v] of Object.entries(prev)) {
          if (keep.has(s)) next[s] = v;
        }
        return next;
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, visibleSlugKey, fetchForSlug]);

  // Clear selected route when it's no longer in view
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug] = selectedRoute.split('::');
    if (!visibleSlugs.includes(slug)) {
      setSelectedRoute(null);
      setFocusedVehicle(null);
    }
  }, [visibleSlugs, selectedRoute]);

  const allVehicles = useMemo(() => Object.values(vehiclesBySlug).flat(), [vehiclesBySlug]);
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
      const arts = getAgencyArtifactUrls(agency.slug);
      const geoUrl = agency.url || arts.url;
      fetch(geoUrl)
        .then(r => r.json())
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
      if (!fc) return [];
      return fc.features.filter(f => {
        const p = f.properties as any;
        return p && p.routeShortName === rsn;
      });
    }
    const result: GeoJSON.Feature[] = [];
    for (const [slug, vehicles] of Object.entries(vehiclesBySlug)) {
      const fc = layers[slug] ?? localLayers[slug];
      if (!fc) continue;
      const activeRSNs = new Set(vehicles.map(v => v.routeShortName));
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

  // Update map overlay — no cleanup that nulls overlay (prevents zoom-reset on poll)
  useEffect(() => {
    if (!active) return;
    setOverlay({ vehicles: overlayVehicles, focusedVehicle, routeFeatures, selectedRouteKey: selectedRoute, focusArea });
  }, [active, overlayVehicles, focusedVehicle, routeFeatures, selectedRoute, focusArea, setOverlay]);

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
        const displayName = cleanRouteDisplayName(vs[0].displayName || `Route ${routeShortName}`, routeShortName);
        return { agencySlug, routeShortName, displayName, vehicles: vs, lateCount, earlyCount, dominantStatus };
      });
  }, [allVehicles, query]);

  // Viewport-filter the sidebar list: only show routes with at least one vehicle on screen
  const displayedRouteGroups = useMemo(() => {
    if (!bounds) return routeGroups;
    return routeGroups.filter(g =>
      g.vehicles.some(v => v.lat >= bounds.s && v.lat <= bounds.n && v.lon >= bounds.w && v.lon <= bounds.e)
    );
  }, [routeGroups, bounds]);

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
      }))
      .sort((a, b) => a.place.localeCompare(b.place));
  }, [agencies]);

  const handlePlaceClick = useCallback((slug: string) => {
    const bounds = LIVE_AGENCY_BBOXES[slug];
    if (!bounds) return;
    // Land safely above the tracking threshold so vehicles appear right away
    setFocusArea({ bounds, minZoom: MIN_LIVE_ZOOM + 0.2, ts: Date.now() });
  }, []);

  const offScreenOnly = displayedRouteGroups.length === 0 && routeGroups.length > 0;
  const sidebarRouteGroups = offScreenOnly ? routeGroups : displayedRouteGroups;

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
      const colors = STATUS_COLORS[g.dominantStatus];
      const statusLabel = g.lateCount > 0
        ? `${g.lateCount} late`
        : g.earlyCount > 0
          ? `${g.earlyCount} early`
          : null;

      const showAgencyHeader = multipleAgencies && g.agencySlug !== lastSlug;
      lastSlug = g.agencySlug;
      const rawAgencyName = agencies.find(a => a.slug === g.agencySlug)?.name ?? g.agencySlug;
      const agencyName = shortenAgencyName(rawAgencyName);

      return (
        <React.Fragment key={key}>
          {showAgencyHeader && (
            <div className={`${PANEL_SECTION_HEAD} ${agencyHeaderIndex++ > 0 ? 'border-t' : 'border-b'} border-[var(--border-primary)]`}>
              {agencyName}
            </div>
          )}
          <RouteListRow
            shortName={cleanRouteShortName(g.routeShortName)}
            name={routeListCompanionName(g.displayName, g.routeShortName)}
            selected={isSelected}
            onClick={() => handleRouteClick(key)}
            className="border-b-0 mb-0.5"
            right={
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <span className={`${LIST_ROW_DIM} shrink-0`}>{g.vehicles.length} veh</span>
                {statusLabel && (
                  <span style={{ color: colors.border }} className="text-[10px] font-bold">
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

  // Group vehicles by headsign if available, else by directionId
  const vehiclesByDirection = useMemo(() => {
    if (!selectedGroup) return null;
    const useHeadsign = selectedGroup.vehicles.some(v => v.headsign);
    const map = new Map<string, LiveVehicle[]>();
    for (const v of selectedGroup.vehicles) {
      const key = useHeadsign
        ? (v.headsign ?? 'Unknown')
        : v.directionId != null ? String(v.directionId) : 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return map;
  }, [selectedGroup]);

  // True when we can actually show meaningful direction groups (more than one, or one with a real label)
  const canGroupByDirection = useMemo(() => {
    if (!vehiclesByDirection) return false;
    if (vehiclesByDirection.size > 1) return true;
    const [soleKey] = [...vehiclesByDirection.keys()];
    if (soleKey === 'unknown') return false;
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
      for (const f of fc.features) {
        const p = f.properties as any;
        if (!p || p.routeShortName !== selectedGroup.routeShortName) continue;
        if (p.day && p.day !== day) continue;
        const service = buildRouteServiceSummary(p);
        const hw = service.display.byHour?.[hour] ?? service.display.value;
        if (hw != null && (scheduled === null || Number(hw) < scheduled)) scheduled = Number(hw);
      }
    }

    return scheduled != null
      ? `Every ~${gap} min · scheduled every ${Math.round(scheduled)} min`
      : `Every ~${gap} min`;
  }, [selectedGroup, headwaysBySlug, layers, localLayers]);

  if (!active) return null;

  const totalVehicles = allVehicles.length;
  const hasAnyError = errors.length > 0 && totalVehicles === 0;
  const hasLiveElsewhere = offScreenOnly && !query;

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none" inert={!active}>
      <div
        className={`absolute top-20 left-6 sm:left-[var(--sidebar-left)] ${Z_PANEL} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} pointer-events-auto`}
        style={{ '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px` } as React.CSSProperties}
      >
        <div className={`${FLOATING_CARD} flex flex-col overflow-hidden ${PANEL_ENTER}`}>

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
            <div className={PANEL_TITLE_BAR}>
              {!isZoomedIn ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--text-dim)] shrink-0" />
              ) : vehiclesInViewport > 0 ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              ) : isLoading ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
              ) : hasAnyError ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 shrink-0" />
              ) : hasLiveElsewhere ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 shrink-0" />
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--text-dim)] shrink-0" />
              )}
              <span className={PANEL_TITLE}>Live Vehicles</span>
            </div>
          )}

          {/* Content */}
          <div className={PANEL_BODY}>
            {selectedGroup ? (
              <>
              {selectedRouteHeadwayLine && (
                <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)]`}>
                  {selectedRouteHeadwayLine}
                </div>
              )}
              {/* Route card: destination-grouped or vehicle-level fallback */}
              {selectedGroup.vehicles.length === 0 ? (
                <p className={`${PANEL_EMPTY} text-center`}>No vehicles on this route</p>
              ) : canGroupByDirection && !selectedDirection ? (
                [...(vehiclesByDirection ?? [])].map(([dirKey, vehicles]) => {
                  const label = getDirectionLabel(dirKey);
                  const preview = vehicles.slice(0, 3);
                  const extra = vehicles.length - preview.length;
                  return (
                    <button
                      key={dirKey}
                      onClick={() => setSelectedDirection(dirKey)}
                      className={`${LIST_ROW} border-b-0 mb-0.5`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`${LIST_ROW_PRIMARY} truncate`}>{label}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {preview.map(v => {
                            const colors = STATUS_COLORS[v.status];
                            return (
                              <span
                                key={v.id}
                                style={{ color: v.status === 'no_data' ? undefined : colors.border }}
                                className={`text-[10px] font-bold ${v.status === 'no_data' ? LIST_ROW_DIM : ''}`}
                              >
                                {delayLabel(v)}
                              </span>
                            );
                          })}
                          {extra > 0 && (
                            <span className={LIST_ROW_DIM}>+{extra} more</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] shrink-0 transition-colors" />
                    </button>
                  );
                })
              ) : (
                (selectedDirection
                  ? (vehiclesByDirection?.get(selectedDirection) ?? [])
                  : selectedGroup.vehicles
                ).map((v, i) => {
                  const label = delayLabel(v);
                  const colors = STATUS_COLORS[v.status];
                  return (
                    <div key={v.id} className={`${LIST_ROW} border-b-0 mb-0.5 cursor-default hover:bg-transparent`}>
                      <p className={`${LIST_ROW_PRIMARY} flex-1 min-w-0 truncate group-hover:text-[var(--text-primary)]`}>
                        {liveVehicleRowLabel(v, i, selectedRouteModeWord)}
                      </p>
                      {v.speedKmh != null && (
                        <span className={`${LIST_ROW_DIM} shrink-0`}>{v.speedKmh} km/h</span>
                      )}
                      <span
                        style={{ color: v.status === 'no_data' ? undefined : colors.border }}
                        className={`text-[10px] font-bold shrink-0 ${v.status === 'no_data' ? LIST_ROW_DIM : ''}`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })
              )}
              </>
            ) : !isZoomedIn || (visibleSlugs.length === 0 && !isLoading) ? (
              <>
                <div className={`${PANEL_SECTION_HEAD} border-b border-[var(--border-primary)]`}>
                  Live in these places
                </div>
                {livePlaces.map(p => (
                  <button
                    key={p.slug}
                    onClick={() => handlePlaceClick(p.slug)}
                    className={`${LIST_ROW} border-b-0 mb-0.5`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`${LIST_ROW_PRIMARY} truncate`}>{p.place}</p>
                      {p.agencyName && <p className={`${LIST_ROW_DIM} truncate mt-0.5`}>{p.agencyName}</p>}
                    </div>
                    <ChevronRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
                  </button>
                ))}
                <BrowseLiveAgenciesLink onInfoOpen={onInfoOpen} />
              </>
            ) : isLoading && totalVehicles === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6">
                <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-[10px] font-bold text-[var(--text-muted)]">Loading feed…</span>
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
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                          {message}
                          {stuck ? ' — still trying, but this has been down for a while.' : ' It will retry automatically.'}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Live feeds unavailable</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
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
                    <p className="text-[11px] font-bold text-[var(--text-primary)]">Nothing active on tracked routes</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] mt-1 leading-relaxed">
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
                            className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2.5 py-1"
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
                  <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-primary)] text-[10px] font-bold text-amber-500">
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
          </div>
        </div>
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
