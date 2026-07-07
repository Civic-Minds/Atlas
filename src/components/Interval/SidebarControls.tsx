import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getTierColor, getFareColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties, TimePeriod, DayType, HoveredBranch } from '../../hooks/useIntervalStats';
import type { Agency, FareOverride } from '../../App';
import { useLiveAdherence, agencyHeadwayDelta, agencyTripSummary } from '../../hooks/useLiveAdherence';
import { isLivePollingRoute, getLiveRouteConfig } from '../../utils/livePolling';
import { titleCase, getRouteLabel, shortenAgencyName } from '../../utils/format';
import { FLOATING_CARD, PANEL_ENTER_LEFT, TRANSITION_BASE, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM, Z_PANEL, SIDEBAR_LEFT_FALLBACK } from '../../styles';
import RouteListRow from '../RouteListRow';
import { DisambiguationPanel } from './panels/DisambiguationPanel';
import { StopCard } from './panels/StopCard';
import type { StopRoute, NearbyConnection, DebugRow } from './panels/StopCard';
import { RouteCardHeadway } from './panels/RouteCardHeadway';
import { LiveAdherenceCard } from './panels/LiveAdherenceCard';
import type { LiveRouteInfoData } from './panels/LiveAdherenceCard';

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMid = (lat1 + lat2) * Math.PI / 360;
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 40075000 * Math.cos(latMid) / 360;
  return Math.sqrt(dx * dx + dy * dy);
}

interface SidebarControlsProps {
  query: string;
  setQuery: (q: string) => void;
  searchFocused: boolean;
  searchMatches: number | null;
  searchMatchResults: { key: string; routeShortName: string | null; routeLongName: string | null; agencyName?: string }[] | null;
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedModes: Set<number>;
  setSelectedModes: React.Dispatch<React.SetStateAction<Set<number>>>;
  day: DayType;
  setDay: (d: DayType) => void;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  selectedStop: string | null;
  setSelectedStop: (s: string | null) => void;
  selectedRoute: string | null;
  setSelectedRoute: (r: string | null) => void;
  disambiguationRoutes: string[] | null;
  setDisambiguationRoutes: (routes: string[] | null) => void;
  layers: Record<string, GeoJSON.FeatureCollection>;
  currentDay: DayType;
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedAgencySlug?: (slug: string | null) => void;
  fareView?: boolean;
  fareOverrides?: Record<string, FareOverride>;
  sidebarLeft?: number;
  hoveredBranch: HoveredBranch | null;
  setHoveredBranch: (b: HoveredBranch | null) => void;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  query,
  setQuery,
  searchFocused,
  searchMatches,
  searchMatchResults,
  maxHeadway,
  setMaxHeadway,
  agencies,
  selectedAgencies,
  setSelectedAgencies,
  selectedModes,
  setSelectedModes,
  day,
  setDay,
  period,
  setPeriod,
  selectedStop,
  setSelectedStop,
  selectedRoute,
  setSelectedRoute,
  disambiguationRoutes,
  setDisambiguationRoutes,
  layers,
  currentDay,
  hideSpan,
  setHideSpan,
  livePollingOnly,
  setLivePollingOnly,
  setSelectedAgencySlug,
  fareView = false,
  fareOverrides = {},
  sidebarLeft,
  hoveredBranch,
  setHoveredBranch,
}) => {
  const nonCorridorLayers = useMemo(() => {
    const result: Record<string, GeoJSON.FeatureCollection> = {};
    for (const [slug, fc] of Object.entries(layers)) {
      if (!slug.endsWith('-corridors')) {
        result[slug] = fc;
      }
    }
    return result;
  }, [layers]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const [stopAgencyFilter, setStopAgencyFilter] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Array<{ key: string; shortName: string; longName: string; agencyName: string; headway?: number }>>([]);

  const loadRecents = useCallback(() => {
    try {
      const qRecents = localStorage.getItem('atlas_recent_searches');
      if (qRecents) setRecentSearches(JSON.parse(qRecents));

      const rRecents = localStorage.getItem('atlas_recently_viewed_routes');
      if (rRecents) setRecentlyViewed(JSON.parse(rRecents));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (searchFocused) {
      loadRecents();
    }
  }, [searchFocused, loadRecents]);

  const saveRecentSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    try {
      const recentsRaw = localStorage.getItem('atlas_recent_searches');
      const recents: string[] = recentsRaw ? JSON.parse(recentsRaw) : [];
      const filtered = recents.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      filtered.unshift(trimmed);
      const limited = filtered.slice(0, 5);
      localStorage.setItem('atlas_recent_searches', JSON.stringify(limited));
      setRecentSearches(limited);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem('atlas_recent_searches');
      setRecentSearches([]);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Save recently viewed route
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug, routeId] = selectedRoute.split('::');
    const fc = nonCorridorLayers[slug];
    if (!fc) return;
    const feat = fc.features.find(f => {
      const p = f.properties as any;
      return p.routeId === routeId;
    });
    if (feat) {
      const p = feat.properties as any;
      const shortName = p.routeShortName || p.routeId || '';
      const longName = p.routeLongName || '';
      const agencyName = shortenAgencyName(p.agencyName || slug);

      try {
        const recentsRaw = localStorage.getItem('atlas_recently_viewed_routes');
        const recents: Array<{ key: string; shortName: string; longName: string; agencyName: string; headway?: number }> = recentsRaw ? JSON.parse(recentsRaw) : [];
        const filtered = recents.filter(r => r.key !== selectedRoute);
        filtered.unshift({ key: selectedRoute, shortName, longName, agencyName, headway: p.headway ?? undefined });
        const limited = filtered.slice(0, 5);
        localStorage.setItem('atlas_recently_viewed_routes', JSON.stringify(limited));
        setRecentlyViewed(limited);
      } catch (e) {
        console.error(e);
      }
    }
  }, [selectedRoute, nonCorridorLayers]);

  // Compute notable routes fallback
  const notableRoutes = useMemo(() => {
    const routes: Array<{ key: string; shortName: string; longName: string; agencyName: string; headway: number }> = [];
    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      if (!fc?.features) continue;
      for (const f of fc.features) {
        const p = f.properties as any;
        if (!p.routeId || p.stopId) continue;
        const key = routeKey({ ...p, agencySlug: slug } as any);
        if (routes.some(r => r.key === key)) continue;
        const headway = p.headway ?? 999;
        const shortName = p.routeShortName || p.routeId;
        const longName = p.routeLongName || '';
        const agencyName = shortenAgencyName(p.agencyName || slug);
        routes.push({ key, shortName, longName, agencyName, headway });
      }
    }
    return routes.sort((a, b) => a.headway - b.headway).slice(0, 5);
  }, [nonCorridorLayers]);

  const suggestedFareAgencies = useMemo(() => {
    if (!fareView) return [];

    // Only show agencies loaded for the current viewport — never fall back to the
    // global list. REM/RTL/exo have baseFare:null, so a "has baseFare" filter
    // would drop them all and trigger the global fallback, surfacing TransLink, MBTA, etc.
    // Dedup by name: exo has 6 sub-agencies all named "exo" — show just one entry.
    const loadedInView = new Set(Object.keys(nonCorridorLayers));
    const seenNames = new Set<string>();
    const result: Array<{ slug: string; name: string }> = [];

    for (const agency of agencies) {
      if (!agency.gtfsFares) continue;
      if (!loadedInView.has(agency.slug)) continue;
      if (seenNames.has(agency.name)) continue;
      seenNames.add(agency.name);
      result.push({ slug: agency.slug, name: agency.name });
    }

    return result;
  }, [agencies, fareView, nonCorridorLayers]);

  const isFareSuggestions = fareView && suggestedFareAgencies.length > 0 && recentSearches.length === 0;
  const suggestionsTitle = recentSearches.length > 0 
    ? 'Recent searches' 
    : fareView ? 'Suggested agencies' : 'Suggested routes';
  const suggestionsList = recentSearches.length > 0 
    ? null 
    : (fareView ? suggestedFareAgencies : (recentlyViewed.length > 0 ? recentlyViewed : notableRoutes));

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, agencies, selectedRoute, selectedStop]);

  // Reset agency filter when stop changes
  useEffect(() => {
    setStopAgencyFilter(null);
  }, [selectedStop]);

  const currentRoute = useMemo(() => {
    if (!selectedRoute) return null;
    const features = Object.entries(nonCorridorLayers)
      .flatMap(([slug, fc]) => fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })))
      .filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        return p.routeId && routeKey(p) === selectedRoute && (p.day === undefined || p.day === currentDay);
      });
    if (features.length === 0) return null;
    const first = features[0].properties as unknown as ShapeProperties;
    const directions = features
      .map(f => f.properties as unknown as ShapeProperties)
      .sort((a, b) => {
        const aH = a.headway ?? Infinity;
        const bH = b.headway ?? Infinity;
        if (aH !== bH) return aH - bH;
        return (a.directionId ?? 0) - (b.directionId ?? 0);
      });
    return { ...first, directions };
  }, [selectedRoute, nonCorridorLayers, currentDay]);

  const liveAgencySlug = useMemo(() => {
    if (!currentRoute) return null;
    const slug = (currentRoute as any).agencySlug as string | null ?? null;
    if (!slug || !isLivePollingRoute(slug, currentRoute.routeShortName)) return null;
    return slug;
  }, [currentRoute]);

  const liveRouteShortName = liveAgencySlug ? currentRoute?.routeShortName ?? null : null;
  const { data: liveData, status: liveStatus } = useLiveAdherence(liveAgencySlug, liveRouteShortName);

  // Group directions by directionId so outbound/inbound are visually separated,
  // and collapse multiple span patterns in the same group into one row.
  const directionGroups = useMemo(() => {
    if (!currentRoute) return [];
    type Group = { dirId: number; realTier: ShapeProperties[]; span: ShapeProperties[] };
    const map = new Map<number, Group>();
    for (const d of currentRoute.directions) {
      const dirId = d.directionId ?? 0;
      if (!map.has(dirId)) map.set(dirId, { dirId, realTier: [], span: [] });
      const g = map.get(dirId)!;
      if (d.headway != null) g.realTier.push(d);
      else g.span.push(d);
    }
    // Deduplicate realTier entries with the same headsign — keep the one with the best (lowest) headway.
    // Multiple shape variants can share the same headsign (e.g. different mid-route detours), producing
    // visually identical rows in the sidebar.
    for (const g of map.values()) {
      const seen = new Map<string, ShapeProperties>();
      for (const d of g.realTier) {
        // Normalize for dedup (post-clean from data) to handle any remaining variants
        const key = (d.headsign ?? '').trim().toLowerCase();
        const existing = seen.get(key);
        if (!existing || (d.headway ?? Infinity) < (existing.headway ?? Infinity)) seen.set(key, d);
      }
      g.realTier = Array.from(seen.values());
    }
    return Array.from(map.values()).sort((a, b) => {
      const aMin = a.realTier[0]?.headway ?? Infinity;
      const bMin = b.realTier[0]?.headway ?? Infinity;
      return aMin - bMin;
    });
  }, [currentRoute]);

  const liveRouteInfo = useMemo(() => {
    if (!currentRoute) return null;
    const agencySlug = (currentRoute as any).agencySlug as string | null ?? null;
    if (!agencySlug || !isLivePollingRoute(agencySlug, currentRoute.routeShortName)) return null;
    const cfg = getLiveRouteConfig(agencySlug, currentRoute.routeShortName);
    const stopRows = cfg && liveData
      ? liveData.arrivals
          .map(a => ({
            stopId: a.stopId,
            name: cfg.targetStops[a.stopId] ?? a.stopId,
            avgGap: a.avgGap,
            delta: a.headwayDeltaMin,
          }))
          .sort((a, b) => {
            const absDiff = Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0);
            if (absDiff !== 0) return absDiff;
            return (b.delta ?? 0) - (a.delta ?? 0); // late before early on tie
          })
      : [];
    return {
      agencySlug,
      scheduledMin: cfg?.scheduledHeadwayMin ?? null,
      stopRows,
      delta: agencyHeadwayDelta(liveData, agencySlug),
      trips: agencyTripSummary(liveData, agencySlug),
    };
  }, [currentRoute, liveData]);

  const currentStop = useMemo(() => {
    if (!selectedStop) return null;
    const allFeatures = Object.entries(nonCorridorLayers).flatMap(([slug, fc]) =>
      fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } }))
    );
    const stop = allFeatures.find(f => {
      const p = f.properties as any;
      const compositeId = p.agencySlug && p.stopId ? `${p.agencySlug}::${p.stopId}` : p.stopId;
      return compositeId === selectedStop;
    });
    if (!stop || stop.geometry.type !== 'Point') return null;
    const props = stop.properties as any;

    // Find all sibling stop IDs sharing the same stopName under this agency
    // OR physically close (within 120 meters) across any agency to support transit hubs
    const siblingIdsByAgency: Record<string, Set<string>> = {};
    const stopName = props.stopName;
    const slug = props.agencySlug;
    const [clickLon, clickLat] = stop.geometry.coordinates;

    for (const f of allFeatures) {
      const p = f.properties as any;
      if (!p.stopId || f.geometry.type !== 'Point') continue;
      
      const isExactNameSibling = p.agencySlug === slug && stopName && p.stopName === stopName;
      
      let isProximitySibling = false;
      if (!isExactNameSibling) {
        const [lon, lat] = f.geometry.coordinates;
        const dist = getDistanceMeters(clickLat, clickLon, lat, lon);
        isProximitySibling = dist <= 120;
      }
      
      if (isExactNameSibling || isProximitySibling) {
        if (!siblingIdsByAgency[p.agencySlug]) {
          siblingIdsByAgency[p.agencySlug] = new Set();
        }
        siblingIdsByAgency[p.agencySlug].add(p.stopId);
      }
    }

    return {
      ...props,
      siblingIdsByAgency,
      lat: clickLat,
      lon: clickLon,
    };
  }, [selectedStop, nonCorridorLayers]);

  const stopRoutes = useMemo(() => {
    if (!currentStop) return [];
    const siblingIdsByAgency = currentStop.siblingIdsByAgency || {};

    const routeMap = new Map<string, { shortName: string; longName: string; agencyName: string; branches: Map<string, Branch> }>();
    type Branch = { rKey: string; headsign: string | null; headway: number | null; stopPeriodHw: Partial<Record<string, number>> | undefined; directionId: number };

    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      const siblingIds = siblingIdsByAgency[slug] || new Set<string>();
      if (siblingIds.size === 0) continue;

      // Collect all routeIds served by any sibling stop in this agency
      const routeIds = new Set<string>();
      for (const f of fc.features) {
        const p = f.properties as any;
        if (p.stopId && siblingIds.has(p.stopId)) {
          const rIds = p.routeIds as string[] | undefined;
          if (rIds) {
            for (const rId of rIds) routeIds.add(rId);
          }
        }
      }

      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;
        
        // Only include features whose shape actually covers any of the sibling stops.
        let stopHw: number | undefined = undefined;
        let matchingStopId: string | undefined = undefined;
        for (const sId of siblingIds) {
          const hw = (p as any).stopHeadways?.[sId];
          if (hw != null) {
            stopHw = hw;
            matchingStopId = sId;
            break; // Use the first matching sibling stop ID that this route serves
          }
        }
        if (stopHw == null || !matchingStopId) continue;

        const shortName = p.routeShortName || p.routeId;
        const dirId = (p as any).directionId ?? 0;
        if (!routeMap.has(shortName)) {
          routeMap.set(shortName, {
            shortName,
            longName: p.routeLongName || '',
            agencyName: shortenAgencyName(p.agencyName || slug),
            branches: new Map(),
          });
        }
        const entry = routeMap.get(shortName)!;
        const branchKey = `${dirId}::${p.headsign ?? ''}`;
        // Prefer stop-specific headway over feature headway; keep the best (lowest) when deduping.
        const newHeadway = stopHw ?? p.headway ?? null;
        const existing = entry.branches.get(branchKey);
        if (!existing || (newHeadway != null && (existing.headway == null || newHeadway < existing.headway))) {
          entry.branches.set(branchKey, {
            rKey: routeKey({ ...p, agencySlug: slug } as any),
            headsign: p.headsign ?? null,
            headway: newHeadway,
            stopPeriodHw: (p as any).stopPeriodHeadways?.[matchingStopId] as Partial<Record<string, number>> | undefined,
            directionId: dirId,
          });
        }
      }
    }
    return Array.from(routeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, v]) => ({
        shortName: v.shortName,
        longName: v.longName,
        agencyName: v.agencyName,
        branches: Array.from(v.branches.values())
          .sort((a, b) => a.directionId - b.directionId || (a.headway ?? Infinity) - (b.headway ?? Infinity))
          .map(b => ({ rKey: b.rKey, headsign: b.headsign, headway: b.headway, stopPeriodHw: b.stopPeriodHw, directionId: b.directionId })),
      }));
  }, [currentStop, nonCorridorLayers, currentDay]);

  const stopAgencies = useMemo(() => {
    const seen = new Set<string>();
    return stopRoutes
      .map(r => r.agencyName)
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
  }, [stopRoutes]);

  const filteredStopRoutes = useMemo(() =>
    stopAgencyFilter ? stopRoutes.filter(r => r.agencyName === stopAgencyFilter) : stopRoutes,
  [stopRoutes, stopAgencyFilter]);

  const nearbyConnections = useMemo(() => {
    if (!currentStop) return [];
    const { lat, lon } = currentStop as any;
    if (lat == null || lon == null) return [];

    const TRANSFER_MAX_M = 800;
    const SIBLING_MAX_M = 120;

    type TransferEntry = {
      rKey: string;
      routeShortName: string;
      routeLongName: string;
      agencyName: string;
      headway: number | null;
      nearestStopName: string;
      distanceMeters: number;
    };

    const seen = new Map<string, TransferEntry>();

    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      // Find stops in the transfer band (beyond sibling radius, within walking radius)
      const routeIdToClosest = new Map<string, { stopName: string; dist: number }>();
      for (const f of fc.features) {
        if (f.geometry.type !== 'Point') continue;
        const [flon, flat] = (f.geometry as GeoJSON.Point).coordinates;
        const d = getDistanceMeters(lat, lon, flat, flon);
        if (d <= SIBLING_MAX_M || d > TRANSFER_MAX_M) continue;
        const p = f.properties as any;
        if (!p.stopId || !p.routeIds?.length) continue;
        for (const rid of p.routeIds as string[]) {
          const existing = routeIdToClosest.get(rid);
          if (!existing || d < existing.dist) {
            routeIdToClosest.set(rid, { stopName: p.stopName ?? '', dist: d });
          }
        }
      }
      if (routeIdToClosest.size === 0) continue;

      for (const f of fc.features) {
        if (f.geometry.type === 'Point') continue;
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIdToClosest.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;

        const shortName = p.routeShortName || p.routeId;
        const mapKey = `${slug}::${shortName}`;
        const closest = routeIdToClosest.get(p.routeId)!;
        const existing = seen.get(mapKey);
        if (!existing) {
          seen.set(mapKey, {
            rKey: routeKey({ ...p, agencySlug: slug } as any),
            routeShortName: shortName,
            routeLongName: p.routeLongName || '',
            agencyName: shortenAgencyName(p.agencyName || slug),
            headway: p.headway ?? null,
            nearestStopName: closest.stopName,
            distanceMeters: closest.dist,
          });
        } else {
          if (p.headway != null && (existing.headway === null || p.headway < existing.headway)) {
            existing.headway = p.headway;
          }
          if (closest.dist < existing.distanceMeters) {
            existing.distanceMeters = closest.dist;
            existing.nearestStopName = closest.stopName;
          }
        }
      }
    }

    return Array.from(seen.values()).sort((a, b) => {
      if (a.headway !== null && b.headway !== null) return a.headway - b.headway;
      if (a.headway !== null) return -1;
      if (b.headway !== null) return 1;
      return a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true });
    });
  }, [currentStop, nonCorridorLayers, currentDay]);

  const debugRows = useMemo(() => {
    if (!currentStop) return [];
    const siblingIdsByAgency = currentStop.siblingIdsByAgency || {};
    const rows: { routeId: string; shortName: string; dir: number; headsign: string; stopHw: number | null; routeHw: number | null }[] = [];

    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      const siblingIds = siblingIdsByAgency[slug] || new Set<string>();
      if (siblingIds.size === 0) continue;

      // Collect all routeIds served by any sibling stop in this agency
      const routeIds = new Set<string>();
      for (const f of fc.features) {
        const p = f.properties as any;
        if (p.stopId && siblingIds.has(p.stopId)) {
          const rIds = p.routeIds as string[] | undefined;
          if (rIds) {
            for (const rId of rIds) routeIds.add(rId);
          }
        }
      }

      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;

        let stopHw: number | null = null;
        for (const sId of siblingIds) {
          const hw = (p as any).stopHeadways?.[sId];
          if (hw != null) {
            stopHw = hw;
            break;
          }
        }
        if (stopHw == null) continue;

        rows.push({
          routeId: p.routeId,
          shortName: p.routeShortName || p.routeId,
          dir: (p as any).directionId ?? 0,
          headsign: p.headsign || '',
          stopHw,
          routeHw: p.headway ?? null,
        });
      }
    }
    return rows.sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }) || a.dir - b.dir);
  }, [currentStop, nonCorridorLayers, currentDay]);

  const disambigDetails = useMemo(() => {
    if (!disambiguationRoutes) return null;
    return disambiguationRoutes
      .map(key => {
        for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
          const f = fc.features.find(feat => {
            const p = feat.properties as any;
            return routeKey({ ...p, agencySlug: slug } as any) === key;
          });
          if (f) {
            const p = f.properties as any;
            return { key, shortName: p.routeShortName ?? key, longName: p.routeLongName ?? '', agencyName: shortenAgencyName(p.agencyName || slug), color: getTierColor(p.tier) };
          }
        }
        return { key, shortName: key, longName: '', agencyName: '', color: 'var(--text-dim)' };
      })
      .sort((a, b) => {
        const agencyCmp = a.agencyName.localeCompare(b.agencyName);
        if (agencyCmp !== 0) return agencyCmp;
        const nA = parseInt(a.shortName, 10), nB = parseInt(b.shortName, 10);
        if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
        return a.shortName.localeCompare(b.shortName, undefined, { numeric: true });
      });
  }, [disambiguationRoutes, nonCorridorLayers]);

  const hasSuggestions = recentSearches.length > 0 || recentlyViewed.length > 0 || notableRoutes.length > 0 || (fareView && suggestedFareAgencies.length > 0);

  // In Fares mode: show fare info card for matched agencies
  const fareViewMatchedAgencies = fareView && query !== ''
    ? suggestedFareAgencies
        .map(a => ({ ...a, agencyData: agencies.find(ag => ag.slug === a.slug) }))
        .filter(a => a.name.toLowerCase().includes(query.toLowerCase()) || (a.agencyData?.region || '').toLowerCase().includes(query.toLowerCase()))
    : [];

  const hasContent = !!(currentStop || currentRoute || (query !== '' && (fareView ? fareViewMatchedAgencies.length > 0 : searchMatchResults !== null)) || disambiguationRoutes || (searchFocused && query === '' && hasSuggestions));

  const [panelShouldRender, setPanelShouldRender] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  useEffect(() => {
    if (hasContent) {
      setPanelShouldRender(true);
      const id = setTimeout(() => setPanelVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setPanelVisible(false);
      const id = setTimeout(() => setPanelShouldRender(false), 200);
      return () => clearTimeout(id);
    }
  }, [hasContent]);

  const routeSlug = currentRoute ? (currentRoute as any).agencySlug as string | undefined : undefined;
  const routeAgency = routeSlug ? agencies.find(a => a.slug === routeSlug) : undefined;
  const routeBaseFare = fareView && routeSlug
    ? (((currentRoute as any).baseFare as number | undefined) ?? fareOverrides[routeSlug]?.adult ?? routeAgency?.fare ?? null)
    : null;
  const routeIsStale = (() => {
    const exp = routeAgency?.lastFeedExpiry;
    if (!exp || exp.length !== 8) return false;
    const expDate = new Date(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`);
    return expDate < new Date();
  })();
  const expDateStr = (() => {
    const exp = routeAgency?.lastFeedExpiry;
    if (!exp || exp.length !== 8) return '';
    const y = exp.slice(0, 4);
    const m = exp.slice(4, 6);
    const d = exp.slice(6, 8);
    const date = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  })();

  if (!panelShouldRender) return null;

  return (
    <div
      className={`absolute top-20 ${Z_PANEL} w-72 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-[opacity,transform] duration-200 ease-out ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      style={{ left: sidebarLeft ?? SIDEBAR_LEFT_FALLBACK }}
    >
      {searchFocused && query === '' && (
        <div className={`${FLOATING_CARD} shrink-0 flex flex-col overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-primary)]">
            <span className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">
              {suggestionsTitle}
            </span>
            {recentSearches.length > 0 && (
              <button
                onClick={clearRecentSearches}
                className="text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {recentSearches.length > 0 ? (
            <div>
              {recentSearches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className={LIST_ROW}
                >
                  <span className={LIST_ROW_PRIMARY}>{s}</span>
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">↵</span>
                </button>
              ))}
            </div>
          ) : isFareSuggestions ? (
            <div>
              {suggestedFareAgencies.map((a) => (
                <button
                  key={a.slug}
                  onClick={() => setQuery(a.name)}
                  className={LIST_ROW}
                >
                  <span className={LIST_ROW_PRIMARY}>{shortenAgencyName(a.name)}</span>
                </button>
              ))}
              {suggestedFareAgencies.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)] italic px-4 py-3">No agencies with fare data in this area.</p>
              )}
            </div>
          ) : (
            <div>
              {(recentlyViewed.length > 0 ? recentlyViewed : notableRoutes).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setSelectedRoute(r.key)}
                  className={LIST_ROW}
                >
                  <div className="min-w-0 flex-1">
                    <div className={LIST_ROW_PRIMARY}>
                      {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                    </div>
                    <div className={`flex items-center gap-1.5 mt-0.5`}>
                      <span className={LIST_ROW_DIM}>{r.agencyName}</span>
                      {recentlyViewed.length === 0 && r.headway !== undefined && r.headway < 999 && (
                        <>
                          <span className="text-[10px] text-[var(--text-dim)]">·</span>
                          <span className="text-[10px] text-[var(--text-dim)]">every {r.headway}m</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {recentlyViewed.length === 0 && notableRoutes.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)] italic px-4 py-3">No route suggestions in this area.</p>
              )}
            </div>
          )}
        </div>
      )}
      {disambigDetails && disambigDetails.length > 1 && !selectedRoute && (
        <DisambiguationPanel
          disambigDetails={disambigDetails}
          setSelectedRoute={setSelectedRoute}
          setDisambiguationRoutes={setDisambiguationRoutes}
        />
      )}
      {(currentStop || currentRoute || (query !== '' && searchMatchResults !== null)) && <div
        ref={scrollRef}
        onScroll={checkScroll}
        className={`relative flex-1 min-h-0 ${FLOATING_CARD} px-4 pt-4 pb-2 transition-colors ${TRANSITION_BASE} overflow-y-auto overflow-x-hidden custom-scrollbar`}
      >
        {currentStop && !query.trim() && (
          <StopCard
            currentStop={currentStop}
            setSelectedStop={setSelectedStop}
            setSelectedRoute={setSelectedRoute}
            stopAgencies={stopAgencies}
            stopAgencyFilter={stopAgencyFilter}
            setStopAgencyFilter={setStopAgencyFilter}
            filteredStopRoutes={filteredStopRoutes as StopRoute[]}
            period={period}
            nearbyConnections={nearbyConnections as NearbyConnection[]}
            showDebug={showDebug}
            setShowDebug={setShowDebug}
            debugRows={debugRows as DebugRow[]}
          />
        )}

        {currentRoute && !query.trim() && (
          <div className={`mb-5 ${PANEL_ENTER_LEFT}`}>
            {fareView ? (
              <>
                <div className="flex items-start gap-2 mb-3">
                  <button
                    onClick={() => setSelectedRoute(null)}
                    className="p-0.5 -ml-0.5 mt-2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                    aria-label="Back to route list"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 mt-2">
                    <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight">
                      {routeAgency?.name ?? routeSlug}
                    </h3>
                    {routeAgency?.region && (
                      <span className="text-[9px] font-bold text-[var(--text-dim)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2 py-0.5 mt-1 inline-block">
                        {routeAgency.region}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--bg-app)] rounded-xl">
                  <span className="text-[10px] font-bold text-[var(--text-dim)]">Base adult fare</span>
                  {routeBaseFare != null ? (
                    <span
                      className="text-sm font-black px-2.5 py-0.5 rounded-full text-white"
                      style={{ background: getFareColor(routeBaseFare) }}
                    >
                      ${routeBaseFare.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text-dim)]">fare varies</span>
                  )}
                </div>
              </>
            ) : (
              <RouteCardHeadway
                currentRoute={currentRoute}
                liveRouteInfo={liveRouteInfo}
                liveStatus={liveStatus}
                routeSlug={routeSlug}
                routeAgency={routeAgency}
                setSelectedAgencySlug={setSelectedAgencySlug}
                setSelectedRoute={setSelectedRoute}
                maxHeadway={maxHeadway}
                period={period}
                setPeriod={setPeriod}
                directionGroups={directionGroups}
                hideSpan={hideSpan}
                routeIsStale={routeIsStale}
                expDateStr={expDateStr}
                hoveredBranch={hoveredBranch}
                setHoveredBranch={setHoveredBranch}
              />
            )}
          </div>
        )}

        {query !== '' && fareView && fareViewMatchedAgencies.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {fareViewMatchedAgencies.map(({ slug, name, agencyData }) => {
              const baseFare = fareOverrides[slug]?.adult ?? agencyData?.fare ?? null;
              return (
                <div key={slug} className="border border-[var(--border-primary)] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{name}</span>
                    {baseFare != null ? (
                      <span
                        className="text-sm font-black px-2 py-0.5 rounded-full text-white"
                        style={{ background: getFareColor(baseFare) }}
                      >
                        ${baseFare.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-dim)]">fare varies</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {query !== '' && !fareView && searchMatchResults !== null && (() => {
          const qLower = query.toLowerCase();
          const matchedAgencies = agencies.filter(a =>
            a.name.toLowerCase().includes(qLower) || a.slug.startsWith(qLower) || (a.region || '').toLowerCase().includes(qLower)
          );
          return (
            <div className="mb-4 space-y-3">
              {matchedAgencies.length > 0 && setSelectedAgencySlug && (
                <div>
                  <div className="text-[10px] font-bold text-[var(--accent)] tracking-wide mb-1.5">
                    {matchedAgencies.length} agenc{matchedAgencies.length === 1 ? 'y' : 'ies'} match
                  </div>
                  {matchedAgencies.map(a => (
                    <button
                      key={a.slug}
                      onClick={() => { setSelectedAgencySlug(a.slug); setQuery(''); }}
                      className={LIST_ROW}
                    >
                      <span className={`${LIST_ROW_PRIMARY} flex-1 min-w-0 truncate`}>{a.name}</span>
                      {a.region && <span className={`${LIST_ROW_DIM} shrink-0`}>{a.region}</span>}
                    </button>
                  ))}
                </div>
              )}
              {searchMatchResults.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-[var(--accent)] tracking-wide mb-1.5">
                    {searchMatches} route{searchMatches === 1 ? '' : 's'} match
                  </div>
                  {searchMatchResults.map((r) => (
                    <RouteListRow
                      key={r.key}
                      shortName={titleCase(getRouteLabel(r.routeShortName, r.routeLongName, r.agencyName))}
                      selected={selectedRoute === r.key}
                      onClick={() => {
                        saveRecentSearch(query);
                        setQuery('');
                        setSelectedRoute(selectedRoute === r.key ? null : r.key);
                      }}
                      right={
                        <span className={`${LIST_ROW_DIM} shrink-0 ml-2 text-right`}>
                          {shortenAgencyName(r.agencyName || '')}
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
              {searchMatchResults.length === 0 && (
                <div className="text-[10px] font-bold text-[var(--text-dim)] px-1 py-2">No routes match your search.</div>
              )}
            </div>
          );
        })()}


        {canScrollMore && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl bg-gradient-to-t from-[var(--bg-panel)] to-transparent" />
        )}
      </div>}

      {liveRouteInfo && liveStatus !== 'noData' && !query.trim() && (
        <LiveAdherenceCard
          liveRouteInfo={liveRouteInfo as LiveRouteInfoData}
          liveStatus={liveStatus}
          showDebug={showDebug}
          setShowDebug={setShowDebug}
          hasCurrentRoute={!!currentRoute}
          nonCorridorLayers={nonCorridorLayers}
          selectedRoute={selectedRoute}
          setSelectedRoute={setSelectedRoute}
          setSelectedStop={setSelectedStop}
        />
      )}
    </div>
  );
};
