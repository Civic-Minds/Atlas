import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { getTierColor, getFareColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod, HeadwayByHour } from '../../hooks/useAgencyData';
import type { Agency, FareOverride } from '../../App';
import { useLiveAdherence, agencyHeadwayDelta, agencyTripSummary } from '../../hooks/useLiveAdherence';
import { isLivePollingRoute, getLiveRouteConfig } from '../../utils/livePolling';
import { titleCase, cleanHeadsign, fmtHeadway, fmtHeadwayRange, formatRemDisplay, getRouteLabel, shortenAgencyName } from '../../utils/format';
import { FLOATING_CARD, PANEL_ENTER, PANEL_ENTER_LEFT, TRANSITION_BASE, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM, Z_PANEL, SIDEBAR_LEFT_FALLBACK } from '../../styles';
import { HeadwaySparkline, headwayToTierColor } from './HeadwaySparkline';
import RouteListRow from '../RouteListRow';
import RouteCardTitle from '../RouteCardTitle';

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
  day: 'Weekday' | 'Saturday' | 'Sunday';
  setDay: (d: 'Weekday' | 'Saturday' | 'Sunday') => void;
  period: TimePeriod;
  selectedStop: string | null;
  setSelectedStop: (s: string | null) => void;
  selectedRoute: string | null;
  setSelectedRoute: (r: string | null) => void;
  disambiguationRoutes: string[] | null;
  setDisambiguationRoutes: (routes: string[] | null) => void;
  layers: Record<string, GeoJSON.FeatureCollection>;
  currentDay: 'Weekday' | 'Saturday' | 'Sunday';
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedAgencySlug?: (slug: string | null) => void;
  fareView?: boolean;
  fareOverrides?: Record<string, FareOverride>;
  sidebarLeft?: number;
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
        const key = d.headsign ?? '';
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
        .filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
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
      className={`absolute top-20 ${Z_PANEL} w-64 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-[opacity,transform] duration-200 ease-out ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
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
                  <span className={LIST_ROW_PRIMARY}>{a.name}</span>
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
        <div className={`${FLOATING_CARD} ${PANEL_ENTER} max-h-[380px] overflow-y-auto custom-scrollbar`}>
          <div>
            {(() => {
              const groups: { agencyName: string; routes: typeof disambigDetails }[] = [];
              for (const r of disambigDetails) {
                const last = groups[groups.length - 1];
                if (last && last.agencyName === r.agencyName) last.routes.push(r);
                else groups.push({ agencyName: r.agencyName, routes: [r] });
              }
              return groups.map(g => (
                <div key={g.agencyName}>
                  {g.agencyName && (
                    <div className="px-4 pt-2.5 pb-1">
                      <span className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">{g.agencyName}</span>
                    </div>
                  )}
                  {g.routes.map(r => (
                    <button
                      key={r.key}
                      onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
                      className={LIST_ROW}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                        <span className={LIST_ROW_PRIMARY}>
                          {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
      {(currentStop || currentRoute || (query !== '' && searchMatchResults !== null)) && <div
        ref={scrollRef}
        onScroll={checkScroll}
        className={`relative flex-1 min-h-0 ${FLOATING_CARD} px-4 pt-4 pb-2 transition-colors ${TRANSITION_BASE} overflow-y-auto overflow-x-hidden custom-scrollbar`}
      >
        {currentStop && !query.trim() && (
          <div className={`mb-5 ${PANEL_ENTER_LEFT}`}>
            <div className="flex items-center justify-end mb-2 -mt-2 -mr-2">
              <button onClick={() => setSelectedStop(null)} className="p-2 text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-full transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight mb-2">
              {titleCase(currentStop.stopName)}
            </h3>
            {stopAgencies.length > 1 && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mb-2">
                {stopAgencies.map((name, i) => (
                  <React.Fragment key={name}>
                    <button
                      onClick={() => setStopAgencyFilter(stopAgencyFilter === name ? null : name)}
                      className={`text-[10px] font-bold transition-colors ${
                        stopAgencyFilter === name
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-dim)] hover:text-[var(--text-muted)]'
                      }`}
                    >
                      {name}
                    </button>
                    {i < stopAgencies.length - 1 && (
                      <span className="text-[10px] text-[var(--border-primary)] select-none">·</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {filteredStopRoutes.map(({ shortName, longName, agencyName, branches }) => (
                <div key={shortName} className="text-[11px]">
                  <div className="font-black text-[var(--text-primary)] mb-0.5">
                    {titleCase(getRouteLabel(shortName, longName, agencyName))}
                  </div>
                  <div className="space-y-0.5">
                    {(() => {
                      const hasMultipleDirections = new Set(branches.map(b => b.directionId)).size > 1;
                      let lastDir: number | null = null;
                      return branches.map(({ rKey, headsign, headway, stopPeriodHw, directionId }) => {
                        const cleaned = headsign && !/^A[0-9]/.test(shortName)
                          ? titleCase(cleanHeadsign(headsign.trim(), shortName, longName))
                          : null;
                        const isTo = cleaned && /^to\s/i.test(cleaned);
                        const displayPrefix = isTo ? 'to' : '→';
                        const displayBody = cleaned
                          ? (isTo ? cleaned.replace(/^to\s+/i, '') : cleaned)
                          : `dir ${directionId}`;
                        const showDivider = hasMultipleDirections && lastDir !== null && directionId !== lastDir;
                        lastDir = directionId;
                        // Use period-specific stop headway when a filter is active, fall back to all-day stop headway.
                        const displayHw = (period !== 'all' ? stopPeriodHw?.[period] : undefined) ?? headway;
                        const showPeriodLabel = period !== 'all' && stopPeriodHw?.[period] != null;
                        return (
                           <React.Fragment key={`${rKey}::${directionId}::${headsign ?? ''}`}>
                            {showDivider && (
                              <div className="my-1 border-t border-[var(--border-primary)] opacity-50" />
                            )}
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => { setSelectedStop(null); setSelectedRoute(rKey); }}
                                className="flex items-start gap-1.5 font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-left"
                              >
                                <span className="shrink-0 min-w-[14px] text-center opacity-75">{displayPrefix}</span>
                                <span>{displayBody}</span>
                              </button>
                              {displayHw != null && (
                                <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)] shrink-0 ml-2">
                                  {isLivePollingRoute(rKey.split('::')[0], shortName) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Live data available" />
                                  )}
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: headwayToTierColor(displayHw) }}
                                  />
                                  {fmtHeadway(displayHw)}
                                  {showPeriodLabel && (
                                    <span className="text-[9px] font-bold text-[var(--text-dim)]">{PERIOD_LABELS[period]}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {nearbyConnections.length > 0 && (
              <div className="mt-3 -mx-4 px-4 pt-3 pb-2 border-t-4 border-[var(--border-primary)] bg-[var(--bg-hover)]">
                <div className="text-[10px] font-black text-[var(--text-dim)] mb-1.5">Within 10 min walk</div>
                <div className="space-y-1.5">
                  {nearbyConnections.map(({ rKey, routeShortName, routeLongName, agencyName, headway, nearestStopName, distanceMeters }) => {
                    const walkMin = Math.max(1, Math.round(distanceMeters / 80));
                    return (
                      <div key={rKey} className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => { setSelectedStop(null); setSelectedRoute(rKey); }}
                          className="flex flex-col items-start font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-left min-w-0"
                        >
                          <span className="text-[11px] leading-tight">{titleCase(getRouteLabel(routeShortName, routeLongName, agencyName))}</span>
                          <span className="text-[9px] text-[var(--text-dim)] font-normal truncate max-w-full">{nearestStopName} · {walkMin} min walk</span>
                        </button>
                        {headway != null && (
                          <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)] text-[11px] shrink-0 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: headwayToTierColor(headway) }} />
                            {fmtHeadway(headway)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
              <button
                onClick={() => setShowDebug(v => !v)}
                className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
              >
                {showDebug ? '▾' : '▸'} debug headways
              </button>
              {showDebug && (
                <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
                    <span>route / dir / headsign</span>
                    <span>stop hw</span>
                    <span>route hw</span>
                    <span>used</span>
                  </div>
                  {debugRows.map((r, i) => (
                    <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 ${r.stopHw != null ? 'text-[var(--text-primary)]' : ''}`}>
                      <span className="truncate">{r.shortName} d{r.dir} {r.headsign}</span>
                      <span>{r.stopHw != null ? `${r.stopHw}m` : '—'}</span>
                      <span>{r.routeHw != null ? `${r.routeHw}m` : '—'}</span>
                      <span>{r.stopHw != null ? '✓' : '✗'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
              <>
            {liveRouteInfo && liveStatus !== 'noData' && (
              <div className="flex items-center gap-1.5 -mt-1 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-dim)] shrink-0" />
                <span className="text-[10px] font-black text-[var(--text-dim)]">Scheduled</span>
              </div>
            )}
            <div className="flex items-start gap-2 mb-1">
              <button
                onClick={() => setSelectedRoute(null)}
                className="p-0.5 -ml-0.5 mt-2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                aria-label="Back to route list"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              {(() => {
                const slug = (currentRoute as any).agencySlug as string | undefined;
                const agency = agencies.find(a => a.slug === slug);
                const agencyDisplayName = agency?.name ?? slug;
                return (
                  <div className="flex-1 mt-2">
                    <RouteCardTitle
                      routeShortName={currentRoute.routeShortName}
                      routeLongName={currentRoute.routeLongName}
                      agencyName={agencyDisplayName}
                      onAgencyClick={slug && setSelectedAgencySlug ? () => { setSelectedAgencySlug(slug); setSelectedRoute(null); } : undefined}
                    />
                    {agency?.excludeRouteShortNames?.length ? (
                      <a
                        href={agency.issueUrl ?? `https://github.com/Civic-Minds/Atlas/issues?q=is%3Aissue+${slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mt-0.5 block"
                      >
                        We corrected this data
                      </a>
                    ) : null}
                  </div>
                );
              })()}
            </div>
            {(() => {
              // Merge headwayByHour across all directions — take the best (lowest) non-null
              // headway per hour so bidirectional peak routes show the full service picture.
              const HOURS = Array.from({ length: 22 }, (_, i) => i + 5);
              const merged: Record<number, number | null> = {};
              for (const h of HOURS) merged[h] = null;
              for (const d of currentRoute.directions) {
                const bh = (d as any).headwayByHour as Record<number, number | null> | undefined;
                if (!bh) continue;
                for (const h of HOURS) {
                  const v = bh[h];
                  if (v != null && (merged[h] == null || v < merged[h]!)) merged[h] = v;
                }
              }
              const hasAny = HOURS.some(h => merged[h] != null);
              return hasAny ? <HeadwaySparkline byHour={merged} /> : null;
            })()}
            <div className="space-y-3">
              {directionGroups.map((group, gi) => {
                const fmtH = (d: ShapeProperties): string => {
                  const cleaned = cleanHeadsign((d.headsign ?? '').trim(), currentRoute.routeShortName, currentRoute.routeLongName);
                  if (!cleaned) return '';
                  const h = titleCase(cleaned);
                  return /^to\s/i.test(h) || / to /i.test(h) ? h : `to ${h}`;
                };
                const spanNames = group.span
                  .map(d => d.headsign ? titleCase(cleanHeadsign(d.headsign.trim(), currentRoute.routeShortName, currentRoute.routeLongName)) : '')
                  .filter(Boolean);
                return (
                  <React.Fragment key={group.dirId}>
                    {gi > 0 && directionGroups.length > 1 && (
                      <div className="border-t border-[var(--border-primary)] opacity-30" />
                    )}
                    <div className="space-y-2">
                      {group.realTier.map((d, i) => {
                        const minStopHw = (d as any).minStopHeadway as number | undefined;
                        const dimmed = maxHeadway !== Infinity && (minStopHw ?? d.headway ?? Infinity) > maxHeadway;
                        return (
                          <div key={`r${i}`} className={`text-[11px] transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
                            {(() => {
                              const label = d.headsign ? fmtH(d) : (directionGroups.length > 1 ? `Direction ${gi + 1}` : '');
                              return label ? (
                                <span className="font-bold text-[var(--text-muted)] block break-words">{label}</span>
                              ) : null;
                            })()}
                            <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                              {(() => {
                                const byPeriod = d.headwayByPeriod as HeadwayByPeriod | undefined;
                                const ph = period !== 'all' ? byPeriod?.[period as keyof HeadwayByPeriod] : undefined;
                                const displayH = ph ?? d.headway;
                                // When a period filter is active, check if trunk stops have
                                // meaningfully better frequency than the terminal — if so show a
                                // range ("every 6–12 min") rather than the terminal number alone.
                                const trunkHw = period !== 'all'
                                  ? ((d as any).minStopHeadwayByPeriod as Partial<Record<string, number>> | undefined)?.[period]
                                  : undefined;
                                const showRange = trunkHw != null && displayH != null
                                  && trunkHw < displayH * 0.65
                                  && displayH / trunkHw <= 4;
                                const color = headwayToTierColor(showRange ? trunkHw! : displayH);
                                return (
                                  <>
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                    {showRange
                                      ? fmtHeadwayRange(trunkHw!, displayH!)
                                      : fmtHeadway(displayH!)}
                                    {ph != null && (
                                      <span className="text-[9px] font-bold text-[var(--text-dim)]">{PERIOD_LABELS[period]}</span>
                                    )}
                                  </>
                                );
                              })()}
                            </span>
                          </div>
                        );
                      })}
                      {(!hideSpan || group.realTier.length === 0) && group.span.length === 1 && (
                        <div key="s0" className="text-[11px]">
                          <span className="font-bold text-[var(--text-muted)] block break-words">
                            {group.span[0].headsign ? fmtH(group.span[0]) : 'limited service'}
                          </span>
                          <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getTierColor(null) }} />
                            limited
                          </span>
                        </div>
                      )}
                      {(!hideSpan || group.realTier.length === 0) && group.span.length > 1 && (
                        <div key="smulti" className="text-[11px]">
                          <span className="font-bold text-[var(--text-muted)] leading-snug block">
                            {spanNames.join(' · ')}
                          </span>
                          <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getTierColor(null) }} />
                            limited
                          </span>
                        </div>
                      )}
                      {hideSpan && group.realTier.length > 0 && spanNames.length > 0 && (
                        <p key="span-hint" className="text-[10px] text-[var(--text-dim)] font-bold leading-snug">
                          Also serves: {spanNames.join(' · ')} — infrequent
                        </p>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              {routeIsStale && (
                <div className="mt-2 border-t border-[var(--border-primary)] pt-2 opacity-80 text-right">
                  <p className="text-[9px] font-bold text-amber-500">
                    Schedule may be outdated{expDateStr ? ` (ended ${expDateStr})` : ''}
                  </p>
                  {routeSlug && (
                    <a
                      href="https://github.com/Civic-Minds/Atlas/blob/main/docs/SCHEDULES.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[8px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-bold block mt-0.5"
                    >
                      Learn more →
                    </a>
                  )}
                </div>
              )}
            </div>
              </>
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

        {query !== '' && !fareView && searchMatchResults !== null && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-[var(--accent)] tracking-wide mb-1.5">
              {searchMatches} route{searchMatches === 1 ? '' : 's'} match
            </div>
            {searchMatchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto custom-scrollbar border border-[var(--border-primary)] rounded-xl overflow-hidden">
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
                      <span className={`truncate ${LIST_ROW_DIM} flex-1 text-right ml-2`}>
                        {r.agencyName}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}


        {canScrollMore && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl bg-gradient-to-t from-[var(--bg-panel)] to-transparent" />
        )}
      </div>}

      {liveRouteInfo && liveStatus !== 'noData' && !query.trim() && (
        <div className={`p-4 ${FLOATING_CARD} ${PANEL_ENTER} space-y-2 shrink-0`}>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 ${liveStatus === 'live' ? 'animate-pulse' : 'opacity-40'}`} />
            <span className="text-[10px] font-black text-green-400">Live</span>
            {liveStatus === 'pending' && (
              <span className="text-[10px] font-bold text-[var(--text-dim)]">fetching…</span>
            )}
          </div>
          {liveStatus === 'live' && (
            <>
              {liveRouteInfo.stopRows.length > 0 && (
                <div className="space-y-2">
                  {liveRouteInfo.stopRows.map(stop => {
                    const absDelta = stop.delta == null ? null : Math.abs(stop.delta);
                    const dotColor = absDelta == null ? 'var(--text-dim)'
                      : absDelta >= 5 ? '#f87171'
                      : absDelta >= 2 ? '#fbbf24'
                      : '#4ade80';
                    const deltaLabel = stop.delta == null ? null
                      : absDelta! < 2 ? 'on time'
                      : stop.delta > 0 ? `+${Math.round(stop.delta)} min`
                      : `${Math.round(stop.delta)} min`;
                    const deltaColor = absDelta == null ? ''
                      : absDelta >= 5 ? 'text-red-400'
                      : absDelta >= 2 ? 'text-amber-400'
                      : 'text-green-400';
                    return (
                      <button
                        key={stop.stopId}
                        className="text-[11px] w-full text-left hover:opacity-70 transition-opacity"
                        onClick={() => { setSelectedRoute(null); setSelectedStop(`${liveRouteInfo.agencySlug}::${stop.stopId}`); }}
                      >
                        <span className="font-bold text-[var(--text-muted)] block truncate">
                          {stop.name}
                        </span>
                        <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                          {stop.avgGap != null ? `${Math.round(stop.avgGap)} min` : '—'}
                          {deltaLabel != null && (
                            <span className={`text-[10px] font-bold tabular-nums ${deltaColor}`}>{deltaLabel}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
            <button
              onClick={() => setShowDebug(v => !v)}
              className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
            >
              {showDebug ? '▾' : '▸'} debug headways
            </button>
            {showDebug && currentRoute && (
              <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
                  <span>headsign</span>
                  <span>dir</span>
                  <span>route hw</span>
                  <span>tier</span>
                </div>
                {(() => {
                  const rows: { headsign: string; dir: number; headway: number | null; tier: string }[] = [];
                  for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
                    for (const f of fc.features) {
                      const p = f.properties as unknown as ShapeProperties;
                      if (routeKey({ ...p, agencySlug: slug } as any) !== selectedRoute) continue;
                      rows.push({ headsign: p.headsign || '—', dir: (p as any).directionId ?? 0, headway: p.headway ?? null, tier: (p as any).tier || '—' });
                    }
                  }
                  return rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2">
                      <span className="truncate">{r.headsign}</span>
                      <span>d{r.dir}</span>
                      <span>{r.headway != null ? `${r.headway}m` : '—'}</span>
                      <span>{r.tier}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
