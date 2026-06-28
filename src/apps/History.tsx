import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import { R2_PUBLIC_URL } from '../../shared/config';
import { FLOATING_CARD, PANEL_ENTER, TRANSITION_SLOW } from '../styles';

export interface RouteSnapshot {
  label: string;
  year: number;
  weekdayHeadwayMin: number;
  note?: string;
}

export interface RouteHistoryEntry {
  routeShortName: string;
  routeName: string;
  snapshots: RouteSnapshot[];
}

export interface AgencyHistory {
  slug: string;
  name: string;
  region: string;
  center?: [number, number];
  routes: RouteHistoryEntry[];
}

interface Props {
  active: boolean;
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
  query: string;
  searchFocused: boolean;
  setQuery: (q: string) => void;
}

function changeSummary(entry: RouteHistoryEntry): { text: string; worse: boolean } | null {
  const snaps = entry.snapshots;
  if (snaps.length < 2) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const ratio = last.weekdayHeadwayMin / first.weekdayHeadwayMin;
  if (Math.abs(ratio - 1) < 0.05) return null;
  if (ratio > 1) {
    const x = Math.round(ratio * 10) / 10;
    return { text: `${x}× less frequent since ${first.label}`, worse: true };
  }
  const x = Math.round((1 / ratio) * 10) / 10;
  return { text: `${x}× more frequent since ${first.label}`, worse: false };
}


function RouteHistoryCard({
  route,
  agencyName,
  region,
  onBack,
}: {
  route: RouteHistoryEntry;
  agencyName: string;
  region: string;
  onBack: () => void;
}) {
  const snaps = route.snapshots;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const worse = last.weekdayHeadwayMin > first.weekdayHeadwayMin;
  const better = last.weekdayHeadwayMin < first.weekdayHeadwayMin;
  const summary = changeSummary(route);

  return (
    <div className={`${FLOATING_CARD} flex flex-col overflow-hidden ${PANEL_ENTER}`}>
      {/* Header section styled exactly like the Frequency route card */}
      <div className="shrink-0 flex items-start justify-between px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight truncate">
            {route.routeShortName}
            {route.routeName && <span className="font-normal text-[var(--text-dim)] ml-1.5">{route.routeName}</span>}
          </h3>
          <p className="text-[10px] text-[var(--text-muted)] font-bold tracking-wide mt-0.5">
            {agencyName} · {region}
          </p>
        </div>
        <button
          onClick={onBack}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0 mt-0.5"
          aria-label="Back to routes"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 pt-0 flex flex-col gap-4 flex-1 overflow-y-auto custom-scrollbar">
        <div>
          <span className="text-[9px] font-bold tracking-wider text-[var(--text-muted)] uppercase block mb-0.5">Weekday Midday Headway</span>
          <span className="text-[8px] text-[var(--text-dim)] block mb-2">Service frequency in minutes (12 PM – 3 PM)</span>
          <div className="flex items-end gap-2 flex-wrap bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl p-3 shadow-sm">
            {snaps.map((snap, i) => {
              const isLast = i === snaps.length - 1;
              const headwayColor = isLast
                ? worse ? 'text-red-500' : better ? 'text-green-500' : 'text-[var(--text-primary)]'
                : 'text-[var(--text-dim)]';
              return (
                <React.Fragment key={snap.label}>
                  <div className="flex flex-col items-center">
                    <span className={`text-base font-black tabular-nums leading-none ${headwayColor}`}>
                      {snap.weekdayHeadwayMin} min
                    </span>
                    <span className="text-[8px] font-bold mt-1 text-[var(--text-dim)]">
                      {snap.label}
                    </span>
                  </div>
                  {!isLast && (
                    <span className="text-[var(--text-dim)] mb-0.5 text-xs">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {summary && (
          <div className={`border-l-2 pl-3 py-0.5 ${summary.worse ? 'border-red-500 text-red-500' : 'border-green-500 text-green-500'}`}>
            <p className="text-xs font-black leading-tight">{summary.text}</p>
            <p className="text-[9px] text-[var(--text-muted)] font-medium mt-0.5">
              Weekday midday headway comparison from {first.label} to {last.label}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const SINCE_FILTERS = [
  { label: 'All time', year: 0 },
  { label: 'Since 2018', year: 2018 },
  { label: 'Since 2022', year: 2022 },
] as const;

function HistoryAgencyPanel({
  agencyHistory,
  onClose,
  onRouteSelect,
}: {
  agencyHistory: AgencyHistory;
  onClose: () => void;
  onRouteSelect: (routeShortName: string) => void;
}) {
  const [routeQuery, setRouteQuery] = useState('');

  const minYear = useMemo(() => {
    const all = agencyHistory.routes.flatMap(r => r.snapshots.map(s => s.year));
    return all.length ? Math.min(...all) : 0;
  }, [agencyHistory]);

  const maxYear = useMemo(() => {
    const all = agencyHistory.routes.flatMap(r => r.snapshots.map(s => s.year));
    return all.length ? Math.max(...all) : 0;
  }, [agencyHistory]);

  const routeRows = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    return agencyHistory.routes
      .map(route => {
        if (route.snapshots.length === 0) return null;
        const first = route.snapshots[0];
        const last = route.snapshots[route.snapshots.length - 1];
        const ratio = route.snapshots.length > 1 ? last.weekdayHeadwayMin / first.weekdayHeadwayMin : 1;
        const worse = ratio > 1.05;
        const better = ratio < 0.95;
        return { route, first, last, ratio, worse, better };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter(({ route }) =>
        !q ||
        route.routeShortName.toLowerCase().includes(q) ||
        route.routeName.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (a.worse && b.worse) return b.ratio - a.ratio;
        if (a.better && b.better) return a.ratio - b.ratio;
        if (a.worse !== b.worse) return a.worse ? -1 : 1;
        if (a.better !== b.better) return a.better ? -1 : 1;
        return 0;
      });
  }, [agencyHistory, routeQuery]);

  return (
    <div className={`${FLOATING_CARD} flex flex-col overflow-hidden max-h-[calc(100vh-104px)] ${PANEL_ENTER}`}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-[var(--text-primary)] leading-tight">{agencyHistory.name}</h2>
            <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide mt-0.5">
              {agencyHistory.region} · {agencyHistory.routes.length} routes · {minYear}–{maxYear}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0 mt-0.5"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Route search */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--border-primary)]">
        <div className="relative">
          <input
            type="text"
            value={routeQuery}
            onChange={e => setRouteQuery(e.target.value)}
            placeholder="Filter routes…"
            className="w-full h-7 pl-2.5 pr-6 rounded-lg bg-[var(--bg-app)] border border-[var(--border-primary)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {routeQuery && (
            <button
              onClick={() => setRouteQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {routeRows.length === 0 && (
          <p className="text-[11px] text-[var(--text-dim)] px-4 py-3">
            {routeQuery ? 'No routes match.' : 'No data for this period.'}
          </p>
        )}
        {routeRows.map(({ route, worse, better }) => (
          <button
            key={route.routeShortName}
            onClick={() => onRouteSelect(route.routeShortName)}
            className="flex items-center justify-between w-full px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${worse ? 'bg-red-500' : better ? 'bg-emerald-500' : 'bg-[var(--text-dim)]'}`} />
              <p className="text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight truncate">
                <span className="font-black">{route.routeShortName}</span>
                {route.routeName && (
                  <span className="font-normal text-[var(--text-dim)] ml-1.5">{route.routeName}</span>
                )}
              </p>
            </div>
            <ChevronRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0 ml-3" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function History({ active, onInfoOpen, query, searchFocused, setQuery }: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedRouteShortName, setSelectedRouteShortName] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState(active);
  const [visible, setVisible] = useState(false);
  const { setOverlay } = useHistoryMapOverlay();
  const [historyData, setHistoryData] = useState<AgencyHistory[] | null>(null);

  useEffect(() => {
    const fetchUrl = `${R2_PUBLIC_URL}/atlas/history-config.json`;
    console.log("Fetching history config from:", fetchUrl);
    fetch(fetchUrl)
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP error! status: ${r.status}`);
        }
        return r.json();
      })
      .then((data: AgencyHistory[]) => {
        console.log("Successfully loaded history data:", data);
        setHistoryData(data);
      })
      .catch((err) => {
        console.error("Failed to fetch history config from R2:", err);
        setHistoryData([]);
      });
  }, []);

  useEffect(() => {
    if (active) {
      setShouldRender(true);
      const id = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setVisible(false);
      const id = setTimeout(() => setShouldRender(false), 280);
      return () => clearTimeout(id);
    }
  }, [active]);

  const historyAgencies = useMemo(() => {
    return (historyData ?? []).filter(a => a.routes.some(r => r.snapshots.length > 0));
  }, [historyData]);

  useEffect(() => {
    if (!active) { setOverlay(null); return; }
    const agency = historyAgencies.find(a => a.slug === selectedSlug) ?? historyAgencies[0] ?? null;
    if (agency?.center) {
      setOverlay({
        slug: agency.slug,
        routeShortName: selectedRouteShortName ?? '',
        stops: [],
        agencyCenter: agency.center
      });
    } else {
      setOverlay(null);
    }
  }, [active, selectedSlug, selectedRouteShortName, setOverlay, historyAgencies]);

  useEffect(() => { if (!active) setOverlay(null); }, [active, setOverlay]);
  useEffect(() => {
    setSelectedSlug(null);
    setSelectedRouteShortName(null);
  }, [query]);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (searchFocused) {
      try {
        const qRecents = localStorage.getItem('atlas_recent_searches');
        if (qRecents) setRecentSearches(JSON.parse(qRecents));
      } catch (e) {
        console.error(e);
      }
    }
  }, [searchFocused]);

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

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return historyAgencies;
    return historyAgencies.filter(a =>
      a.name.toLowerCase().includes(q) || a.region.toLowerCase().includes(q)
    );
  }, [query, historyAgencies]);


  if (!shouldRender) return null;

  return (
    <div
      className={`absolute top-20 left-[182px] z-[1000] w-64 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      {selectedSlug ? (
        (() => {
          const agencyHistory = historyData?.find(a => a.slug === selectedSlug) ?? null;
          if (!agencyHistory) return null;
          if (selectedRouteShortName) {
            const selectedRoute = agencyHistory.routes.find(r => r.routeShortName === selectedRouteShortName) ?? null;
            if (selectedRoute) {
              return (
                <RouteHistoryCard
                  route={selectedRoute}
                  agencyName={agencyHistory.name}
                  region={agencyHistory.region}
                  onBack={() => setSelectedRouteShortName(null)}
                />
              );
            }
          }
          return (
            <HistoryAgencyPanel
              agencyHistory={agencyHistory}
              onClose={() => setSelectedSlug(null)}
              onRouteSelect={setSelectedRouteShortName}
            />
          );
        })()
      ) : (
        <div
          className={`${FLOATING_CARD} overflow-hidden transition-[opacity,transform] duration-200 ease-out ${searchFocused ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
          onMouseDown={e => e.preventDefault()}
        >
          {query === '' && recentSearches.length > 0 ? (
            <>
              <div className="px-4 pt-3 pb-2 border-b border-[var(--border-primary)] flex items-center justify-between">
                <p className="text-[10px] font-bold text-[var(--text-muted)]">Recent searches</p>
                <button
                  onClick={clearRecentSearches}
                  className="text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className="flex items-center justify-between w-full px-4 py-3 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {s}
                  </span>
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">↵</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="px-4 pt-3 pb-2 border-b border-[var(--border-primary)]">
                <p className="text-[10px] font-bold text-[var(--text-muted)]">Suggestions</p>
              </div>
              {historyData === null && (
                <p className="text-[11px] text-[var(--text-dim)] px-4 py-3">Loading…</p>
              )}
              {historyData !== null && filtered.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)] px-4 py-3">No agencies match.</p>
              )}
              {filtered.map(agency => (
                <button
                  key={agency.slug}
                  onClick={() => {
                    saveRecentSearch(query);
                    setSelectedSlug(agency.slug);
                  }}
                  className="flex items-center justify-between w-full px-4 py-3 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group"
                >
                  <div>
                    <p className="text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{agency.name}</p>
                    <p className="text-[9px] text-[var(--text-dim)] mt-0.5">
                      {agency.region} · {agency.routes.length} route{agency.routes.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
