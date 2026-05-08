import React, { useState, useEffect } from 'react';
import { Eye, Zap } from 'lucide-react';
import {
  fetchCorridorPerformance, type CorridorPerformance
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  headwayColor, healthBg
} from '../PerformanceHelpers';

export function CorridorsTab({ agency }: { agency: string }) {
  const [data, setData] = useState<CorridorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCorridorPerformance(agency, 60)
      .then(d => setData(d?.corridors ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;

  if (data.length === 0) {
    return (
      <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Eye className="w-8 h-8 opacity-30" />
        <p className="text-sm font-bold">No corridor performance data</p>
        <p className="text-[10px]">Corridor analysis requires both static GTFS and real-time observations. Check back during service hours.</p>
      </div>
    );
  }

  const bunchingCount = data.filter(c => c.is_bunching).length;

  return (
    <div className="space-y-6">
      {/* Bunching alert */}
      {bunchingCount > 0 && (
        <div className="precision-panel p-5 border-l-4 border-fuchsia-500 bg-fuchsia-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-fuchsia-400" />
            <span className="atlas-label text-fuchsia-400">Bunching Detected</span>
          </div>
          <p className="text-sm text-[var(--fg)]">
            <span className="font-black text-fuchsia-400">{bunchingCount}</span> corridor{bunchingCount !== 1 ? 's' : ''} showing
            bunching (actual headway collapsed to ≤50% of scheduled). Vehicles are platooning — spacing interventions needed.
          </p>
        </div>
      )}

      {/* Corridor table */}
      <div className="precision-panel overflow-hidden">
        <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-400" />
            <span className="atlas-label">Live Corridor Performance — Last 60 min</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)]">{data.length} corridors observed</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Corridor</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Routes</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Scheduled</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Actual</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Reliability</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => {
                const deviationPct = c.actual_headway_min && c.scheduled_headway_min
                  ? Math.round(((c.actual_headway_min - c.scheduled_headway_min) / c.scheduled_headway_min) * 100)
                  : null;
                return (
                  <tr
                    key={c.link_id}
                    className={`border-b border-[var(--border)]/50 hover:bg-[var(--item-bg)] transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--item-bg)]/40'}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {c.stop_a_name ?? '?'} → {c.stop_b_name ?? '?'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(c.route_short_names ?? []).map(n => (
                          <span key={n} className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">{n}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                      {c.scheduled_headway_min ? `${c.scheduled_headway_min}m` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${headwayColor(c.actual_headway_min ?? null)}`}>
                        {c.actual_headway_min ? `${c.actual_headway_min}m` : '—'}
                      </span>
                      {deviationPct !== null && deviationPct > 0 && (
                        <span className="text-[9px] text-red-400 ml-1">+{deviationPct}%</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${healthBg(c.reliability_score)}`}
                            style={{ width: `${c.reliability_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)]">{Math.round(c.reliability_score)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.is_bunching ? (
                        <span className="text-[9px] font-bold text-fuchsia-400 bg-fuchsia-500/10 px-2 py-1 rounded">⚡ BUNCHING</span>
                      ) : c.reliability_score >= 80 ? (
                        <span className="text-[9px] font-bold text-emerald-400">On track</span>
                      ) : (
                        <span className="text-[9px] font-bold text-yellow-400">Degraded</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
