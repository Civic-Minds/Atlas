import React, { useState, useEffect } from 'react';
import { Target } from 'lucide-react';
import {
  fetchLiveRoutes, fetchStopAdherence,
  type StopAdherenceRecord
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  formatDelay, delaySeverity
} from '../PerformanceHelpers';

export function StopAdherenceTab({ agency }: { agency: string }) {
  const [routes, setRoutes] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<StopAdherenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoutesLoading(true);
    setSelectedRoute('');
    setData([]);
    fetchLiveRoutes(agency)
      .then(r => setRoutes(r.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))))
      .catch(() => setRoutes([]))
      .finally(() => setRoutesLoading(false));
  }, [agency]);

  useEffect(() => {
    if (!selectedRoute) return;
    setLoading(true);
    setError(null);
    fetchStopAdherence(agency, selectedRoute, hours)
      .then(d => setData(d.stops ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency, selectedRoute, hours]);

  const summaryOnTime = data.reduce((s, r) => s + r.onTimeCount, 0);
  const summaryEarly  = data.reduce((s, r) => s + r.earlyCount, 0);
  const summaryLate   = data.reduce((s, r) => s + r.lateCount, 0);
  const summaryTotal  = summaryOnTime + summaryEarly + summaryLate;
  const overallOnTimePct = summaryTotal > 0 ? Math.round((summaryOnTime / summaryTotal) * 100) : null;
  const worstStop = data.length > 0
    ? [...data].sort((a, b) => Math.abs(b.avgDelaySeconds) - Math.abs(a.avgDelaySeconds))[0]
    : null;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="atlas-label text-[10px] whitespace-nowrap">Route</span>
          <select
            value={selectedRoute}
            onChange={e => setSelectedRoute(e.target.value)}
            disabled={routesLoading}
            className="bg-[var(--item-bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[11px] text-[var(--fg)] focus:outline-none focus:border-indigo-500"
          >
            <option value="">{routesLoading ? 'Loading…' : '— select route —'}</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="atlas-label text-[10px] whitespace-nowrap">Window</span>
          <div className="flex gap-1">
            {([3, 6, 12, 24] as const).map(h => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                  hours === h
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty-state prompts */}
      {!selectedRoute && !routesLoading && (
        <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
          <Target className="w-8 h-8 opacity-30" />
          <p className="text-sm font-bold">Select a route to view stop-level adherence</p>
          <p className="text-[10px]">Requires static GTFS to be imported for this agency.</p>
        </div>
      )}
      {selectedRoute && loading && <TabLoading />}
      {selectedRoute && !loading && error && <TabError message={error} />}
      {selectedRoute && !loading && !error && data.length === 0 && (
        <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
          <Target className="w-8 h-8 opacity-30" />
          <p className="text-sm font-bold">No adherence data for route {selectedRoute}</p>
          <p className="text-[10px]">Try a longer window or verify static GTFS is imported.</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && data.length > 0 && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="precision-panel px-4 py-3">
              <div className="atlas-label text-[var(--text-muted)] mb-1">On Time</div>
              <div className={`text-2xl font-black atlas-mono ${
                overallOnTimePct === null ? 'text-[var(--text-muted)]'
                : overallOnTimePct >= 80  ? 'text-emerald-400'
                : overallOnTimePct >= 60  ? 'text-yellow-400'
                : 'text-red-400'
              }`}>
                {overallOnTimePct !== null ? `${overallOnTimePct}%` : '—'}
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{summaryTotal} observations</div>
            </div>
            <div className="precision-panel px-4 py-3">
              <div className="atlas-label text-[var(--text-muted)] mb-1">Early</div>
              <div className="text-2xl font-black atlas-mono text-indigo-400">
                {summaryTotal > 0 ? `${Math.round((summaryEarly / summaryTotal) * 100)}%` : '—'}
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{summaryEarly} obs</div>
            </div>
            <div className="precision-panel px-4 py-3">
              <div className="atlas-label text-[var(--text-muted)] mb-1">Late</div>
              <div className="text-2xl font-black atlas-mono text-orange-400">
                {summaryTotal > 0 ? `${Math.round((summaryLate / summaryTotal) * 100)}%` : '—'}
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{summaryLate} obs</div>
            </div>
            <div className="precision-panel px-4 py-3">
              <div className="atlas-label text-[var(--text-muted)] mb-1">Worst Stop</div>
              <div className={`text-2xl font-black atlas-mono ${worstStop ? delaySeverity(worstStop.avgDelaySeconds) : 'text-[var(--text-muted)]'}`}>
                {worstStop ? formatDelay(worstStop.avgDelaySeconds) : '—'}
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5 truncate">{worstStop?.stopName ?? '—'}</div>
            </div>
          </div>

          {/* Per-stop table */}
          <div className="precision-panel overflow-hidden">
            <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-400" />
                <span className="atlas-label">Stop-by-Stop Adherence — Route {selectedRoute}</span>
              </div>
              <span className="text-[9px] text-[var(--text-muted)]">{data.length} stops · last {hours}h</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                    <th className="px-5 py-3 text-left font-bold atlas-label text-[9px]">#</th>
                    <th className="px-5 py-3 text-left font-bold atlas-label text-[9px]">Stop</th>
                    <th className="px-5 py-3 text-right font-bold atlas-label text-[9px]">Avg Delay</th>
                    <th className="px-5 py-3 text-right font-bold atlas-label text-[9px]">Median</th>
                    <th className="px-5 py-3 text-right font-bold atlas-label text-[9px]">On Time</th>
                    <th className="px-5 py-3 text-right font-bold atlas-label text-[9px]">Samples</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/50">
                  {data.map((stop, i) => (
                    <tr key={stop.stopId} className="hover:bg-[var(--item-bg)] transition-colors">
                      <td className="px-5 py-3 text-[var(--text-muted)] font-bold atlas-mono w-10">
                        {stop.stopSequence ?? i + 1}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-[var(--fg)]">{stop.stopName ?? stop.stopId}</div>
                        <div className="text-[9px] text-[var(--text-muted)] atlas-mono mt-0.5">{stop.stopId}</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-black atlas-mono ${delaySeverity(stop.avgDelaySeconds)}`}>
                          {formatDelay(stop.avgDelaySeconds)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-bold atlas-mono ${delaySeverity(stop.medianDelaySeconds)}`}>
                          {formatDelay(stop.medianDelaySeconds)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${stop.onTimePct >= 80 ? 'bg-emerald-500' : stop.onTimePct >= 60 ? 'bg-yellow-400' : 'bg-red-500'}`}
                              style={{ width: `${stop.onTimePct}%` }}
                            />
                          </div>
                          <span className={`font-bold atlas-mono w-8 text-right ${stop.onTimePct >= 80 ? 'text-emerald-400' : stop.onTimePct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {Math.round(stop.onTimePct)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-[var(--text-muted)] atlas-mono">
                        {stop.sampleCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
