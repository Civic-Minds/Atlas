import React, { useState } from 'react';
import { LIVE_POLLING_ROUTES, getLiveRouteConfig } from '../../shared/livePollingConfig';
import { useLiveAdherence, agencyTripSummary } from '../hooks/useLiveAdherence';
import { useHistoryAdherence } from '../hooks/useHistoryAdherence';
import type { HourBucket } from '../../shared/computeHistoryAdherence';

interface Props {
  active: boolean;
}

const AGENCY_LABELS: Record<string, string> = {
  hamilton: 'Hamilton',
  burlington: 'Burlington',
};

const DAY_OPTIONS = [7, 14, 30] as const;
type Days = (typeof DAY_OPTIONS)[number];

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
  const chartH = 80;
  const barW = 14;
  const gapW = 4;
  const stepW = barW + gapW;
  const totalW = byHour.length * stepW;
  const zero = chartH / 2;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={totalW + 24} height={chartH + 28} className="overflow-visible">
        <line x1={0} y1={zero} x2={totalW + 24} y2={zero} stroke="var(--border-primary)" strokeWidth={1} />
        {byHour.map((b, i) => {
          const scale = maxAbs > 0 ? (chartH / 2 - 6) / maxAbs : 1;
          const barH = Math.max(Math.abs(b.avgDelayMin) * scale, 1);
          const isLate = b.avgDelayMin >= 0;
          const y = isLate ? zero - barH : zero;
          return (
            <g key={b.hour} transform={`translate(${i * stepW}, 0)`}>
              <rect x={0} y={y} width={barW} height={barH} fill={delayColor(b.avgDelayMin)} rx={2} opacity={0.9} />
              {Math.abs(b.avgDelayMin) >= 1 && (
                <text x={barW / 2} y={isLate ? y - 3 : y + barH + 9} textAnchor="middle" fontSize={7} fill="var(--text-muted)">
                  {b.avgDelayMin > 0 ? '+' : ''}{b.avgDelayMin}
                </text>
              )}
              <text x={barW / 2} y={chartH + 12} textAnchor="middle" fontSize={8} fill="var(--text-dim)">
                {formatHour(b.hour)}
              </text>
            </g>
          );
        })}
        <text x={totalW + 6} y={zero - 20} fontSize={7} fill="var(--text-dim)">late</text>
        <text x={totalW + 6} y={zero + 24} fontSize={7} fill="var(--text-dim)">early</text>
      </svg>
    </div>
  );
}

export default function History({ active }: Props) {
  const [selectedSlug, setSelectedSlug] = useState('hamilton');
  const [selectedRoute, setSelectedRoute] = useState('10');
  const [days, setDays] = useState<Days>(7);

  const cfg = getLiveRouteConfig(selectedSlug, selectedRoute);
  const { data: liveData, status: liveStatus } = useLiveAdherence(selectedSlug, selectedRoute, 60_000);
  const { data: histData, status: histStatus } = useHistoryAdherence(selectedSlug, selectedRoute, days);

  const tripSummary = agencyTripSummary(liveData, selectedSlug);

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-[500] bg-[var(--bg-app)] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-6 pt-16 pb-4 border-b border-[var(--border-primary)]">
        <h2 className="text-sm font-black text-[var(--text-primary)] mb-3">Schedule adherence</h2>

        {/* Route picker — grouped by agency */}
        <div className="flex flex-col gap-2">
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
                        'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
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
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Live section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-[var(--text-primary)]">Right now</p>
            {liveStatus === 'live' && liveData && (
              <span className="flex items-center gap-1.5 text-[10px] text-green-500 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                updated {new Date(liveData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {liveStatus === 'pending' && (
            <p className="text-xs text-[var(--text-dim)]">Loading…</p>
          )}

          {liveStatus === 'noData' && (
            <p className="text-xs text-[var(--text-dim)]">No active trips right now.</p>
          )}

          {liveStatus === 'live' && liveData && cfg && (
            <div className="space-y-3">
              {/* Trip summary */}
              {tripSummary && (
                <div className="flex gap-3">
                  <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">active trips</p>
                    <p className="text-lg font-black text-[var(--text-primary)]">{tripSummary.total}</p>
                  </div>
                  <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">avg delay</p>
                    <p className="text-lg font-black" style={{ color: delayColor(tripSummary.avgDelayMin) }}>
                      {tripSummary.avgDelayMin > 0 ? '+' : ''}{tripSummary.avgDelayMin}m
                    </p>
                  </div>
                  <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">on time</p>
                    <p className="text-lg font-black text-green-500">{tripSummary.onTime}</p>
                  </div>
                </div>
              )}

              {/* Headway at anchor stops */}
              {liveData.arrivals.length > 0 && (
                <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
                  <div className="grid grid-cols-3 px-4 py-2 border-b border-[var(--border-primary)]">
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">stop</span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">actual gap</span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">vs scheduled</span>
                  </div>
                  {liveData.arrivals.map(a => (
                    <div key={a.stopId} className="grid grid-cols-3 px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0">
                      <span className="text-xs text-[var(--text-primary)] truncate pr-2">
                        {cfg.targetStops[a.stopId] ?? a.stopId}
                      </span>
                      <span className="text-xs font-bold text-[var(--text-primary)] text-center">
                        {a.avgGap != null ? `${a.avgGap}m` : '—'}
                      </span>
                      <span
                        className="text-xs font-bold text-center"
                        style={{ color: a.headwayDeltaMin != null ? delayColor(a.headwayDeltaMin) : 'var(--text-dim)' }}
                      >
                        {a.headwayDeltaMin != null
                          ? `${a.headwayDeltaMin > 0 ? '+' : ''}${a.headwayDeltaMin}m`
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Individual trips */}
              {liveData.trips.length > 0 && (
                <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
                  <div className="grid grid-cols-3 px-4 py-2 border-b border-[var(--border-primary)]">
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">trip</span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">status</span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] text-center">drift</span>
                  </div>
                  {liveData.trips.map(t => (
                    <div key={t.tripId} className="grid grid-cols-3 px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0">
                      <span className="text-xs text-[var(--text-muted)] font-mono truncate">{t.tripId}</span>
                      <span
                        className="text-xs font-bold text-center"
                        style={{ color: delayColor(t.avgDelayMin) }}
                      >
                        {delayLabel(t.avgDelayMin)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] text-center">
                        {t.driftMin !== 0 ? `${t.driftMin > 0 ? '+' : ''}${t.driftMin}m` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Historical trend section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-[var(--text-primary)]">Trend</p>
            <div className="flex gap-1.5">
              {DAY_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={[
                    'px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors',
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

          {(histStatus === 'loading') && (
            <p className="text-xs text-[var(--text-dim)]">Loading…</p>
          )}

          {histStatus === 'noData' && (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-5 text-center">
              <p className="text-xs font-bold text-[var(--text-primary)] mb-1">Building up</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                Trip updates are archived every 5 minutes. Historical trends will appear here in a few days.
              </p>
            </div>
          )}

          {histStatus === 'ready' && histData && (histData.byHour?.length ?? 0) > 0 && (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl p-4">
              <p className="text-[10px] font-bold text-[var(--text-muted)] mb-3">avg delay by hour · last {days} days</p>
              <DelayChart byHour={histData.byHour} />
              <div className="flex gap-3 mt-3 flex-wrap">
                {[
                  { color: '#22c55e', label: 'on time (≤1 min)' },
                  { color: '#f59e0b', label: '1–3 min late' },
                  { color: '#ef4444', label: '>3 min late' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
