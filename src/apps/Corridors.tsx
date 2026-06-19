import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import type { Agency } from '../App';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  // From search lives in the App.tsx search bar
  fromQuery: string;
  setFromQuery: (v: string) => void;
  fromFocused: boolean;
  fromInputRef: React.RefObject<HTMLInputElement | null>;
}

// Strip platform/bay/direction suffixes so "Hamilton GO Centre Platform 18"
// and "Hamilton GO Centre Bus" both resolve to "Hamilton GO Centre" in search.
function normalizeStopName(name: string): string {
  return name
    .replace(/\s+platform\s+\w+/gi, '')
    .replace(/\s+bay\s+\w+/gi, '')
    .replace(/\s+stop\s+\w+/gi, '')
    .replace(/\s+bus(\s+terminal)?$/gi, '')
    .replace(/\s+(train|rail)(\s+station)?$/gi, '')
    .replace(/\bopposite\b.*/i, '')
    .trim();
}

interface StopEntry {
  name: string;        // original name
  displayName: string; // normalized for display + dedup
  lat: number;
  lon: number;
  agencySlug: string;
  agencyName: string;
  stopId: string;
}

interface RouteFeature {
  agencySlug: string;
  agencyName: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  headway: number | null;           // route-level (fallback)
  headwayByPeriod: Record<string, number | null>; // route-level (fallback)
  toStopHeadway: number | null;     // headway at the TO stop specifically
  toStopHeadwayByPeriod: Record<string, number | null>;
  color: string;
  stopOrder: string[];
}

interface RouteGroup {
  agencySlug: string;
  agencyName: string;
  routeShortName: string;
  color: string;
  branches: RouteFeature[];
  bestHeadway: number | null;
}

interface GeoJsonAgency {
  slug: string;
  features: Array<{
    properties: {
      routeId?: string;
      routeShortName?: string;
      routeLongName?: string;
      headsign?: string;
      headway?: number;
      headwayByPeriod?: Record<string, number | null>;
      color?: string;
      stopOrder?: string[];
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

function fmtHeadway(hw: number | null | undefined): string {
  if (hw == null) return '—';
  if (hw >= 60) return `${Math.round(hw / 60)}h`;
  return `${Math.round(hw)} min`;
}

export default function Corridors({ agencies, lightMode, fromQuery, setFromQuery, fromFocused, fromInputRef }: Props) {
  const [stopsIndexes, setStopsIndexes] = useState<Record<string, Record<string, { name: string; lat: number; lon: number }>>>({});
  const [agencyFeatures, setAgencyFeatures] = useState<GeoJsonAgency[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromStop, setFromStop] = useState<StopEntry | null>(null);
  const [toQuery, setToQuery] = useState('');
  const [toStop, setToStop] = useState<StopEntry | null>(null);
  const [toActive, setToActive] = useState(false);
  const [day, setDay] = useState<'Weekday' | 'Saturday' | 'Sunday'>('Weekday');
  const [panelVisible, setPanelVisible] = useState(false);

  // Clear fromStop when the search bar query no longer matches it
  useEffect(() => {
    if (fromStop && fromQuery.toLowerCase() !== fromStop.displayName.toLowerCase()) {
      setFromStop(null);
    }
  }, [fromQuery]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPanelVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const toRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toActive) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        fromInputRef.current && !fromInputRef.current.contains(e.target as Node)
      ) {
        setToActive(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [toActive]);

  // Load all stops indexes and GeoJSON on mount
  useEffect(() => {
    const eligible = agencies.filter(a => (a as any).stopsUrl && a.url);
    if (eligible.length === 0) { setLoading(false); return; }

    Promise.all(
      eligible.map(async a => {
        const [stopsRes, geoRes] = await Promise.all([
          fetch((a as any).stopsUrl).then(r => r.json()),
          fetch(a.url).then(r => r.json()),
        ]);
        return { agency: a, stops: stopsRes, geo: geoRes };
      })
    ).then(results => {
      const indexes: typeof stopsIndexes = {};
      const features: GeoJsonAgency[] = [];
      for (const { agency, stops, geo } of results) {
        indexes[agency.slug] = stops;
        features.push({ slug: agency.slug, features: geo.features ?? [] });
      }
      setStopsIndexes(indexes);
      setAgencyFeatures(features);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agencies]);

  // Flatten stops for search, deduped by normalized name only (cross-agency).
  // Hamilton GO Centre is one place regardless of whether GO Transit or HSR owns the stop.
  const allStops = useMemo<StopEntry[]>(() => {
    const seen = new Set<string>();
    const out: StopEntry[] = [];
    for (const [slug, index] of Object.entries(stopsIndexes)) {
      const agency = agencies.find(a => a.slug === slug);
      for (const [stopId, s] of Object.entries(index)) {
        const displayName = normalizeStopName(s.name);
        const key = displayName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ stopId, agencySlug: slug, agencyName: agency?.name ?? slug, displayName, ...s });
      }
    }
    return out;
  }, [stopsIndexes, agencies]);

  function searchStops(q: string): StopEntry[] {
    if (q.trim().length < 2) return [];
    const lower = q.toLowerCase();
    return allStops.filter(s => s.displayName.toLowerCase().includes(lower)).slice(0, 8);
  }

  const fromSuggestions = useMemo(() => searchStops(fromQuery), [fromQuery, allStops]);
  const toSuggestions = useMemo(() => searchStops(toQuery), [toQuery, allStops]);
  const showFromDropdown = fromFocused && fromSuggestions.length > 0 && !fromStop;

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

        // Headway at the TO stop specifically — more accurate than the route terminal median
        const stopHeadways = (p as any).stopHeadways as Record<string, number> | undefined;
        const stopHwByPeriod = (p as any).stopPeriodHeadways as Record<string, Partial<Record<string, number>>> | undefined;
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
          toStopHeadway,
          toStopHeadwayByPeriod,
          color: p.color ?? '#555',
          stopOrder: p.stopOrder,
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

  function selectFrom(s: StopEntry) {
    setFromStop(s);
    setFromQuery(s.displayName);
    if (!toStop) { setToActive(true); toRef.current?.focus(); }
  }

  function selectTo(s: StopEntry) {
    setToStop(s);
    setToQuery(s.displayName);
    setToActive(false);
  }

  function clearTo() { setToStop(null); setToQuery(''); setToActive(true); toRef.current?.focus(); }

  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Base map */}
      <MapContainer
        center={[43.7, -79.4]}
        zoom={9}
        zoomControl={false}
        className="absolute inset-0 h-full w-full"
      >
        <TileLayer
          key={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={tileUrl}
        />
      </MapContainer>

      {/* From autocomplete — fixed below the App.tsx search bar */}
      {showFromDropdown && (
        <div
          className="fixed z-[1200] bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl shadow-2xl overflow-hidden"
          style={{ top: 60, left: 104, width: 256 }}
        >
          {fromSuggestions.map(s => (
            <button
              key={`${s.agencySlug}::${s.stopId}`}
              onMouseDown={e => { e.preventDefault(); selectFrom(s); }}
              className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors"
            >
              <div className="text-xs font-bold text-[var(--text-primary)] truncate">{s.displayName}</div>
            </button>
          ))}
        </div>
      )}

      {/* To pill — same style as From (App.tsx search bar), stacked below it */}
      <div ref={panelRef} className="absolute z-[500]" style={{ top: 64, left: 104, width: 256 }}>
        <div className="h-8 relative flex items-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl pl-2 pr-3">
          <Search className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
          <input
            ref={toRef}
            type="text"
            value={toQuery}
            onChange={e => { setToQuery(e.target.value); setToStop(null); setToActive(true); }}
            onFocus={() => setToActive(true)}
            onBlur={() => {/* keep toActive; dismissed by click-outside */}}
            placeholder={toActive || toQuery ? 'Search stations…' : 'To'}
            className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-dim)] pl-2 py-0 text-xs font-bold focus:outline-none"
          />
          {toQuery && (
            <button onClick={clearTo} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* To autocomplete */}
        {toActive && toSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl shadow-2xl overflow-hidden z-50">
            {toSuggestions.map(s => (
              <button
                key={`${s.agencySlug}::${s.stopId}`}
                onMouseDown={e => { e.preventDefault(); selectTo(s); }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="text-xs font-bold text-[var(--text-primary)] truncate">{s.displayName}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results panel — only appears once both stops are selected */}
      {fromStop && toStop && (
        <div
          className="absolute z-[500] bg-[var(--bg-panel)] rounded-2xl shadow-2xl border border-[var(--border-primary)] overflow-hidden flex flex-col"
          style={{ top: 104, left: 104, width: 256, maxHeight: 'calc(100vh - 120px)' }}
        >
          {results.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[var(--text-muted)] text-xs px-4 text-center">
              No direct routes found
            </div>
          ) : (
            <div className="overflow-y-auto py-3 px-4 flex flex-col gap-2">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                {results.length} route{results.length !== 1 ? 's' : ''} · {day}
              </p>
              {results.map((g, i) => (
                <RouteGroupCard key={i} group={g} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Day picker — top-right */}
      <div className="absolute top-6 right-6 z-[500] flex gap-1.5">
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
      </div>

      {/* Timeline panel — right of results, appears with results */}
      {(fromStop && toStop) && (
        <div
          className="absolute z-[500] bg-[var(--bg-panel)] rounded-2xl shadow-2xl border border-[var(--border-primary)] overflow-hidden"
          style={{ top: 104, left: 104 + 256 + 16, right: 24, maxHeight: 'calc(100vh - 120px)' }}
        >
          <ServiceTimeline results={results} fromStop={fromStop} toStop={toStop} />
        </div>
      )}
    </div>
  );
}

// Approximate period durations in hours (used for proportional flex widths)
const TIMELINE_PERIODS: Array<{ key: string; label: string; time: string; flex: number }> = [
  { key: 'amPeak',  label: 'AM Peak', time: '6–9 AM',     flex: 3 },
  { key: 'midday',  label: 'Midday',  time: '9 AM–3 PM',  flex: 6 },
  { key: 'pmPeak',  label: 'PM Peak', time: '3–7 PM',     flex: 4 },
  { key: 'evening', label: 'Evening', time: '7–10 PM',    flex: 5 },
];

function hwColor(hw: number | null): { bg: string; fg: string } {
  if (hw == null) return { bg: 'var(--bg-hover)',  fg: 'var(--text-dim)' };
  if (hw <= 10)   return { bg: '#22863a',          fg: '#fff' };
  if (hw <= 15)   return { bg: '#3da44d',          fg: '#fff' };
  if (hw <= 20)   return { bg: '#78c87e',          fg: '#1a1a1a' };
  if (hw <= 30)   return { bg: '#d4a017',          fg: '#fff' };
  if (hw <= 60)   return { bg: '#d4671e',          fg: '#fff' };
  return                  { bg: '#c0392b',          fg: '#fff' };
}

function ServiceTimeline({
  results,
  fromStop,
  toStop,
}: {
  results: RouteGroup[];
  fromStop: StopEntry | null;
  toStop: StopEntry | null;
}) {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--text-muted)] text-xs text-center">
        No direct service found between these stations
      </div>
    );
  }

  const LABEL_W = 120;

  return (
    <div className="overflow-y-auto p-6">
      {/* Period header */}
      <div className="flex mb-3" style={{ marginLeft: LABEL_W + 8 }}>
        {TIMELINE_PERIODS.map(p => (
          <div key={p.key} className="flex flex-col" style={{ flex: p.flex }}>
            <span className="text-[10px] font-bold text-[var(--text-primary)] leading-none">{p.label}</span>
            <span className="text-[9px] text-[var(--text-dim)] mt-0.5">{p.time}</span>
          </div>
        ))}
      </div>

      {/* Route groups */}
      <div className="flex flex-col gap-3">
        {results.map((g, gi) => (
          <div key={gi}>
            {/* Route badge */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0"
                style={{ backgroundColor: g.color || '#555' }}
              >
                {g.routeShortName}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{g.agencyName}</span>
            </div>

            {/* Branch rows */}
            <div className="flex flex-col gap-1">
              {g.branches.map((b, bi) => {
                const hw = b.toStopHeadwayByPeriod.amPeak != null || b.toStopHeadwayByPeriod.midday != null
                  ? b.toStopHeadwayByPeriod
                  : b.headwayByPeriod;
                return (
                  <div key={bi} className="flex items-center gap-2">
                    <div className="shrink-0 text-right pr-2" style={{ width: LABEL_W }}>
                      <span className="text-[10px] text-[var(--text-muted)] truncate block">
                        to {b.headsign || b.routeLongName}
                      </span>
                    </div>
                    <div className="flex flex-1 rounded overflow-hidden h-7 gap-px">
                      {TIMELINE_PERIODS.map(p => {
                        const val = hw[p.key] ?? null;
                        const { bg, fg } = hwColor(val);
                        return (
                          <div
                            key={p.key}
                            className="flex items-center justify-center"
                            style={{ flex: p.flex, backgroundColor: bg }}
                          >
                            <span className="text-[10px] font-bold" style={{ color: fg }}>
                              {fmtHeadway(val)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <span className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider font-bold">Frequency</span>
        {[
          { label: '≤10 min', hw: 10 },
          { label: '≤15 min', hw: 15 },
          { label: '≤20 min', hw: 20 },
          { label: '≤30 min', hw: 30 },
          { label: '≤60 min', hw: 60 },
          { label: '>60 min', hw: 120 },
        ].map(({ label, hw }) => {
          const { bg } = hwColor(hw);
          return (
            <div key={label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bg }} />
              <span className="text-[9px] text-[var(--text-muted)]">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StopInputProps {
  label: string;
  value: string;
  selected: boolean;
  onChange: (v: string) => void;
  onFocus: () => void;
  onClear: () => void;
}

const StopInput = React.forwardRef<HTMLInputElement, StopInputProps>(
  ({ label, value, selected, onChange, onFocus, onClear }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const placeholder = (focused || value) ? 'Search stations…' : label;
    return (
      <div className="flex items-center gap-2 h-9 bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-lg px-3 focus-within:border-[var(--accent)] transition-colors">
        <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { setFocused(true); onFocus(); }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none min-w-0"
        />
        {value && (
          <button onClick={onClear} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }
);
StopInput.displayName = 'StopInput';

function RouteGroupCard({ group }: { group: RouteGroup }) {
  return (
    <div className="bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
      {/* Route header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0"
          style={{ backgroundColor: group.color || '#555' }}
        >
          {group.routeShortName}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{group.agencyName}</span>
        {group.bestHeadway != null && (
          <span className="ml-auto text-xs font-black text-[var(--text-primary)]">
            {fmtHeadway(group.bestHeadway)}
          </span>
        )}
      </div>

      {/* Branches */}
      <div className="divide-y divide-[var(--border-primary)]">
        {group.branches.map((b, i) => {
          const hw = b.toStopHeadway ?? b.headway;
          const byPeriod = Object.entries(PERIOD_LABELS).filter(
            ([key]) => (b.toStopHeadwayByPeriod[key] ?? b.headwayByPeriod[key]) != null
          );
          return (
            <div key={i} className="px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  to {b.headsign || b.routeLongName}
                </span>
                {group.branches.length > 1 && hw != null && (
                  <span className="text-[11px] font-bold text-[var(--text-primary)]">
                    {fmtHeadway(hw)}
                  </span>
                )}
              </div>
              {byPeriod.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {byPeriod.map(([key, label]) => {
                    const val = b.toStopHeadwayByPeriod[key] ?? b.headwayByPeriod[key];
                    return (
                      <span key={key} className="text-[10px] text-[var(--text-muted)]">
                        <span className="font-bold text-[var(--text-primary)]">{fmtHeadway(val)}</span>
                        {' '}{label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
