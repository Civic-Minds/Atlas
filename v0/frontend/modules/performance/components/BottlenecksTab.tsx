import React, { useState, useEffect, useMemo } from 'react';
import { Zap, MapPin, ArrowRight } from 'lucide-react';
import {
  fetchSegmentBottlenecks, type SegmentBottleneck
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  formatDelay, delaySeverity
} from '../PerformanceHelpers';

export function BottlenecksTab({ agency }: { agency: string }) {
  const [data, setData] = useState<SegmentBottleneck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSegmentBottlenecks(agency, 20)
      .then(d => setData(d?.bottlenecks ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  const maxDelay = useMemo(() => Math.max(...data.map(b => Math.abs(b.avg_delay_delta)), 30), [data]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;

  if (data.length === 0) {
    return (
      <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Zap className="w-8 h-8 opacity-30" />
        <p className="text-sm font-bold">No bottleneck data available</p>
        <p className="text-[10px]">Segment metrics require static GTFS import + matcher engine. Check back after the matcher has been running for 24h.</p>
      </div>
    );
  }

  return (
    <div className="precision-panel overflow-hidden">
      <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-red-400" />
          <span className="atlas-label">Segment Delay — Last 24h</span>
        </div>
        <span className="text-[9px] text-[var(--text-muted)]">{data.length} segments · ranked by avg delay added</span>
      </div>
      <div className="divide-y divide-[var(--border)]/50">
        {data.map((b, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-[var(--item-bg)] transition-colors">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
              i < 3 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--item-bg)] text-[var(--text-muted)]'
            }`}>
              #{i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-bold atlas-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{b.route_name}</span>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[150px]">{b.from_stop_name}</span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[150px]">{b.to_stop_name}</span>
                  {b.distance_meters > 0 && <span className="opacity-50">· {Math.round(b.distance_meters)}m</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden max-w-[300px]">
                  <div
                    className={`h-full rounded-full transition-all ${Math.abs(b.avg_delay_delta) > 120 ? 'bg-red-500' : Math.abs(b.avg_delay_delta) > 60 ? 'bg-orange-400' : 'bg-yellow-400'}`}
                    style={{ width: `${Math.min(100, (Math.abs(b.avg_delay_delta) / maxDelay) * 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-bold atlas-mono ${delaySeverity(b.avg_delay_delta)}`}>
                  +{formatDelay(b.avg_delay_delta)}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 w-24">
              <div className="text-sm font-black atlas-mono text-[var(--fg)]">{formatDelay(b.total_delay_added)}</div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">delay · {b.obs_count} obs</div>
            </div>
            <div className="text-right shrink-0 w-20 border-l border-[var(--border)] pl-4">
              <div className="text-sm font-black atlas-mono text-emerald-400">
                {b.avg_speed_kmh > 0 ? b.avg_speed_kmh.toFixed(1) : '—'}
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">km/h avg</div>
            </div>
          </div>
        ))}
      </div>

      {/* Diagnosis */}
      {data.length >= 3 && (
        <div className="px-6 py-5 bg-red-500/5 border-t border-red-500/20">
          <div className="text-[10px] atlas-label text-red-400 mb-1">Intelligence</div>
          <p className="text-sm font-bold text-[var(--fg)] leading-relaxed">
            🔍 The top 3 segments add{' '}
            <span className="text-red-400 atlas-mono">
              {formatDelay(data.slice(0, 3).reduce((sum, b) => sum + b.total_delay_added, 0))}
            </span>{' '}
            of cumulative delay. Route{' '}
            <span className="text-indigo-400 atlas-mono">{data[0].route_name}</span>{' '}
            between <span className="font-semibold">{data[0].from_stop_name}</span> and <span className="font-semibold">{data[0].to_stop_name}</span> is
            the single worst segment — consider signal priority, queue jumps, or bus lanes in this corridor.
          </p>
        </div>
      )}
    </div>
  );
}
