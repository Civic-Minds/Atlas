import React, { useState, useEffect, useRef } from 'react';
import { LIVE_POLLING_ROUTES, getLiveRouteConfig } from '../../shared/livePollingConfig';
import { useLiveAdherence, agencyTripSummary } from '../hooks/useLiveAdherence';
import { useHistoryAdherence } from '../hooks/useHistoryAdherence';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import type { Agency } from '../App';
import type { HourBucket } from '../../shared/computeHistoryAdherence';

interface Props {
  active: boolean;
  agencies: Agency[];
  onInfoOpen?: () => void;
}

const AGENCY_LABELS: Record<string, string> = {
  hamilton: 'Hamilton',
  burlington: 'Burlington',
};

const DAY_OPTIONS = [7, 14, 30] as const;
type Days = (typeof DAY_OPTIONS)[number];

type StopsIndex = Record<string, { name: string; lat: number; lon: number }>;

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

function delayColor(delayMin: number): string {
  if (delayMin < -0.5) return 'var(--accent)';
  if (delayMin <= 1) return '#22c55e';
  if (delayMin <= 3) return '#f59e0b';
  return '#ef4444';
}

function delayLabel(delayMin: number): string {
  if (Math.abs(delayMin) < 0.5) return 'on time';
  if (delayMin < 0) return `${Math.abs(delayMin)}m early`;
  return `${delayMin}m late`;
}

function DelayChart({ byHour }: { byHour: HourBucket[] }) {
  const maxAbs = Math.max(...byHour.map(b => Math.abs(b.avgDelayMin)), 1);
  const chartH = 64;
  const barW = 12;
  const gapW = 3;
  const stepW = barW + gapW;
  const totalW = byHour.length * stepW;
  const zero = chartH / 2;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={totalW + 24} height={chartH + 24} className="overflow-visible">
        <line x1={0} y1={zero} x2={totalW + 24} y2={zero} stroke="var(--border-primary)" strokeWidth={1} />
        {byHour.map((b, i) => {
          const scale = maxAbs > 0 ? (chartH / 2 - 4) / maxAbs : 1;
          const barH = Math.max(Math.abs(b.avgDelayMin) * scale, 1);
          const isLate = b.avgDelayMin >= 0;
          const y = isLate ? zero - barH : zero;
          return (
            <g key={b.hour} transform={`translate(${i * stepW}, 0)`}>
              <rect x={0} y={y} width={barW} height={barH} fill={delayColor(b.avgDelayMin)} rx={2} opacity={0.9} />
              <text x={barW / 2} y={chartH + 12} textAnchor="middle" fontSize={7} fill="var(--text-dim)">
                {formatHour(b.hour)}
              </text>
            </g>
          );
        })}
        <text x={totalW + 6} y={zero - 14} fontSize={7} fill="var(--text-dim)">late</text>
        <text x={totalW + 6} y={zero + 18} fontSize={7} fill="var(--text-dim)">early</text>
      </svg>
    </div>
  );
}

export default function History({ active, agencies, onInfoOpen }: Props) {
  const [selectedSlug, setSelectedSlug] = useState('hamilton');
  const [selectedRoute, setSelectedRoute] = useState('10');
  const [days, setDays] = useState<Days>(7);
  const [stopsIndex, setStopsIndex] = useState<StopsIndex>({});
  const loadedSlug = useRef<string | null>(null);
  const [shouldRender, setShouldRender] = useState(active);
  const [visible, setVisible] = useState(false);

  const { setOverlay } = useHistoryMapOverlay();
  const cfg = getLiveRouteConfig(selectedSlug, selectedRoute);
  const { data: liveData, status: liveStatus } = useLiveAdherence(selectedSlug, selectedRoute, 60_000);
  const { data: histData, status: histStatus } = useHistoryAdherence(selectedSlug, selectedRoute, days);
  const tripSummary = agencyTripSummary(liveData, selectedSlug);

  // Mount/unmount with slide animation
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

  // Fetch stops index for selected agency to get lat/lon for anchor stops
  useEffect(() => {
    if (!active || loadedSlug.current === selectedSlug) return;
    const agency = agencies.find(a => a.slug === selectedSlug);
    if (!agency?.stopsUrl) return;
    loadedSlug.current = selectedSlug;
    fetch(agency.stopsUrl)
      .then(r => r.json())
      .then((idx: StopsIndex) => setStopsIndex(prev => ({ ...prev, ...idx })))
      .catch(() => {});
  }, [active, selectedSlug, agencies]);

  // Write resolved stop positions + live data to the map context
  useEffect(() => {
    if (!active || !cfg) {
      setOverlay(null);
      return;
    }
    const stops = Object.entries(cfg.targetStops).map(([stopId, name]) => {
      const coord = stopsIndex[stopId];
      const arrival = liveData?.arrivals.find(a => a.stopId === stopId);
      return {
        stopId,
        name,
        lat: coord?.lat ?? 0,
        lon: coord?.lon ?? 0,
        avgGap: arrival?.avgGap ?? null,
        headwayDeltaMin: arrival?.headwayDeltaMin ?? null,
        scheduledHeadwayMin: cfg.scheduledHeadwayMin,
      };
    }).filter(s => s.lat !== 0);

    setOverlay({ slug: selectedSlug, routeShortName: selectedRoute, stops });
  }, [active, cfg, selectedSlug, selectedRoute, stopsIndex, liveData, setOverlay]);

  // Clear overlay when History is inactive
  useEffect(() => {
    if (!active) setOverlay(null);
  }, [active, setOverlay]);

  if (!shouldRender) return null;

  return (
    <div
      className={`absolute bottom-0 inset-x-0 z-[1000] bg-[var(--bg-panel)]/95 backdrop-blur-md border-t border-[var(--border-primary)] flex flex-col transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ maxHeight: '52vh' }}
    >

      {/* Route picker + live summary row */}
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-[var(--border-primary)]">

        {/* Row: label + info button */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide">Schedule adherence</p>
          {onInfoOpen && (
            <button
              onClick={onInfoOpen}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
              aria-label="About Atlas"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </button>
          )}
        </div>

        {/* Route picker — grouped by agency */}
        <div className="flex flex-col gap-1.5 mb-3">
          {Object.entries(
            LIVE_POLLING_ROUTES.reduce<Record<string, typeof LIVE_POLLING_ROUTES>>((acc, r) => {
              (acc[r.slug] ??= []).push(r);
              return acc;
            }, {})
          ).map(([slug, routes]) => (
            <div key={slug} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[var(--text-dim)] w-20 shrink-0">
                {AGENCY_LABELS[slug] ?? slug}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {routes.map(r => {
                  const isActive = r.slug === selectedSlug && r.displayRouteShortName === selectedRoute;
                  return (
                    <button
                      key={`${r.slug}-${r.displayRouteShortName}`}
                      onClick={() => { setSelectedSlug(r.slug); setSelectedRoute(r.displayRouteShortName); }}
                      className={[
                        'px-3 py-1 rounded-full text-xs font-bold border transition-colors',
                        isActive
                          ? 'bg-[var(--accent)] text-[var(--bg-app)] border-transparent'
                          : 'bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)]',
                      ].join(' ')}
                    >
                      {r.displayRouteShortName}
                      <span className="ml-1.5 opacity-50 font-normal">every {r.scheduledHeadwayMin}m</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Live summary chips */}
        {liveStatus === 'live' && liveData && tripSummary && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] text-green-500 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              live
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              <span className="font-bold text-[var(--text-primary)]">{tripSummary.total}</span> trips
            </span>
            <span className="text-[10px]" style={{ color: delayColor(tripSummary.avgDelayMin), fontWeight: 700 }}>
              avg {tripSummary.avgDelayMin > 0 ? '+' : ''}{tripSummary.avgDelayMin}m
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              <span className="font-bold text-green-500">{tripSummary.onTime}</span> on time
            </span>
          </div>
        )}
        {liveStatus === 'pending' && <p className="text-[10px] text-[var(--text-dim)]">Fetching live data…</p>}
        {liveStatus === 'noData' && <p className="text-[10px] text-[var(--text-dim)]">No active trips right now.</p>}
      </div>

      {/* Scrollable content: trip list + trend chart */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* Individual trips */}
        {liveStatus === 'live' && liveData && liveData.trips.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Active trips</p>
            <div className="bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 px-4 py-2 border-b border-[var(--border-primary)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)]">trip</span>
                <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">status</span>
                <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">drift</span>
              </div>
              {liveData.trips.map(t => (
                <div key={t.tripId} className="grid grid-cols-3 px-4 py-2 border-b border-[var(--border-primary)] last:border-0">
                  <span className="text-xs text-[var(--text-muted)] font-mono truncate">{t.tripId}</span>
                  <span className="text-xs font-bold text-center" style={{ color: delayColor(t.avgDelayMin) }}>
                    {delayLabel(t.avgDelayMin)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] text-center">
                    {t.driftMin !== 0 ? `${t.driftMin > 0 ? '+' : ''}${t.driftMin}m` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend chart */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-[var(--text-muted)]">Trend</p>
            <div className="flex gap-1">
              {DAY_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={[
                    'px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors',
                    days === d
                      ? 'bg-[var(--accent)] text-[var(--bg-app)] border-transparent'
                      : 'bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)]',
                  ].join(' ')}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {histStatus === 'loading' && <p className="text-[10px] text-[var(--text-dim)]">Loading…</p>}

          {histStatus === 'noData' && (
            <p className="text-[10px] text-[var(--text-dim)]">Building up — check back in a few days.</p>
          )}

          {histStatus === 'ready' && histData && (histData.byHour?.length ?? 0) > 0 && (
            <div className="bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl p-3">
              <p className="text-[9px] font-bold text-[var(--text-muted)] mb-2">avg delay by hour · last {days} days</p>
              <DelayChart byHour={histData.byHour} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
