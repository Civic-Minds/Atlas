import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { Agency } from '../App';
import {
  FLOATING_CARD,
  PANEL_ENTER,
  PANEL_TITLE_BAR,
  PANEL_TITLE,
  PANEL_BODY,
  PANEL_EMPTY,
  LIST_ROW,
  LIST_ROW_PRIMARY,
  Z_PANEL,
  SIDEBAR_LEFT_FALLBACK,
} from '../styles';
import {
  buildStopCatalog,
  normalizeStopName,
  resolveAutoSelect,
  searchStops,
  type StopEntry,
} from './corridor-search';
import { clipBetweenStopIndices, formatRouteColor } from './corridor-geometry';
import { useCorridorMapOverlay } from '../context/CorridorMapOverlay';
import { fetchAgencyGeo, getCachedAgencyGeo } from '../lib/agencyGeo';
import { type RouteFeature, type RouteGroup } from './corridor-types';
import { ServiceTimeline } from './ServiceTimeline';
import { StopInput } from './StopInput';
import { PERIOD_KEYS } from '../../shared/config';
import type { DayType } from '../../types/gtfs';

interface Props {
  agencies: Agency[];
  day: DayType;
  active?: boolean;
  sidebarLeft?: number;
  initialFrom?: StopEntry | null;
  onInitialFromHandled?: () => void;
}

interface GeoJsonAgency {
  slug: string;
  features: Array<{
    geometry?: { type: string; coordinates: number[][] };
    properties: {
      routeId?: string;
      routeShortName?: string;
      routeLongName?: string;
      headsign?: string;
      headway?: number;
      headwayByPeriod?: Record<string, number | null>;
      routeColor?: string | null;
      color?: string;
      stopOrder?: string[];
      stopPositions?: number[];
      day?: string;
      directionId?: number;
      isCorridor?: boolean;
    };
  }>;
}

function agencySlugsForQuery(
  indexes: Record<string, Record<string, { name: string; lat: number; lon: number }>>,
  fromNorm: string,
  toNorm: string,
  fromAgency: string,
  toAgency: string,
): Set<string> {
  const slugs = new Set<string>([fromAgency, toAgency]);
  for (const [slug, stops] of Object.entries(indexes)) {
    let hasFrom = false;
    let hasTo = false;
    for (const s of Object.values(stops)) {
      const norm = normalizeStopName(s.name).toLowerCase();
      if (norm.includes(fromNorm)) hasFrom = true;
      if (norm.includes(toNorm)) hasTo = true;
    }
    if (hasFrom && hasTo) slugs.add(slug);
  }
  return slugs;
}

function StopSuggestions({
  suggestions,
  highlight,
  stopsReady,
  onSelect,
}: {
  suggestions: StopEntry[];
  highlight: number;
  stopsReady: boolean;
  onSelect: (s: StopEntry) => void;
}) {
  return (
    <div className={`absolute top-full left-0 right-0 z-10 mt-1 ${FLOATING_CARD} overflow-hidden max-h-48 overflow-y-auto custom-scrollbar`}>
      {suggestions.length === 0 ? (
        <p className={PANEL_EMPTY}>
          {!stopsReady ? 'Loading stations…' : 'No stations found'}
        </p>
      ) : (
        suggestions.map((s, i) => (
          <button
            key={`${s.agencySlug}::${s.stopId}`}
            type="button"
            onMouseDown={e => { e.preventDefault(); onSelect(s); }}
            className={`${LIST_ROW} ${i === highlight ? 'bg-[var(--accent-bg)]' : ''}`}
          >
            <span className={LIST_ROW_PRIMARY}>{s.displayName}</span>
          </button>
        ))
      )}
    </div>
  );
}

export default function Corridors({
  agencies,
  day,
  active = true,
  sidebarLeft,
  initialFrom,
  onInitialFromHandled,
}: Props) {
  const { setOverlay } = useCorridorMapOverlay();
  const [stopsIndexes, setStopsIndexes] = useState<Record<string, Record<string, { name: string; lat: number; lon: number }>>>({});
  const [agencyFeatures, setAgencyFeatures] = useState<GeoJsonAgency[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const loadedGeoSlugs = useRef(new Set<string>());

  const [fromQuery, setFromQuery] = useState('');
  const [fromStop, setFromStop] = useState<StopEntry | null>(null);
  const [fromFocused, setFromFocused] = useState(false);
  const [toQuery, setToQuery] = useState('');
  const [toStop, setToStop] = useState<StopEntry | null>(null);
  const [toFocused, setToFocused] = useState(false);
  const [stopsReady, setStopsReady] = useState(false);
  const [fromHighlight, setFromHighlight] = useState(0);
  const [toHighlight, setToHighlight] = useState(0);

  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fromDropdownRef = useRef<HTMLDivElement>(null);
  const toDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !initialFrom) return;
    setFromStop(initialFrom);
    setFromQuery(initialFrom.displayName);
    setFromFocused(false);
    setToFocused(true);
    requestAnimationFrame(() => toRef.current?.focus());
    onInitialFromHandled?.();
  }, [active, initialFrom, onInitialFromHandled]);

  useEffect(() => {
    if (fromStop && fromQuery.toLowerCase() !== fromStop.displayName.toLowerCase()) {
      setFromStop(null);
    }
  }, [fromQuery, fromStop]);

  useEffect(() => {
    if (!toFocused && !fromFocused) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (
        panelRef.current?.contains(t) ||
        fromDropdownRef.current?.contains(t) ||
        toDropdownRef.current?.contains(t)
      ) return;
      setFromFocused(false);
      setToFocused(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [toFocused, fromFocused]);

  useEffect(() => {
    const eligible = agencies.filter(a => a.slug);
    if (eligible.length === 0) { setStopsReady(true); return; }

    let cancelled = false;

    (async () => {
      const stopResults = await Promise.allSettled(
        eligible.map(async a => {
          const stops = await fetch(a.stopsUrl!).then(r => {
            if (!r.ok) throw new Error(`${a.slug} stops ${r.status}`);
            return r.json();
          });
          return { slug: a.slug, stops };
        }),
      );

      if (cancelled) return;

      const indexes: typeof stopsIndexes = {};
      for (const r of stopResults) {
        if (r.status === 'fulfilled') indexes[r.value.slug] = r.value.stops;
        else console.warn('Corridors: stops load failed', r.reason);
      }
      setStopsIndexes(indexes);
      setStopsReady(true);
    })();

    return () => { cancelled = true; };
  }, [agencies]);

  useEffect(() => {
    if (!fromStop || !toStop) return;

    const fromNorm = fromStop.displayName.toLowerCase();
    const toNorm = toStop.displayName.toLowerCase();
    const slugsNeeded = agencySlugsForQuery(
      stopsIndexes,
      fromNorm,
      toNorm,
      fromStop.agencySlug,
      toStop.agencySlug,
    );

    const fromCache: GeoJsonAgency[] = [];
    for (const slug of slugsNeeded) {
      if (loadedGeoSlugs.current.has(slug)) continue;
      const cached = getCachedAgencyGeo(slug);
      if (cached) {
        fromCache.push({ slug, features: (cached.features ?? []) as GeoJsonAgency['features'] });
        loadedGeoSlugs.current.add(slug);
      }
    }
    if (fromCache.length > 0) {
      setAgencyFeatures(prev => {
        const bySlug = new Map(prev.map(entry => [entry.slug, entry]));
        for (const entry of fromCache) bySlug.set(entry.slug, entry);
        return [...bySlug.values()];
      });
    }

    const toFetch = agencies.filter(
      a => slugsNeeded.has(a.slug) && a.url && !loadedGeoSlugs.current.has(a.slug),
    );
    if (toFetch.length === 0) return;

    let cancelled = false;
    setGeoLoading(true);

    (async () => {
      const geoResults = await Promise.allSettled(
        toFetch.map(async a => {
          const geo = await fetchAgencyGeo(a);
          return { slug: a.slug, features: (geo.features ?? []) as GeoJsonAgency['features'] };
        }),
      );

      if (cancelled) return;

      setAgencyFeatures(prev => {
        const bySlug = new Map(prev.map(entry => [entry.slug, entry]));
        for (const r of geoResults) {
          if (r.status === 'fulfilled') bySlug.set(r.value.slug, r.value);
          else console.warn('Corridors: geo load failed', r.reason);
        }
        return [...bySlug.values()];
      });
      for (const a of toFetch) loadedGeoSlugs.current.add(a.slug);
      setGeoLoading(false);
    })();

    return () => { cancelled = true; };
  }, [fromStop, toStop, stopsIndexes, agencies]);

  const allStops = useMemo(
    () => buildStopCatalog(stopsIndexes, agencies),
    [stopsIndexes, agencies],
  );

  const fromSuggestions = useMemo(() => searchStops(allStops, fromQuery), [fromQuery, allStops]);
  const toSuggestions = useMemo(() => searchStops(allStops, toQuery), [toQuery, allStops]);
  const showFromDropdown = fromFocused && fromQuery.trim().length >= 2 && !fromStop;
  const showToDropdown = toFocused && toQuery.trim().length >= 2 && !toStop;

  useEffect(() => { setFromHighlight(0); }, [fromQuery]);
  useEffect(() => { setToHighlight(0); }, [toQuery]);

  const results = useMemo<RouteGroup[]>(() => {
    if (!fromStop || !toStop) return [];
    const fromNorm = fromStop.displayName.toLowerCase();
    const toNorm = toStop.displayName.toLowerCase();
    const features: RouteFeature[] = [];

    for (const { slug, features: fcs } of agencyFeatures) {
      const agencyStops = stopsIndexes[slug] ?? {};

      const fromIds = new Set<string>();
      const toIds = new Set<string>();
      for (const [id, s] of Object.entries(agencyStops)) {
        const norm = normalizeStopName(s.name).toLowerCase();
        if (norm.includes(fromNorm)) fromIds.add(id);
        if (norm.includes(toNorm)) toIds.add(id);
      }
      if (fromIds.size === 0 || toIds.size === 0) continue;

      const agency = agencies.find(a => a.slug === slug);
      for (const f of fcs) {
        const p = f.properties;
        if (!p.stopOrder || !p.routeShortName || p.day !== day || p.isCorridor) continue;

        let fromIdx = -1, toIdx = -1, toStopId: string | null = null;
        for (let i = 0; i < p.stopOrder.length; i++) {
          if (fromIds.has(p.stopOrder[i]) && fromIdx === -1) fromIdx = i;
          if (toIds.has(p.stopOrder[i])) { toIdx = i; toStopId = p.stopOrder[i]; }
        }
        if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;

        const coords = f.geometry?.coordinates;
        const stopPositions = p.stopPositions;
        let coordinates: number[][] | undefined;
        if (coords && stopPositions && stopPositions.length === p.stopOrder.length) {
          coordinates = clipBetweenStopIndices(coords, stopPositions, fromIdx, toIdx) ?? undefined;
        }

        const stopHeadways = (p as any).stopHeadways as Record<string, number> | undefined;
        const stopHwByPeriod = (p as any).stopPeriodHeadways as Record<string, Partial<Record<string, number>>> | undefined;

        const fromStopId = p.stopOrder[fromIdx];
        const fromStopHeadwayByPeriod: Record<string, number | null> = {};
        for (const pk of PERIOD_KEYS) {
          fromStopHeadwayByPeriod[pk] = stopHwByPeriod
            ? (stopHwByPeriod[fromStopId]?.[pk] ?? null)
            : null;
        }

        const toStopHeadway = toStopId && stopHeadways ? (stopHeadways[toStopId] ?? null) : null;
        const toStopHeadwayByPeriod: Record<string, number | null> = {};
        for (const pk of PERIOD_KEYS) {
          toStopHeadwayByPeriod[pk] = (toStopId && stopHwByPeriod)
            ? (stopHwByPeriod[toStopId]?.[pk] ?? null)
            : null;
        }

        features.push({
          agencySlug: slug,
          agencyName: agency?.name ?? slug,
          routeShortName: p.routeShortName,
          routeLongName: p.routeLongName ?? '',
          headsign: p.headsign ?? '',
          headway: p.headway ?? null,
          headwayByPeriod: p.headwayByPeriod ?? {},
          fromStopHeadwayByPeriod,
          toStopHeadway,
          toStopHeadwayByPeriod,
          color: formatRouteColor(p.routeColor ?? p.color),
          stopOrder: p.stopOrder,
          coordinates,
        });
      }
    }

    const seen = new Set<string>();
    const deduped = features.filter(r => {
      const key = `${r.agencySlug}::${r.routeShortName}::${r.headsign.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    const groups = new Map<string, RouteGroup>();
    for (const r of deduped) {
      const key = `${r.agencySlug}::${r.routeShortName}`;
      if (!groups.has(key)) {
        groups.set(key, {
          agencySlug: r.agencySlug,
          agencyName: r.agencyName,
          routeShortName: r.routeShortName,
          color: r.color,
          branches: [],
          bestHeadway: null,
        });
      }
      const g = groups.get(key)!;
      g.branches.push(r);
      const hw = r.toStopHeadway ?? r.headway;
      if (hw != null && (g.bestHeadway == null || hw < g.bestHeadway)) g.bestHeadway = hw;
    }

    return [...groups.values()].sort((a, b) => (a.bestHeadway ?? 999) - (b.bestHeadway ?? 999));
  }, [fromStop, toStop, day, agencyFeatures, stopsIndexes, agencies]);

  const mapLines = useMemo(() => {
    const lines: Array<{ key: string; coordinates: number[][]; color: string }> = [];
    for (const g of results) {
      for (const b of g.branches) {
        if (!b.coordinates || b.coordinates.length < 2) continue;
        lines.push({
          key: `${b.agencySlug}::${b.routeShortName}::${b.headsign}`,
          coordinates: b.coordinates,
          color: b.color,
        });
      }
    }
    return lines;
  }, [results]);

  const fitPoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (fromStop) pts.push([fromStop.lat, fromStop.lon]);
    if (toStop) pts.push([toStop.lat, toStop.lon]);
    for (const line of mapLines) {
      for (const [lon, lat] of line.coordinates) pts.push([lat, lon]);
    }
    return pts;
  }, [fromStop, toStop, mapLines]);

  useEffect(() => {
    if (!active) {
      setOverlay(null);
      return;
    }
    setOverlay({
      lines: mapLines,
      fromStop: fromStop ? { lat: fromStop.lat, lon: fromStop.lon } : null,
      toStop: toStop ? { lat: toStop.lat, lon: toStop.lon } : null,
      fitPoints,
    });
    return () => setOverlay(null);
  }, [active, mapLines, fromStop, toStop, fitPoints, setOverlay]);

  function selectFrom(s: StopEntry) {
    setFromStop(s);
    setFromQuery(s.displayName);
    setFromHighlight(0);
    setFromFocused(false);
    if (!toStop) {
      setToFocused(true);
      toRef.current?.focus();
    }
  }

  function selectTo(s: StopEntry) {
    setToStop(s);
    setToQuery(s.displayName);
    setToFocused(false);
    setToHighlight(0);
  }

  function tryAutoSelectFrom() {
    if (fromStop) return;
    const pick = resolveAutoSelect(fromSuggestions, fromQuery);
    if (pick) selectFrom(pick);
  }

  function tryAutoSelectTo() {
    if (toStop) return;
    const pick = resolveAutoSelect(toSuggestions, toQuery);
    if (pick) selectTo(pick);
  }

  function handleListKeyDown(
    e: React.KeyboardEvent,
    suggestions: StopEntry[],
    highlight: number,
    setHighlight: (n: number) => void,
    select: (s: StopEntry) => void,
    tryAuto: () => void,
    onEscape?: () => void,
  ) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length) setHighlight(Math.min(highlight + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length) setHighlight(Math.max(highlight - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlight]) select(suggestions[highlight]);
      else tryAuto();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onEscape?.();
    }
  }

  function clearFrom() {
    setFromStop(null);
    setFromQuery('');
    setFromFocused(true);
    fromRef.current?.focus();
  }

  function clearTo() {
    setToStop(null);
    setToQuery('');
    setToFocused(true);
    toRef.current?.focus();
  }

  if (!active) return null;

  const panelLeft = sidebarLeft ?? SIDEBAR_LEFT_FALLBACK;

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none" inert={!active}>
      <div
        ref={panelRef}
        className={`absolute top-20 ${Z_PANEL} w-[min(32rem,calc(100vw-3rem))] max-h-[calc(100vh-104px)] flex flex-col pointer-events-auto ${FLOATING_CARD} ${PANEL_ENTER} overflow-hidden`}
        style={{ left: panelLeft }}
      >
        <div className={PANEL_TITLE_BAR}>
          <ArrowLeftRight className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
          <span className={PANEL_TITLE}>Direct routes</span>
        </div>

        <div className="p-3 flex flex-col gap-2 border-b border-[var(--border-primary)] shrink-0">
          <div className="relative" ref={fromDropdownRef}>
            <StopInput
              ref={fromRef}
              label="From"
              value={fromQuery}
              selected={!!fromStop}
              onChange={v => { setFromQuery(v); setFromStop(null); setFromFocused(true); }}
              onFocus={() => setFromFocused(true)}
              onBlur={() => { tryAutoSelectFrom(); setFromFocused(false); }}
              onKeyDown={e => handleListKeyDown(
                e, fromSuggestions, fromHighlight, setFromHighlight, selectFrom, tryAutoSelectFrom,
                () => setFromFocused(false),
              )}
              onClear={clearFrom}
            />
            {showFromDropdown && (
              <StopSuggestions
                suggestions={fromSuggestions}
                highlight={fromHighlight}
                stopsReady={stopsReady}
                onSelect={selectFrom}
              />
            )}
          </div>

          <div className="relative" ref={toDropdownRef}>
            <StopInput
              ref={toRef}
              label="To"
              value={toQuery}
              selected={!!toStop}
              onChange={v => { setToQuery(v); setToStop(null); setToFocused(true); }}
              onFocus={() => setToFocused(true)}
              onBlur={() => { tryAutoSelectTo(); setToFocused(false); }}
              onKeyDown={e => handleListKeyDown(
                e, toSuggestions, toHighlight, setToHighlight, selectTo, tryAutoSelectTo,
                () => setToFocused(false),
              )}
              onClear={clearTo}
            />
            {showToDropdown && (
              <StopSuggestions
                suggestions={toSuggestions}
                highlight={toHighlight}
                stopsReady={stopsReady}
                onSelect={selectTo}
              />
            )}
          </div>
        </div>

        {fromStop && toStop && (
          <div className={`${PANEL_BODY} min-h-0`}>
            {geoLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6">
                <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-[10px] font-bold text-[var(--text-muted)]">Searching routes…</span>
              </div>
            ) : results.length === 0 ? (
              <p className={`${PANEL_EMPTY} text-center`}>No direct routes found</p>
            ) : (
              <ServiceTimeline results={results} fromStop={fromStop} toStop={toStop} day={day} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
