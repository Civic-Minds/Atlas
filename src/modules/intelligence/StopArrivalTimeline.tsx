import React, { useState, useEffect } from 'react';
import { Clock, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import {
  fetchLiveRoutes,
  fetchLiveStops,
  fetchStopArrivals,
  StopArrivalResponse,
} from '../../services/atlasApi';

interface Props {
  agency: string;
}

const WINDOW_MINS = 60;

function gapColor(gap: number | null): string {
  if (gap === null) return 'bg-[var(--border)]';
  if (gap < 2) return 'bg-amber-400';   // bunching
  if (gap > 12) return 'bg-red-500';    // long gap
  return 'bg-emerald-500';              // normal
}

function gapLabel(gap: number | null): string {
  if (gap === null) return '';
  if (gap < 2) return `${gap}m`;
  if (gap > 12) return `${gap}m`;
  return `${gap}m`;
}

export default function StopArrivalTimeline({ agency }: Props) {
  const [routes, setRoutes] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [stops, setStops] = useState<string[]>([]);
  const [selectedStop, setSelectedStop] = useState<string>('');
  const [data, setData] = useState<StopArrivalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLiveRoutes(agency)
      .then(r => { setRoutes(r); if (r.length > 0) setSelectedRoute(r[0]); })
      .catch(e => setError(e.message));
  }, [agency]);

  useEffect(() => {
    if (!selectedRoute) return;
    setSelectedStop('');
    setData(null);
    fetchLiveStops(agency, selectedRoute)
      .then(s => { setStops(s); if (s.length > 0) setSelectedStop(s[0]); })
      .catch(e => setError(e.message));
  }, [agency, selectedRoute]);

  useEffect(() => {
    if (!selectedRoute || !selectedStop) return;
    setLoading(true);
    setError(null);
    fetchStopArrivals(agency, selectedRoute, selectedStop, WINDOW_MINS)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency, selectedRoute, selectedStop]);

  // Position each dot as % along a 60-minute axis
  const now = Date.now();
  const windowMs = WINDOW_MINS * 60 * 1000;
  const dotPosition = (arrivedAt: string) => {
    const age = now - new Date(arrivedAt).getTime();
    return Math.max(0, Math.min(100, ((windowMs - age) / windowMs) * 100));
  };

  const yesterdayDelta =
    data && data.stats.avgGapMins !== null && data.yesterday.avgGapMins !== null
      ? Math.round((data.stats.avgGapMins - data.yesterday.avgGapMins) * 10) / 10
      : null;

  return (
    <div className="precision-panel overflow-hidden">
      {/* Header */}
      <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-500" />
          <span className="atlas-label">Live Stop Performance</span>
        </div>
        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] font-black border border-emerald-500/20">
          Last 60 min · Observed
        </span>
      </div>

      <div className="p-6">
        {/* Controls */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] atlas-label opacity-50">Route</span>
            <select
              value={selectedRoute}
              onChange={e => setSelectedRoute(e.target.value)}
              className="text-xs font-bold bg-[var(--item-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--fg)] focus:outline-none focus:border-emerald-500"
            >
              {routes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] atlas-label opacity-50">Stop ID</span>
            <select
              value={selectedStop}
              onChange={e => setSelectedStop(e.target.value)}
              className="text-xs font-bold bg-[var(--item-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--fg)] focus:outline-none focus:border-emerald-500"
            >
              {stops.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-500 text-xs py-4">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--bg)] rounded-xl p-4 border border-[var(--border)]">
                <div className="text-[9px] atlas-label opacity-50 mb-1">Arrivals</div>
                <div className="text-2xl font-black atlas-mono">{data.stats.count}</div>
                <div className="text-[9px] text-[var(--text-muted)]">in last 60 min</div>
              </div>
              <div className="bg-[var(--bg)] rounded-xl p-4 border border-[var(--border)]">
                <div className="text-[9px] atlas-label opacity-50 mb-1">Avg Gap</div>
                <div className="text-2xl font-black atlas-mono">
                  {data.stats.avgGapMins ?? '—'}<span className="text-sm font-normal">m</span>
                </div>
                {yesterdayDelta !== null && (
                  <div className={`flex items-center gap-1 text-[9px] font-bold mt-0.5 ${yesterdayDelta > 0 ? 'text-red-500' : yesterdayDelta < 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                    {yesterdayDelta > 0 ? <TrendingUp className="w-3 h-3" /> : yesterdayDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {yesterdayDelta > 0 ? '+' : ''}{yesterdayDelta}m vs yesterday
                  </div>
                )}
              </div>
              <div className="bg-[var(--bg)] rounded-xl p-4 border border-[var(--border)]">
                <div className="text-[9px] atlas-label opacity-50 mb-1">Worst Gap</div>
                <div className={`text-2xl font-black atlas-mono ${(data.stats.maxGapMins ?? 0) > 12 ? 'text-red-500' : ''}`}>
                  {data.stats.maxGapMins ?? '—'}<span className="text-sm font-normal">m</span>
                </div>
                <div className="text-[9px] text-[var(--text-muted)]">longest wait</div>
              </div>
              <div className="bg-[var(--bg)] rounded-xl p-4 border border-[var(--border)]">
                <div className="text-[9px] atlas-label opacity-50 mb-1">Bunching</div>
                <div className={`text-2xl font-black atlas-mono ${data.stats.bunchingCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {data.stats.bunchingCount}
                </div>
                <div className="text-[9px] text-[var(--text-muted)]">pairs &lt;2 min apart</div>
              </div>
            </div>

            {/* Dot timeline */}
            {data.arrivals.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                No arrivals recorded at this stop in the last 60 minutes.
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between text-[9px] atlas-label opacity-40 mb-2">
                  <span>60 min ago</span>
                  <span>Now</span>
                </div>

                {/* Timeline bar */}
                <div className="relative h-8 bg-[var(--bg)] rounded-full border border-[var(--border)] mb-4">
                  {data.arrivals.map((a, i) => (
                    <div
                      key={i}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full ${gapColor(a.gapMins)} transition-all`}
                      style={{ left: `${dotPosition(a.arrivedAt)}%` }}
                      title={`Vehicle ${a.vehicleId} · ${new Date(a.arrivedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}${a.gapMins !== null ? ` · +${a.gapMins}m gap` : ''}`}
                    />
                  ))}
                </div>

                {/* Arrival log */}
                <div className="divide-y divide-[var(--border)] max-h-48 overflow-y-auto rounded-xl border border-[var(--border)]">
                  {data.arrivals.map((a, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-[var(--item-bg)]/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${gapColor(a.gapMins)}`} />
                        <span className="text-xs font-bold atlas-mono text-[var(--fg)]">
                          {new Date(a.arrivedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">Vehicle {a.vehicleId}</span>
                      </div>
                      {a.gapMins !== null && (
                        <span className={`text-[10px] font-black atlas-mono ${
                          a.gapMins < 2 ? 'text-amber-500' : a.gapMins > 12 ? 'text-red-500' : 'text-[var(--text-muted)]'
                        }`}>
                          {a.gapMins < 2 ? 'BUNCHING' : a.gapMins > 12 ? `${gapLabel(a.gapMins)} GAP` : `+${gapLabel(a.gapMins)}`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[9px] text-[var(--text-muted)]">Normal</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[9px] text-[var(--text-muted)]">Bunching (&lt;2m)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[9px] text-[var(--text-muted)]">Long gap (&gt;12m)</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
