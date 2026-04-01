import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Clock, AlertTriangle, CheckCircle2, Search, RefreshCw } from 'lucide-react';
import { fetchCorridorPerformance, CorridorPerformance } from '../../../services/atlasApi';

interface CorridorMonitorProps {
  agency: string;
}

export function CorridorMonitor({ agency }: CorridorMonitorProps) {
  const [window, setWindow] = useState(60);
  const [data, setData] = useState<CorridorPerformance[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!agency) return;
    setLoading(true);
    try {
      const res = await fetchCorridorPerformance(agency, window);
      // Sort by reliability score (worst first)
      const sorted = res.corridors.sort((a, b) => a.reliability_score - b.reliability_score);
      setData(sorted);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agency, window]);

  // Initial load and polling
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000); // 30s poll
    return () => clearInterval(timer);
  }, [refresh]);

  const filtered = data
    ? data.filter(c =>
        (c.stop_a_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.stop_b_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        c.route_short_names.some(r => r.toLowerCase().includes(search.toLowerCase()))
      )
    : null;

  const avgReliability = data && data.length > 0
    ? Math.round(data.reduce((acc, c) => acc + c.reliability_score, 0) / data.length)
    : null;

  const bunchedCount = data?.filter(c => c.is_bunching).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="precision-panel p-5 border-l-4 border-indigo-500 bg-indigo-500/5">
          <div className="flex items-center justify-between mb-2">
            <span className="atlas-label text-[10px]">Network Health</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black atlas-mono text-indigo-600 dark:text-indigo-400">
            {avgReliability != null ? `${avgReliability}%` : '—'}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">Avg. Corrdior Reliability</p>
        </div>

        <div className="precision-panel p-5 border-l-4 border-red-500 bg-red-500/5">
          <div className="flex items-center justify-between mb-2">
            <span className="atlas-label text-[10px]">Active Bunching</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black atlas-mono text-red-600 dark:text-red-400">
            {bunchedCount}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">Corridors &gt;50% delay</p>
        </div>

        <div className="precision-panel p-5 border-l-4 border-emerald-500 bg-emerald-500/5">
          <div className="flex items-center justify-between mb-2">
            <span className="atlas-label text-[10px]">Status</span>
            {loading ? (
              <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div className="text-[10px] font-black atlas-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-2">
            {loading ? 'Polling Intelligence...' : 'Live Monitoring'}
          </div>
          <p className="text-[9px] text-[var(--text-muted)] mt-2 font-medium">
            Last update: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
          </p>
        </div>
      </div>

      {/* Controls & Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search live corridors..."
            className="w-full pl-12 pr-4 py-3 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-sm text-[var(--fg)] shadow-sm"
          />
        </div>

        <div className="flex items-center gap-3 bg-[var(--item-bg)] p-1 rounded-xl border border-[var(--border)]">
          {[30, 60, 120].map(m => (
            <button
              key={m}
              onClick={() => setWindow(m)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                window === m
                  ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Last {m}m
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      )}

      {/* Monitor List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!filtered && loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="precision-panel h-32 animate-pulse bg-[var(--item-bg)]/50" />
          ))
        ) : filtered?.length === 0 ? (
          <div className="col-span-full py-20 text-center glass-panel">
            <Activity className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-4 opacity-20" />
            <p className="text-sm text-[var(--text-muted)] font-medium">No performance data found for the current window.</p>
          </div>
        ) : (
          filtered?.map(c => (
            <div
              key={c.link_id}
              className={`precision-panel group overflow-hidden transition-all hover:translate-y-[-2px] ${
                c.is_bunching ? 'border-red-500/30' : 'hover:border-indigo-500/30'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                        c.is_bunching ? 'bg-red-500/10 text-red-600 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                      }`}>
                        {c.is_bunching ? 'Bunching Detected' : 'Nominal'}
                      </div>
                      <span className="atlas-label text-[8px]">ID: {c.link_id}</span>
                    </div>
                    <h3 className="text-sm font-black text-[var(--fg)] truncate max-w-[250px]">
                      {c.stop_a_name}
                    </h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium">
                      → {c.stop_b_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-black atlas-mono ${
                      c.reliability_score > 80 ? 'text-emerald-500' : c.reliability_score > 50 ? 'text-amber-500' : 'text-red-500'
                    }`}>
                      {c.reliability_score}%
                    </div>
                    <div className="atlas-label text-[7px] mt-1">RELIABILITY SCORE</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[var(--border)]">
                  <div className="bg-[var(--item-bg)]/50 p-2 rounded-lg border border-[var(--border)]">
                    <div className="atlas-label text-[7px] mb-1">Actual Headway</div>
                    <div className={`text-xs font-black atlas-mono ${c.is_bunching ? 'text-red-500' : 'text-[var(--fg)]'}`}>
                      {c.actual_headway_min ? `${c.actual_headway_min}m` : '—'}
                    </div>
                  </div>
                  <div className="bg-[var(--item-bg)]/50 p-2 rounded-lg border border-[var(--border)]">
                    <div className="atlas-label text-[7px] mb-1">Scheduled</div>
                    <div className="text-xs font-black atlas-mono text-[var(--text-muted)]">
                      {c.scheduled_headway_min}m
                    </div>
                  </div>
                  <div className="bg-[var(--item-bg)]/50 p-2 rounded-lg border border-[var(--border)]">
                    <div className="atlas-label text-[7px] mb-1">Arrivals</div>
                    <div className="text-xs font-black atlas-mono text-indigo-500">
                      {c.observed_arrivals}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1">
                  {c.route_short_names.map(r => (
                    <span key={r} className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-[9px] px-2 py-0.5 rounded border border-indigo-500/10">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Progress bar at the bottom */}
              <div className="h-1 w-full bg-[var(--item-bg)]">
                <div
                  className={`h-full transition-all duration-1000 ${
                    c.reliability_score > 80 ? 'bg-emerald-500' : c.reliability_score > 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${c.reliability_score}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
