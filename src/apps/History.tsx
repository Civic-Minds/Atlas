import React, { useState } from 'react';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
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
  if (delayMin < -0.5) return 'var(--accent)'; // early — neutral
  if (delayMin <= 1) return '#22c55e';           // on time
  if (delayMin <= 3) return '#f59e0b';           // slightly late
  return '#ef4444';                              // late
}

function DelayBar({ bucket, maxAbs }: { bucket: HourBucket; maxAbs: number }) {
  const chartH = 80;
  const barW = 14;
  const zero = chartH / 2;
  const scale = maxAbs > 0 ? (chartH / 2 - 6) / maxAbs : 1;
  const barH = Math.abs(bucket.avgDelayMin) * scale;
  const isLate = bucket.avgDelayMin >= 0;
  const y = isLate ? zero - barH : zero;
  const color = delayColor(bucket.avgDelayMin);

  return (
    <g>
      <rect x={0} y={y} width={barW} height={Math.max(barH, 1)} fill={color} rx={2} opacity={0.9} />
      {Math.abs(bucket.avgDelayMin) >= 1 && (
        <text
          x={barW / 2}
          y={isLate ? y - 3 : y + barH + 9}
          textAnchor="middle"
          fontSize={7}
          fill="var(--text-muted)"
        >
          {bucket.avgDelayMin > 0 ? '+' : ''}{bucket.avgDelayMin}
        </text>
      )}
    </g>
  );
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
      <svg
        width={totalW + 24}
        height={chartH + 28}
        className="overflow-visible"
      >
        {/* Zero line */}
        <line x1={0} y1={zero} x2={totalW + 24} y2={zero} stroke="var(--border-primary)" strokeWidth={1} />

        {/* Bars */}
        {byHour.map((b, i) => (
          <g key={b.hour} transform={`translate(${i * stepW}, 0)`}>
            <DelayBar bucket={b} maxAbs={maxAbs} />
            <text
              x={barW / 2}
              y={chartH + 12}
              textAnchor="middle"
              fontSize={8}
              fill="var(--text-dim)"
            >
              {formatHour(b.hour)}
            </text>
          </g>
        ))}

        {/* Y axis labels */}
        <text x={totalW + 6} y={zero - 20} fontSize={7} fill="var(--text-dim)">late</text>
        <text x={totalW + 6} y={zero + 24} fontSize={7} fill="var(--text-dim)">early</text>
      </svg>
    </div>
  );
}

export default function History({ active }: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string>('hamilton');
  const [selectedRoute, setSelectedRoute] = useState<string>('10');
  const [days, setDays] = useState<Days>(7);

  const { data, status } = useHistoryAdherence(selectedSlug, selectedRoute, days);

  if (!active) return null;

  const routes = LIVE_POLLING_ROUTES;

  return (
    <div className="absolute inset-0 z-[500] bg-[var(--bg-app)] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-6 pt-16 pb-4 border-b border-[var(--border-primary)]">
        <h2 className="text-sm font-black text-[var(--text-primary)] mb-3">Schedule adherence</h2>

        {/* Route picker */}
        <div className="flex flex-wrap gap-2 mb-3">
          {routes.map(r => {
            const active = r.slug === selectedSlug && r.displayRouteShortName === selectedRoute;
            return (
              <button
                key={`${r.slug}-${r.displayRouteShortName}`}
                onClick={() => { setSelectedSlug(r.slug); setSelectedRoute(r.displayRouteShortName); }}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                  active
                    ? 'bg-[var(--accent)] text-[var(--bg-app)] border-transparent'
                    : 'bg-[var(--bg-panel)] text-[var(--text-primary)] border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)]',
                ].join(' ')}
              >
                {AGENCY_LABELS[r.slug]} {r.displayRouteShortName}
                <span className="ml-1.5 opacity-50 font-normal">every {r.scheduledHeadwayMin}m</span>
              </button>
            );
          })}
        </div>

        {/* Days selector */}
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

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {status === 'loading' && (
          <div className="flex items-center justify-center h-48 text-[var(--text-dim)] text-sm">
            Loading…
          </div>
        )}

        {status === 'noData' && (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Collecting data</p>
            <p className="text-xs text-[var(--text-muted)] text-center max-w-xs">
              Trip updates are being archived every 5 minutes. Check back in a few days once enough snapshots have accumulated.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center h-48 text-[var(--text-dim)] text-sm">
            Something went wrong — try again later.
          </div>
        )}

        {status === 'ready' && data && (
          <>
            {/* Summary stats */}
            <div className="flex gap-3 mb-6">
              <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">avg delay</p>
                <p className={[
                  'text-lg font-black',
                  data.overallAvgDelayMin > 3 ? 'text-red-500'
                    : data.overallAvgDelayMin > 1 ? 'text-amber-500'
                    : 'text-green-500',
                ].join(' ')}>
                  {data.overallAvgDelayMin > 0 ? '+' : ''}{data.overallAvgDelayMin}m
                </p>
              </div>
              <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">scheduled</p>
                <p className="text-lg font-black text-[var(--text-primary)]">every {data.scheduledHeadwayMin}m</p>
              </div>
              <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-0.5">samples</p>
                <p className="text-lg font-black text-[var(--text-primary)]">{data.sampleCount.toLocaleString()}</p>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-xl p-4">
              <p className="text-[10px] font-bold text-[var(--text-muted)] mb-3">avg delay by hour of day (min)</p>
              {data.byHour.length > 0
                ? <DelayChart byHour={data.byHour} />
                : <p className="text-xs text-[var(--text-dim)]">No hourly data yet.</p>
              }
            </div>

            {/* Legend */}
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
          </>
        )}
      </div>
    </div>
  );
}
