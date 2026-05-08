import React, { useState, useEffect } from 'react';
import { Ghost } from 'lucide-react';
import {
  fetchGhostBuses, type GhostRoute
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  ghostRateColor
} from '../PerformanceHelpers';

export function GhostsTab({ agency }: { agency: string }) {
  const [data, setData] = useState<GhostRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGhostBuses(agency, 120)
      .then(d => setData(d?.routes ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;

  if (data.length === 0) {
    return (
      <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Ghost className="w-8 h-8 opacity-30" />
        <p className="text-sm font-bold">No ghost bus data available</p>
        <p className="text-[10px]">Ghost detection requires static GTFS imported for this agency. Trips with no observed vehicle are counted as ghosts.</p>
      </div>
    );
  }

  const totalScheduled = data.reduce((s, r) => s + r.scheduledTrips, 0);
  const totalGhosts = data.reduce((s, r) => s + r.ghostCount, 0);
  const overallRate = totalScheduled > 0 ? totalGhosts / totalScheduled : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="precision-panel p-5 border-l-4 border-indigo-500">
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Scheduled Trips</div>
          <div className="text-2xl font-black atlas-mono">{totalScheduled.toLocaleString()}</div>
          <div className="text-[9px] text-[var(--text-muted)]">last 2 hours</div>
        </div>
        <div className={`precision-panel p-5 border-l-4 ${totalGhosts > 0 ? 'border-orange-500' : 'border-emerald-500'}`}>
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Ghost Trips</div>
          <div className={`text-2xl font-black atlas-mono ${totalGhosts > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
            {totalGhosts.toLocaleString()}
          </div>
          <div className="text-[9px] text-[var(--text-muted)]">scheduled but no vehicle seen</div>
        </div>
        <div className={`precision-panel p-5 border-l-4 ${overallRate > 0.15 ? 'border-red-500' : overallRate > 0.05 ? 'border-yellow-500' : 'border-emerald-500'}`}>
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Ghost Rate</div>
          <div className={`text-2xl font-black atlas-mono ${ghostRateColor(overallRate)}`}>
            {Math.round(overallRate * 100)}%
          </div>
          <div className="text-[9px] text-[var(--text-muted)]">of scheduled trips missing</div>
        </div>
      </div>

      {/* Per-route table */}
      <div className="precision-panel overflow-hidden">
        <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ghost className="w-4 h-4 text-orange-400" />
            <span className="atlas-label">Ghost Trip Breakdown by Route</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)]">Last 2 hours</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Route</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Scheduled</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Observed</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Ghosts</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Ghost Rate</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const coverage = r.scheduledTrips > 0 ? Math.round((r.observedTrips / r.scheduledTrips) * 100) : 0;
                return (
                  <tr
                    key={r.routeId}
                    className={`border-b border-[var(--border)]/50 hover:bg-[var(--item-bg)] transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--item-bg)]/40'}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="atlas-mono text-xs font-black">{r.routeId}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{r.scheduledTrips}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-[var(--fg)]">{r.observedTrips}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${r.ghostCount > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                        {r.ghostCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${ghostRateColor(r.ghostRate)}`}>
                        {Math.round(r.ghostRate * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${coverage >= 90 ? 'bg-emerald-500' : coverage >= 70 ? 'bg-yellow-400' : 'bg-red-500'}`}
                            style={{ width: `${coverage}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)]">{coverage}%</span>
                      </div>
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
