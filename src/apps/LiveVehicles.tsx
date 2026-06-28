import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info, Moon, Sun, ArrowRight } from 'lucide-react';
import { useLiveVehiclesMapOverlay } from '../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
import type { Agency } from '../App';
import { FLOATING_CARD, PANEL_ENTER, ICON_BTN, TRANSITION_SLOW } from '../styles';
import { STATUS_COLORS } from '../utils/colors';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  active: boolean;
  onInfoOpen?: () => void;
  query: string;
}

const POLL_INTERVAL_MS = 15_000;

export default function LiveVehicles({ agencies, lightMode, setLightMode, active, onInfoOpen, query }: Props) {
  const { setOverlay } = useLiveVehiclesMapOverlay();
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [focusedVehicle, setFocusedVehicle] = useState<{ id: string; lat: number; lon: number; ts: number } | null>(null);

  // Only show agencies whose feeds don't require an unconfigured API key
  const eligibleSlugs = useMemo(() => {
    const slugs = new Set(
      LIVE_POLLING_ROUTES
        .filter(r => (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar) || r.active)
        .map(r => r.slug)
    );
    return Array.from(slugs);
  }, []);

  const eligibleAgencies = useMemo(() => {
    return agencies.filter(a => eligibleSlugs.includes(a.slug));
  }, [agencies, eligibleSlugs]);

  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('atlas_pref_live_agency');
      if (saved && eligibleSlugs.includes(saved)) return saved;
    } catch {}
    return eligibleSlugs[0] || '';
  });

  useEffect(() => {
    if (selectedSlug) {
      localStorage.setItem('atlas_pref_live_agency', selectedSlug);
    }
  }, [selectedSlug]);

  const selectedAgency = useMemo(() => {
    return eligibleAgencies.find(a => a.slug === selectedSlug) || null;
  }, [eligibleAgencies, selectedSlug]);

  // Fetch function
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
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (err: any) {
      console.error('Failed to fetch live vehicles:', err);
      setError(err.message || 'Failed to load vehicle positions');
    }
  }, []);

  // Poll on interval
  useEffect(() => {
    if (!active || !selectedSlug) return;

    setLoading(true);
    fetchVehicles(selectedSlug).finally(() => setLoading(false));

    const pollId = setInterval(() => {
      fetchVehicles(selectedSlug);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollId);
  }, [active, selectedSlug, fetchVehicles]);

  // Seconds ago timer
  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Update map overlay context
  useEffect(() => {
    if (!active || !selectedSlug) {
      setOverlay(null);
      return;
    }

    setOverlay({
      vehicles,
      agencySlug: selectedSlug,
      agencyCenter: selectedAgency?.center,
      focusedVehicle,
    });

    return () => setOverlay(null);
  }, [active, vehicles, selectedSlug, selectedAgency, focusedVehicle, setOverlay]);

  // Reset focus when switching agencies
  useEffect(() => {
    setFocusedVehicle(null);
    setVehicles([]);
    setLastUpdated(null);
    setSecondsAgo(0);
  }, [selectedSlug]);

  // Filter vehicles by search query
  const filteredVehicles = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return vehicles;
    return vehicles.filter(v =>
      v.routeShortName.toLowerCase().includes(q) ||
      (v.displayName && v.displayName.toLowerCase().includes(q)) ||
      (v.headsign && v.headsign.toLowerCase().includes(q)) ||
      v.id.toLowerCase().includes(q)
    );
  }, [vehicles, query]);

  const handleVehicleClick = (v: LiveVehicle) => {
    setFocusedVehicle({
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      ts: Date.now(),
    });
  };

  if (!active) return null;

  return (
    <div className="relative h-full w-full overflow-hidden pointer-events-none">
      {/* Sidebar Panel */}
      <div
        className={`absolute top-20 left-[182px] z-[1000] w-64 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-opacity ${TRANSITION_SLOW} pointer-events-auto`}
      >
        <div className={`${FLOATING_CARD} flex flex-col overflow-hidden ${PANEL_ENTER}`}>
          {/* Header */}
          <div className="px-4 pt-3.5 pb-2 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <h2 className="text-xs font-black text-[var(--text-primary)]">Live Vehicles</h2>
            </div>
            {lastUpdated && (
              <span className="text-[9px] font-bold text-[var(--text-muted)]">
                {secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`}
              </span>
            )}
          </div>

          {/* Agency Dropdown */}
          <div className="flex flex-col gap-1 px-4 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-active)]/10 shrink-0">
            <label className="text-[8px] font-black text-[var(--text-dim)] tracking-wider">Select network</label>
            <select
              value={selectedSlug}
              onChange={e => setSelectedSlug(e.target.value)}
              className="w-full text-[11px] font-bold bg-[var(--bg-btn)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {eligibleAgencies.map(a => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Content List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 min-h-0">
            {loading && vehicles.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[var(--text-muted)]">Loading feed…</span>
              </div>
            ) : error && vehicles.length === 0 ? (
              <div className="py-8 text-center px-4">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {error.includes('404') ? 'Live tracking not available for this network' : 'Live data unavailable right now'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  {error.includes('404') ? 'This agency may not have a real-time feed configured.' : 'Something went wrong fetching the live feed. Try again in a moment.'}
                </p>
                <button
                  onClick={() => { setLoading(true); fetchVehicles(selectedSlug).finally(() => setLoading(false)); }}
                  className="mt-3 text-[10px] font-bold text-[var(--accent)] hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                {query ? 'No vehicles match your search' : 'No active vehicles tracked on live routes right now.'}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredVehicles.map(v => {
                  const colors = STATUS_COLORS[v.status];
                  const isFocused = focusedVehicle?.id === v.id;
                  
                  return (
                    <button
                      key={v.id}
                      onClick={() => handleVehicleClick(v)}
                      className={`w-full flex items-center gap-3 py-2 px-2.5 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group ${
                        isFocused ? 'bg-[var(--bg-active)]' : ''
                      }`}
                    >
                      {/* Vehicle Route Code Badge */}
                      <span
                        style={{ backgroundColor: colors.bg }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-sm"
                      >
                        {v.routeShortName}
                      </span>
                      
                      {/* Vehicle destination & trip info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-[var(--text-primary)] truncate">
                          to {v.headsign || 'Unknown destination'}
                        </p>
                        <p className="text-[8px] text-[var(--text-dim)] font-medium mt-0.5 truncate">
                          {v.displayName || 'Route'} · ID {v.id}
                        </p>
                      </div>

                      {/* Delay/Adherence label */}
                      <div className="text-right shrink-0 flex items-center gap-1">
                        <span
                          style={{ color: colors.text }}
                          className="text-[10px] font-black tabular-nums"
                        >
                          {v.delayMin === null
                            ? '—'
                            : v.delayMin <= -1.5
                              ? `${Math.abs(v.delayMin)}m early`
                              : v.delayMin >= 5.5
                                ? `${v.delayMin}m late`
                                : 'on time'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors opacity-40 group-hover:opacity-100" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Global Toolbar Controls — top-right */}
      <div className="absolute top-6 right-6 z-[1100] flex items-center gap-1.5 pointer-events-auto">
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
