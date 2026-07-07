import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Search, TrendingUp } from 'lucide-react';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import { R2_PUBLIC_URL, type HeadwayByPeriod } from '../../shared/config';
import { FLOATING_CARD, PANEL_ENTER, TRANSITION_SLOW, SEARCH_PILL, SEARCH_FIELD, Z_PANEL, SIDEBAR_LEFT_FALLBACK, SEARCH_BAR_WIDTH } from '../styles';
import RouteListRow from '../components/RouteListRow';
import { shortenAgencyName } from '../utils/format';
import { agencyQualifiesForHistoryExplore } from '../../shared/historyEligibility';

export interface RouteSnapshot {
  label: string;
  year: number;
  weekdayHeadwayMin: number;
  headwayByPeriod?: HeadwayByPeriod;
  geometry?: number[][];
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
  pendingRouteClick?: { slug: string; routeShortName: string } | null;
  onPendingRouteHandled?: () => void;
  sidebarLeft?: number;
}

function changeSummary(entry: RouteHistoryEntry): { text: string; subtext: string; worse: boolean } | null {
  const snaps = entry.snapshots;
  if (snaps.length < 2) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const fHw = first.weekdayHeadwayMin;
  const lHw = last.weekdayHeadwayMin;
  if (Math.abs(fHw - lHw) < 2) return null;
  const worse = lHw > fHw;
  return {
    text: `Every ${fHw} min → every ${lHw} min`,
    subtext: `${first.label} to ${last.label}`,
    worse,
  };
}

function formatXLabel(label: string): string {
  const match = label.match(/^(?:([A-Za-z]+)\s+)?(\d{4})$/);
  if (match) {
    const month = match[1];
    const year = match[2].slice(2);
    return month ? `${month.slice(0, 3)} '${year}` : `'${year}`;
  }
  return label;
}

function toTitleCase(s: string): string {
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
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
  const [showChart, setShowChart] = useState(false);
  const snaps = route.snapshots;

  function snapHeadway(snap: RouteSnapshot): number {
    return snap.weekdayHeadwayMin;
  }

  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const firstHw = snapHeadway(first);
  const lastHw = snapHeadway(last);
  const worse = lastHw > firstHw;
  const better = lastHw < firstHw;
  const summary = changeSummary(route);;

  // Sparkline calculations
  const width = 220;
  const height = 75;
  const paddingX = 20;
  const paddingY = 22;

  const minYear = first.year;
  const maxYear = last.year;
  const yearRange = maxYear - minYear || 1;

  const hws = snaps.map(snapHeadway);
  const minHw = Math.min(...hws);
  const maxHw = Math.max(...hws);
  const hwRange = maxHw - minHw || 1;

  const points = snaps.map((snap, i) => {
    const hw = hws[i];
    const pctX = (snap.year - minYear) / yearRange;
    const x = paddingX + pctX * (width - 2 * paddingX);

    const pctY = maxHw === minHw ? 0.5 : (hw - minHw) / hwRange;
    const y = height - paddingY - pctY * (height - 2 * paddingY);

    return { x, y, hw, label: snap.label };
  });

  const linePath = 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
  const fillPath = `${linePath} L ${points[points.length - 1].x} ${height - 18} L ${points[0].x} ${height - 18} Z`;

  const lineColor = worse ? '#ef4444' : better ? '#10b981' : '#9ca3af';
  // x-axis label visibility: always show first and last; intermediate only if they have clearance
  const labelClearance = 34;
  const firstLabelEdge = paddingX + labelClearance;
  const lastLabelEdge = width - paddingX - labelClearance;

  return (
    <div className={`${FLOATING_CARD} flex flex-col overflow-hidden ${PANEL_ENTER}`}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          className="flex items-center gap-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mb-1.5"
          aria-label="Back to routes"
        >
          <ChevronLeft className="w-3 h-3 shrink-0" />
          <span className="text-[10px] font-medium">{agencyName}</span>
        </button>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-baseline gap-1.5">
            <span className="text-sm font-black text-[var(--text-primary)]">{route.routeShortName}</span>
            {route.routeName && (
              <span className="text-xs font-semibold text-[var(--text-dim)] truncate">{toTitleCase(route.routeName)}</span>
            )}
          </div>
          {snaps.length >= 2 && (
            <button
              onClick={() => setShowChart(v => !v)}
              className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors shrink-0 ${showChart ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'}`}
              aria-label="Toggle chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {snaps.length >= 2 && showChart && (
        <div className="px-4 pb-4 shrink-0">
          <div className="w-full bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl p-3">
            <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
              <defs>
                <linearGradient id={`sparkline-grad-${route.routeShortName}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d={fillPath} fill={`url(#sparkline-grad-${route.routeShortName})`} />

              <path
                d={linePath}
                fill="none"
                stroke={lineColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <line
                x1={points[0].x} y1={height - 18}
                x2={points[points.length - 1].x} y2={height - 18}
                stroke="var(--border-primary)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />

              {points.map((p, i) => {
                const isFirst = i === 0;
                const isLast = i === points.length - 1;
                const showXLabel = isFirst || isLast || (p.x > firstLabelEdge && p.x < lastLabelEdge);
                const xAnchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
                const xPos = isFirst ? paddingX : isLast ? (width - paddingX) : p.x;
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="3" fill={lineColor} stroke="var(--bg-panel)" strokeWidth="1.5" />
                    <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--text-primary)" fontFamily="inherit">
                      {p.hw}m
                    </text>
                    {showXLabel && (
                      <text x={xPos} y={height - 3} textAnchor={xAnchor} fontSize="7.5" fontWeight="600" fill="var(--text-muted)" fontFamily="inherit">
                        {formatXLabel(p.label)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="bg-[var(--bg-app)] border-t border-b border-[var(--border-primary)]">
          {snaps.map((snap, i) => {
            const hw = snapHeadway(snap);
            const isLast = i === snaps.length - 1;
            const hwColor = isLast
              ? worse ? 'text-red-500' : better ? 'text-green-500' : 'text-[var(--text-primary)]'
              : 'text-[var(--text-dim)]';
            const delta = i > 0 ? hw - snapHeadway(snaps[i - 1]) : null;
            return (
              <div key={snap.label} className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0">
                <span className={`text-[10px] font-bold ${isLast ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {snap.label}
                </span>
                <div className="flex items-center gap-2">
                  {delta !== null && delta !== 0 && (
                    <span className={`text-[9px] font-bold ${delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {delta > 0 ? `+${delta}` : `${delta}`}
                    </span>
                  )}
                  <span className={`text-xs font-black tabular-nums ${hwColor}`}>{hw} min</span>
                </div>
              </div>
            );
          })}
        </div>

        {summary && (
          <div className={`mx-4 mt-3 mb-4 rounded-xl px-3 py-2.5 ${summary.worse ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
            <p className={`text-xs font-bold leading-tight ${summary.worse ? 'text-red-500' : 'text-green-500'}`}>{summary.text}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{summary.subtext}</p>
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
            <h2 className="text-sm font-black text-[var(--text-primary)] leading-tight">{shortenAgencyName(agencyHistory.name)}</h2>
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

      <div className="shrink-0 px-3 py-2 border-b border-[var(--border-primary)]">
        <div className={SEARCH_PILL}>
          <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
          <input
            type="text"
            value={routeQuery}
            onChange={e => setRouteQuery(e.target.value)}
            placeholder="Filter routes…"
            className={SEARCH_FIELD}
          />
          {routeQuery && (
            <button onClick={() => setRouteQuery('')} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
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
        {routeRows.map(({ route }) => (
          <RouteListRow
            key={route.routeShortName}
            shortName={route.routeShortName}
            name={route.routeName}
            onClick={() => onRouteSelect(route.routeShortName)}
            right={<ChevronRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0 ml-3" />}
          />
        ))}
      </div>
    </div>
  );
}

export default function History({ active, onInfoOpen, query, searchFocused, setQuery, pendingRouteClick, onPendingRouteHandled, sidebarLeft }: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedRouteShortName, setSelectedRouteShortName] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(0);
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
    return (historyData ?? []).filter(
      a => a.routes.some(r => r.snapshots.length > 0) && agencyQualifiesForHistoryExplore(a),
    );
  }, [historyData]);

  useEffect(() => {
    if (!active) { setOverlay(null); return; }
    const agency = selectedSlug ? (historyAgencies.find(a => a.slug === selectedSlug) ?? null) : null;
    if (agency?.center) {
      let routeGeometry: number[][] | undefined;
      let historicalRouteGeometries: Array<{routeShortName: string, coordinates: number[][], headway: number}> | undefined;
      if (selectedYear > 0) {
        historicalRouteGeometries = [];
        agency.routes.forEach(route => {
          const snap = route.snapshots.find(s => s.year === selectedYear) || route.snapshots[route.snapshots.length - 1];
          if (snap && snap.geometry) {
            historicalRouteGeometries!.push({
              routeShortName: route.routeShortName,
              coordinates: snap.geometry,
              headway: snap.weekdayHeadwayMin
            });
          }
        });
      } else if (selectedRouteShortName) {
        const rt = agency.routes.find(r => r.routeShortName === selectedRouteShortName);
        if (rt && rt.snapshots.length > 0) {
          routeGeometry = rt.snapshots[rt.snapshots.length - 1]?.geometry;
        }
      }
      setOverlay({
        slug: agency.slug,
        routeShortName: selectedRouteShortName ?? '',
        stops: [],
        agencyCenter: agency.center,
        routeGeometry,
        selectedYear: selectedYear > 0 ? selectedYear : undefined,
        historicalRouteGeometries
      });
    } else {
      setOverlay(null);
    }
  }, [active, selectedSlug, selectedRouteShortName, setOverlay, historyAgencies, selectedYear]);

  useEffect(() => { if (!active) setOverlay(null); }, [active, setOverlay]);

  useEffect(() => {
    if (!pendingRouteClick || !historyData) return;
    const { slug, routeShortName } = pendingRouteClick;
    const agency = historyData.find(a => a.slug === slug);
    if (agency) {
      setSelectedSlug(slug);
      setSelectedRouteShortName(routeShortName);
    }
    onPendingRouteHandled?.();
  }, [pendingRouteClick, historyData, onPendingRouteHandled]);
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

  const availableYears = useMemo(() => {
    if (!selectedSlug) return [];
    const agency = historyAgencies.find(a => a.slug === selectedSlug);
    if (!agency) return [];
    const years = new Set<number>();
    agency.routes.forEach(r => r.snapshots.forEach(s => years.add(s.year)));
    return Array.from(years).sort((a,b) => a-b);
  }, [historyAgencies, selectedSlug]);

  useEffect(() => {
    if (selectedSlug && availableYears.length > 0) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    } else {
      setSelectedYear(0);
    }
  }, [selectedSlug, availableYears]);


  if (!shouldRender) return null;

  const showScrubber = selectedSlug && availableYears.length > 1;

  return (
    <>
      <div
        className={`absolute top-20 ${Z_PANEL} ${SEARCH_BAR_WIDTH} max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${!selectedSlug && !searchFocused ? 'pointer-events-none' : ''}`}
        style={{ left: sidebarLeft ?? SIDEBAR_LEFT_FALLBACK }}
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
                    <p className="text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{shortenAgencyName(agency.name)}</p>
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

      {showScrubber && (
        <div className={`absolute bottom-6 right-14 ${Z_PANEL} h-9 w-[280px] flex items-center gap-2 px-2 rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-lg backdrop-blur-md text-[10px]`}>
          <div
            className="flex-1 relative h-1.5 bg-[var(--border-primary)] rounded-full cursor-pointer"
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const update = (clientX: number) => {
                const x = clientX - rect.left;
                const pct = Math.max(0, Math.min(1, x / rect.width));
                const idx = Math.round(pct * (availableYears.length - 1));
                setSelectedYear(availableYears[Math.max(0, Math.min(availableYears.length - 1, idx))]);
              };
              update(e.clientX);
              const onMove = (me: MouseEvent) => update(me.clientX);
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <div
              className="absolute top-0 left-0 h-1.5 bg-[var(--accent)] rounded-full pointer-events-none"
              style={{ width: `${availableYears.length > 1 ? ((availableYears.indexOf(selectedYear) / (availableYears.length - 1)) * 100) : 0}%` }}
            />
            <div
              className="absolute top-1/2 -mt-[5px] w-3 h-3 bg-[var(--bg-panel)] border-2 border-[var(--accent)] rounded-full shadow pointer-events-none"
              style={{ left: `${availableYears.length > 1 ? ((availableYears.indexOf(selectedYear) / (availableYears.length - 1)) * 100) : 0}%` }}
            />
          </div>
          <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums w-[2.5ch] text-right shrink-0">{selectedYear}</span>
        </div>
      )}
    </>
  );
}
