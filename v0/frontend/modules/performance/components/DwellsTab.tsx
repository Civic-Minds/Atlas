import React, { useState, useEffect, useMemo } from 'react';
import { Timer, MapPin } from 'lucide-react';
import {
  fetchStopDwells, type StopDwell
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';

export function DwellsTab({ agency }: { agency: string }) {
  const [data, setData] = useState<StopDwell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStopDwells(agency, 20)
      .then(d => setData(d?.dwells ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  const maxDwell = useMemo(() => Math.max(...data.map(d => d.avg_dwell_seconds), 30), [data]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;

  if (data.length === 0) {
    return (
      <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Timer className="w-8 h-8 opacity-30" />
        <p className="text-sm font-bold">No dwell data available</p>
        <p className="text-[10px]">Dwell metrics require the matcher engine's dwell state detector. Check back after 24h of matched service.</p>
      </div>
    );
  }

  return (
    <div className="precision-panel overflow-hidden">
      <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-400" />
          <span className="atlas-label">Stop Dwell Analysis — Last 24h</span>
        </div>
        <span className="text-[9px] text-[var(--text-muted)]">{data.length} stops · ranked by avg dwell time</span>
      </div>
      <div className="divide-y divide-[var(--border)]/50">
        {data.map((d, i) => {
          const severity = d.avg_dwell_seconds > 90 ? 'text-red-400' : d.avg_dwell_seconds > 60 ? 'text-orange-400' : d.avg_dwell_seconds > 30 ? 'text-yellow-400' : 'text-emerald-400';
          return (
            <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-[var(--item-bg)] transition-colors">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                i < 3 ? 'bg-amber-500/15 text-amber-400' : 'bg-[var(--item-bg)] text-[var(--text-muted)]'
              }`}>
                #{i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-bold atlas-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{d.route_name}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{d.stop_name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden max-w-[300px]">
                    <div
                      className={`h-full rounded-full transition-all ${d.avg_dwell_seconds > 90 ? 'bg-red-500' : d.avg_dwell_seconds > 60 ? 'bg-orange-400' : d.avg_dwell_seconds > 30 ? 'bg-yellow-400' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (d.avg_dwell_seconds / maxDwell) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold atlas-mono ${severity}`}>{Math.round(d.avg_dwell_seconds)}s avg</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-black atlas-mono text-[var(--fg)]">{Math.round(d.max_dwell_seconds)}s</div>
                <div className="text-[9px] text-[var(--text-muted)]">max · {d.obs_count} obs</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Intelligence callout */}
      {data.length >= 3 && data[0].avg_dwell_seconds > 60 && (
        <div className="px-6 py-5 bg-amber-500/5 border-t border-amber-500/20">
          <div className="text-[10px] atlas-label text-amber-400 mb-1">Intelligence</div>
          <p className="text-sm font-bold text-[var(--fg)] leading-relaxed">
            ⏱ Stop <span className="font-semibold">{data[0].stop_name}</span> on route{' '}
            <span className="text-indigo-400 atlas-mono">{data[0].route_name}</span> averages {Math.round(data[0].avg_dwell_seconds)}s dwell time.
            Excessive dwell usually indicates fare payment bottlenecks, wheelchair ramp deployment frequency, or high passenger volume with all-door boarding not enabled.
          </p>
        </div>
      )}
    </div>
  );
}
