import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Info, Moon, Sun, WifiOff } from 'lucide-react';
import { useLiveVehiclesMapOverlay } from '../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
import type { Agency } from '../App';
import { FLOATING_CARD, PANEL_ENTER, ICON_BTN, TRANSITION_SLOW, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM } from '../styles';
import { STATUS_COLORS } from '../utils/colors';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  active: boolean;
  onInfoOpen?: () => void;
  query: string;
}

interface RouteGroup {
  routeShortName: string;
  displayName: string;
  headsigns: string[];
  vehicles: LiveVehicle[];
  lateCount: number;
  earlyCount: number;
  dominantStatus: LiveVehicle['status'];
}

const POLL_INTERVAL_MS = 15_000;

export default function LiveVehicles({ agencies, lightMode, setLightMode, active, onInfoOpen, query }: Props) {
  const { setOverlay } = useLiveVehiclesMapOverlay();
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [focusedVehicle, setFocusedVehicle] = useState<{ id: string; lat: number; lon: number; ts: number } | null>(null);

  const eligibleSlugs = useMemo(() => {
    const slugs = new Set(
      LIVE_POLLING_ROUTES
        .filter(r => (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar) || r.active)
        .map(r => r.slug)
    );
    return Array.from(slugs);
  }, []);

  const eligibleAgencies = useMemo(() => agencies.filter(a => eligibleSlugs.includes(a.slug)), [agencies, eligibleSlugs]);

  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('atlas_pref_live_agency');
      if (saved && eligibleSlugs.includes(saved)) return saved;
    } catch {}
    return eligibleSlugs[0] || '';
  });

  useEffect(() => {
    if (selectedSlug) localStorage.setItem('atlas_pref_live_agency', selectedSlug);
  }, [selectedSlug]);

  const selectedAgency = useMemo(
    () => eligibleAgencies.find(a => a.slug === selectedSlug) || null,
    [eligibleAgencies, selectedSlug]
  );

  const fetchVehicles = useCallback(async (slug: string) => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/live-vehicles?agency=${slug}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setVehicles(data.vehicles || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch live vehicles:', err);
      setError(err.message || 'Failed to load vehicle positions');
    }
  }, []);

  useEffect(() => {
    if (!active || !selectedSlug) return;
    setLoading(true);
    fetchVehicles(selectedSlug).finally(() => setLoading(false));
    const pollId = setInterval(() => fetchVehicles(selectedSlug), POLL_INTERVAL_MS);
    return () => clearInterval(pollId);
  }, [active, selectedSlug, fetchVehicles]);

  // Reset on agency switch
  useEffect(() => {
    setSelectedRoute(null);
    setFocusedVehicle(null);
    setVehicles([]);
  }, [selectedSlug]);

  // Filter map overlay to selected route when one is active
  const overlayVehicles = useMemo(() => {
    if (!selectedRoute) return vehicles;
    return vehicles.filter(v => v.routeShortName === selectedRoute);
  }, [vehicles, selectedRoute]);

  useEffect(() => {
    if (!active || !selectedSlug) {
      setOverlay(null);
      return;
    }
    setOverlay({ vehicles: overlayVehicles, agencySlug: selectedSlug, agencyCenter: selectedAgency?.center, focusedVehicle });
    return () => setOverlay(null);
  }, [active, overlayVehicles, selectedSlug, selectedAgency, focusedVehicle, setOverlay]);

  // Filter by search query, then group by route
  const routeGroups = useMemo<RouteGroup[]>(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? vehicles.filter(v =>
          v.routeShortName.toLowerCase().includes(q) ||
          (v.displayName && v.displayName.toLowerCase().includes(q)) ||
          (v.headsign && v.headsign.toLowerCase().includes(q))
        )
      : vehicles;

    const groups = new Map<string, LiveVehicle[]>();
    for (const v of filtered) {
      if (!groups.has(v.routeShortName)) groups.set(v.routeShortName, []);
      groups.get(v.routeShortName)!.push(v);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => {
        const numA = parseInt(a), numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      })
      .map(([routeShortName, vs]) => {
        const lateCount = vs.filter(v => v.status === 'late').length;
        const earlyCount = vs.filter(v => v.status === 'early').length;
        const dominantStatus: LiveVehicle['status'] =
          lateCount > 0 ? 'late' : earlyCount > 0 ? 'early' : vs[0].status;
        const headsigns = [...new Set(vs.map(v => v.headsign).filter(Boolean) as string[])];
        const displayName = vs[0].displayName || `Route ${routeShortName}`;
        return { routeShortName, displayName, headsigns, vehicles: vs, lateCount, earlyCount, dominantStatus };
      });
  }, [vehicles, query]);

  const handleRouteClick = (routeShortName: string) => {
    const next = selectedRoute === routeShortName ? null : routeShortName;
    setSelectedRoute(next);
    if (next) {
      const group = routeGroups.find(g => g.routeShortName === next);
      if (group?.vehicles[0]) {
        const v = group.vehicles[0];
        setFocusedVehicle({ id: v.id, lat: v.lat, lon: v.lon, ts: Date.now() });
      }
    } else {
      setFocusedVehicle(null);
    }
  };

  if (!active) return null;

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none">
      <div className={`absolute top-20 left-[182px] z-[1000] w-64 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} pointer-events-auto`}>
        <div className={`${FLOATING_CARD} flex flex-col overflow-hidden ${PANEL_ENTER}`}>

          {/* Header */}
          <div className="px-4 pt-3.5 pb-2.5 border-b border-[var(--border-primary)] flex items-center gap-2 shrink-0">
            {vehicles.length > 0 ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            ) : loading ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            ) : error ? (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 shrink-0" />
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--text-dim)] shrink-0" />
            )}
            <h2 className="text-xs font-black text-[var(--text-primary)]">Live Vehicles</h2>
          </div>

          {/* Network selector */}
          <div className="px-4 py-2.5 border-b border-[var(--border-primary)] shrink-0">
            <select
              value={selectedSlug}
              onChange={e => setSelectedSlug(e.target.value)}
              className="w-full text-xs font-bold [font-family:inherit] bg-[var(--bg-btn)] border border-[var(--border-primary)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {eligibleAgencies.map(a => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Route list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            {loading && vehicles.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[var(--text-muted)]">Loading feed…</span>
              </div>
            ) : error && vehicles.length === 0 ? (
              <div className="py-6 text-center px-4 flex flex-col items-center gap-3">
                <WifiOff className="w-5 h-5 text-[var(--text-dim)]" />
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {error.includes('No live config') ? 'No live feed for this network' : 'Feed unavailable'}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
                    {error.includes('No live config')
                      ? "This network doesn't have a real-time feed configured."
                      : 'Unable to reach the live feed. It will retry automatically.'}
                  </p>
                </div>
              </div>
            ) : routeGroups.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center gap-2">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {query ? 'No routes match' : 'No vehicles right now'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                  {query ? 'Try a different search.' : 'Active vehicles will appear here as they check in.'}
                </p>
              </div>
            ) : (
              routeGroups.map(g => {
                const colors = STATUS_COLORS[g.dominantStatus];
                const isSelected = selectedRoute === g.routeShortName;
                const statusLabel = g.lateCount > 0
                  ? `${g.lateCount} late`
                  : g.earlyCount > 0
                    ? `${g.earlyCount} early`
                    : null;

                return (
                  <button
                    key={g.routeShortName}
                    onClick={() => handleRouteClick(g.routeShortName)}
                    className={`${LIST_ROW} ${isSelected ? 'bg-[var(--accent-bg)]' : ''}`}
                  >
                    <span
                      style={{ background: colors.bg }}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0"
                    >
                      {g.routeShortName}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className={LIST_ROW_PRIMARY}>{g.displayName}</p>
                      {g.headsigns.length > 0 && (
                        <p className={`${LIST_ROW_DIM} mt-0.5 truncate`}>{g.headsigns[0]}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={LIST_ROW_DIM}>{g.vehicles.length} veh</span>
                      {statusLabel && (
                        <span style={{ color: colors.text }} className="text-[9px] font-black">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected route footer */}
          {selectedRoute && (
            <div className="px-4 py-2 border-t border-[var(--border-primary)] shrink-0 flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] font-bold">Route {selectedRoute} on map</span>
              <button
                onClick={() => { setSelectedRoute(null); setFocusedVehicle(null); }}
                className="text-[10px] text-[var(--accent)] font-black hover:opacity-70 transition-opacity"
              >
                Show all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="absolute top-6 right-6 z-[1100] flex items-center gap-1.5 pointer-events-auto">
        <button onClick={() => setLightMode(!lightMode)} className={ICON_BTN} aria-label="Toggle light mode">
          {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        {onInfoOpen && (
          <button onClick={onInfoOpen} className={ICON_BTN} aria-label="About Atlas">
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
