import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Info, Search, X, Sun, Moon } from 'lucide-react';
import type { Agency } from '../App';
import { FLOATING_CARD, ICON_BTN, Z_PANEL, Z_HEADER, Z_DROPDOWN } from '../styles';
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
import { type RouteFeature, type RouteGroup, fmtHeadway } from './corridor-types';
import { ServiceTimeline } from './ServiceTimeline';
import { StopInput } from './StopInput';
import { RouteGroupCard } from './RouteGroupCard';

export type CorridorsFromInputBindings = {
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
};

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  fromQuery: string;
  setFromQuery: (v: string) => void;
  fromFocused: boolean;
  fromInputRef: React.RefObject<HTMLInputElement | null>;
  onBindFromInput?: (bindings: CorridorsFromInputBindings | null) => void;
  active?: boolean;
  onInfoOpen?: () => void;
  fromBarAnchor?: { left: number; bottom: number; width: number };
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

const PERIOD_LABELS: Record<string, string> = {
  amPeak: 'AM Peak',
  midday: 'Midday',
  pmPeak: 'PM Peak',
  evening: 'Evening',
};


/** Agencies that might serve a direct corridor between two normalized stop names. */
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

export default function Corridors({ agencies, lightMode, setLightMode, fromQuery, setFromQuery, fromFocused, fromInputRef, onBindFromInput, active = true, onInfoOpen, fromBarAnchor }: Props) {
  // Derived positions from the measured From search bar. Fallbacks are for the
  // very first render before ResizeObserver fires (sub-frame, visually invisible).
  const anchorLeft   = fromBarAnchor?.left   ?? 182;
  const anchorBottom = fromBarAnchor?.bottom ?? 56;
  const anchorWidth  = fromBarAnchor?.width  ?? 160;

  // Vertical positions of each floating panel, relative to the header bottom
  const FROM_AC_TOP   = anchorBottom + 4;   // From autocomplete
  const TO_PANEL_TOP  = anchorBottom + 8;   // To panel wrapper
  const TO_AC_TOP     = anchorBottom + 44;  // To autocomplete
  const RESULTS_TOP   = anchorBottom + 48;  // Results list
  const RESULTS_MAX_H = anchorBottom + 64;  // max-height budget for results

  const { setOverlay } = useCorridorMapOverlay();
  const [stopsIndexes, setStopsIndexes] = useState<Record<string, Record<string, { name: string; lat: number; lon: number }>>>({});
  const [agencyFeatures, setAgencyFeatures] = useState<GeoJsonAgency[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const loadedGeoSlugs = useRef(new Set<string>());

  const [fromStop, setFromStop] = useState<StopEntry | null>(null);
  const [toQuery, setToQuery] = useState('');
  const [toStop, setToStop] = useState<StopEntry | null>(null);
  const [toActive, setToActive] = useState(false);
  const [day, setDay] = useState<'Weekday' | 'Saturday' | 'Sunday'>('Weekday');
  const [stopsReady, setStopsReady] = useState(false);
  const [fromHighlight, setFromHighlight] = useState(0);
  const [toHighlight, setToHighlight] = useState(0);

  // Clear fromStop when the search bar query no longer matches it
  useEffect(() => {
    if (fromStop && fromQuery.toLowerCase() !== fromStop.displayName.toLowerCase()) {
      setFromStop(null);
    }
  }, [fromQuery, fromStop]);

  const toRef = useRef<HTMLInputElement>(null);
  const toPanelRef = useRef<HTMLDivElement>(null);
  const fromDropdownRef = useRef<HTMLDivElement>(null);
  const toDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toActive && !fromFocused) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (
        fromInputRef.current?.contains(t) ||
        fromDropdownRef.current?.contains(t) ||
        toPanelRef.current?.contains(t) ||
        toDropdownRef.current?.contains(t)
      ) return;
      setToActive(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [toActive, fromFocused, fromInputRef]);

  // Stops indexes on mount (powers autocomplete); route GeoJSON loads when From+To are set.
  useEffect(() => {
    const eligible = agencies.filter(a => a.slug); // all processed agencies support stops + geo; urls derived on demand
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
  const showToDropdown = toActive && toQuery.trim().length >= 2 && !toStop;

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

        // FROM stop headway — this is where the user waits, so it's the most honest number.
        // TO stop headway can be misleadingly low at major hubs (many patterns converge there).
        const fromStopId = p.stopOrder[fromIdx];
        const fromStopHeadwayByPeriod: Record<string, number | null> = {};
        for (const pk of Object.keys(PERIOD_LABELS)) {
          fromStopHeadwayByPeriod[pk] = stopHwByPeriod
            ? (stopHwByPeriod[fromStopId]?.[pk] ?? null)
            : null;
        }

        const toStopHeadway = toStopId && stopHeadways ? (stopHeadways[toStopId] ?? null) : null;
        const toStopHeadwayByPeriod: Record<string, number | null> = {};
        for (const pk of Object.keys(PERIOD_LABELS)) {
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

    // Dedup branches by normalized headsign within each route
    const seen = new Set<string>();
    const deduped = features.filter(r => {
      const key = `${r.agencySlug}::${r.routeShortName}::${r.headsign.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    // Group by route number + agency
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
    if (!toStop) { setToActive(true); toRef.current?.focus(); }
  }

  function selectTo(s: StopEntry) {
    setToStop(s);
    setToQuery(s.displayName);
    setToActive(false);
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

  const handleFromKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    handleListKeyDown(
      e, fromSuggestions, fromHighlight, setFromHighlight, selectFrom, tryAutoSelectFrom,
      () => fromInputRef.current?.blur(),
    );
  }, [fromSuggestions, fromHighlight, fromQuery, fromStop]);

  const handleFromBlur = useCallback(() => {
    tryAutoSelectFrom();
  }, [fromSuggestions, fromQuery, fromStop]);

  useEffect(() => {
    onBindFromInput?.({ onKeyDown: handleFromKeyDown, onBlur: handleFromBlur });
    return () => onBindFromInput?.(null);
  }, [onBindFromInput, handleFromKeyDown, handleFromBlur]);

  function clearTo() { setToStop(null); setToQuery(''); setToActive(true); toRef.current?.focus(); }

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none" inert={!active}>
      {/* From autocomplete — fixed below the App.tsx search bar */}
      {showFromDropdown && (
        <div
          ref={fromDropdownRef}
          className={`fixed ${Z_DROPDOWN} bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl shadow-2xl overflow-hidden pointer-events-auto`}
          style={{ top: FROM_AC_TOP, left: anchorLeft, width: anchorWidth }}
        >
          {fromSuggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
              {!stopsReady ? 'Loading stations…' : 'No stations found'}
            </div>
          ) : fromSuggestions.map((s, i) => (
            <button
              key={`${s.agencySlug}::${s.stopId}`}
              onMouseDown={e => { e.preventDefault(); selectFrom(s); }}
              className={[
                'w-full text-left px-3 py-2 transition-colors',
                i === fromHighlight ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
              ].join(' ')}
            >
              <div className="text-xs font-bold text-[var(--text-primary)] truncate">{s.displayName}</div>
            </button>
          ))}
        </div>
      )}

      {/* To pill — same style as From (App.tsx search bar), stacked below it */}
      <div ref={toPanelRef} className={`absolute ${Z_HEADER} pointer-events-auto`} style={{ top: TO_PANEL_TOP, left: anchorLeft, width: anchorWidth }}>
        <div className="h-8 relative flex items-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl pl-2 pr-3">
          <Search className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
          <input
            ref={toRef}
            type="text"
            value={toQuery}
            onChange={e => { setToQuery(e.target.value); setToStop(null); setToActive(true); }}
            onFocus={() => setToActive(true)}
            onBlur={() => tryAutoSelectTo()}
            onKeyDown={e => handleListKeyDown(
              e, toSuggestions, toHighlight, setToHighlight, selectTo, tryAutoSelectTo,
              () => setToActive(false),
            )}
            placeholder={toActive || toQuery ? 'Search stations…' : 'To'}
            className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-dim)] pl-2 py-0 text-xs font-bold focus:outline-none"
          />
          {toQuery && (
            <button onClick={clearTo} className="absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* To autocomplete — fixed below To pill (same pattern as From) */}
      {showToDropdown && (
        <div
          ref={toDropdownRef}
          className={`fixed ${Z_DROPDOWN} bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl shadow-2xl overflow-hidden pointer-events-auto`}
          style={{ top: TO_AC_TOP, left: anchorLeft, width: anchorWidth }}
        >
          {toSuggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
              {!stopsReady ? 'Loading stations…' : 'No stations found'}
            </div>
          ) : toSuggestions.map((s, i) => (
            <button
              key={`${s.agencySlug}::${s.stopId}`}
              onMouseDown={e => { e.preventDefault(); selectTo(s); }}
              className={[
                'w-full text-left px-3 py-2 transition-colors',
                i === toHighlight ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
              ].join(' ')}
            >
              <div className="text-xs font-bold text-[var(--text-primary)] truncate">{s.displayName}</div>
            </button>
          ))}
        </div>
      )}

      {/* Single combined panel */}
      {fromStop && toStop && (
        <div
          className={`absolute ${Z_HEADER} pointer-events-auto ${FLOATING_CARD} overflow-hidden`}
          style={{ top: RESULTS_TOP, left: anchorLeft, width: 500, maxHeight: `calc(100vh - ${RESULTS_MAX_H}px)` }}
        >
          {geoLoading ? (
            <div className="flex items-center justify-center h-24 text-[var(--text-muted)] text-xs px-4 text-center">
              Searching routes…
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[var(--text-muted)] text-xs px-4 text-center">
              No direct routes found
            </div>
          ) : (
            <ServiceTimeline results={results} fromStop={fromStop} toStop={toStop} day={day} />
          )}
        </div>
      )}

      {/* Day picker + info — top-right */}
      <div className={`absolute top-6 right-6 ${Z_HEADER} flex items-center gap-1.5 pointer-events-auto`}>
        {(['Weekday', 'Saturday', 'Sunday'] as const).map(d => (
          <button
            key={d}
            onClick={() => setDay(d)}
            className={[
              'h-8 text-xs font-bold px-3 rounded-full shadow-2xl border transition-colors',
              day === d
                ? 'bg-[var(--bg-panel)] border-[var(--border-primary)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-panel)] border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            ].join(' ')}
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setLightMode(!lightMode)}
          className={ICON_BTN}
          aria-label="Toggle light mode"
        >
          {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        {onInfoOpen && (
          <button
            onClick={onInfoOpen}
            className={ICON_BTN}
            aria-label="About Atlas"
          >
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

