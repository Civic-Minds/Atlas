import React, { useState, useEffect } from 'react';
import { GitCompareArrows, TrendingUp, TrendingDown } from 'lucide-react';
import {
  auditServiceChange, type AuditResult
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  headwayColor, healthBg, healthColor
} from '../PerformanceHelpers';

export function ServiceAuditTab({ agency }: { agency: string }) {
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    auditServiceChange(agency)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  if (loading) return <TabLoading />;
  if (error) return (
    <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
      <GitCompareArrows className="w-8 h-8 opacity-30" />
      <p className="text-sm font-bold">Audit unavailable</p>
      <p className="text-[10px] max-w-md text-center">{error.includes('Not enough') ? 'Service change auditing requires at least 2 GTFS feed versions uploaded for this agency.' : error}</p>
    </div>
  );
  if (!data) return null;

  const pivot = new Date(data.pivotDate);
  const beforeResults = data.before?.results ?? [];
  const afterResults = data.after?.results ?? [];
  const beforeCount = beforeResults.length;
  const afterCount = afterResults.length;

  // Compare average reliability
  const avgReliabilityBefore = beforeCount > 0 ? Math.round(beforeResults.reduce((s, r) => s + r.reliability_score, 0) / beforeCount) : null;
  const avgReliabilityAfter = afterCount > 0 ? Math.round(afterResults.reduce((s, r) => s + r.reliability_score, 0) / afterCount) : null;
  const relDelta = avgReliabilityBefore !== null && avgReliabilityAfter !== null ? avgReliabilityAfter - avgReliabilityBefore : null;

  const bunchingBefore = beforeResults.filter(r => r.is_bunching).length;
  const bunchingAfter = afterResults.filter(r => r.is_bunching).length;

  return (
    <div className="space-y-6">
      {/* Pivot info */}
      <div className="precision-panel p-5 border-l-4 border-indigo-500">
        <div className="flex items-center gap-2 mb-2">
          <GitCompareArrows className="w-4 h-4 text-indigo-400" />
          <span className="atlas-label">Service Change Audit</span>
        </div>
        <p className="text-sm text-[var(--fg)]">
          Comparing 30-day windows around the schedule change on{' '}
          <span className="font-black text-indigo-400 atlas-mono">{pivot.toLocaleDateString('en-CA')}</span>.
          Feed version <span className="atlas-mono text-[10px] text-[var(--text-muted)]">{data.before?.version ?? '—'}</span> →{' '}
          <span className="atlas-mono text-[10px] text-[var(--text-muted)]">{data.after?.version ?? '—'}</span>
        </p>
      </div>

      {/* Before/After KPIs */}
      <div className="grid grid-cols-2 gap-4">
        {/* Before */}
        <div className="precision-panel overflow-hidden">
          <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="atlas-label text-[var(--text-muted)]">Before Change</span>
            <span className="text-[9px] text-[var(--text-muted)]">{new Date(data.before.start).toLocaleDateString('en-CA')} → {new Date(data.before.end).toLocaleDateString('en-CA')}</span>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <div>
              <div className="text-[9px] atlas-label opacity-50 mb-1">Corridors</div>
              <div className="text-xl font-black atlas-mono">{beforeCount}</div>
            </div>
            <div>
              <div className="text-[9px] atlas-label opacity-50 mb-1">Avg Reliability</div>
              <div className={`text-xl font-black atlas-mono ${avgReliabilityBefore !== null ? healthColor(avgReliabilityBefore) : ''}`}>
                {avgReliabilityBefore !== null ? `${avgReliabilityBefore}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] atlas-label opacity-50 mb-1">Bunching</div>
              <div className={`text-xl font-black atlas-mono ${bunchingBefore > 0 ? 'text-fuchsia-400' : 'text-emerald-400'}`}>
                {bunchingBefore}
              </div>
            </div>
          </div>
        </div>

        {/* After */}
        <div className="precision-panel overflow-hidden">
          <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="atlas-label text-indigo-400">After Change</span>
            <span className="text-[9px] text-[var(--text-muted)]">{new Date(data.after.start).toLocaleDateString('en-CA')} → {new Date(data.after.end).toLocaleDateString('en-CA')}</span>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <div>
              <div className="text-[9px] atlas-label opacity-50 mb-1">Corridors</div>
              <div className="text-xl font-black atlas-mono">{afterCount}</div>
            </div>
            <div>
              <div className="text-[9px] atlas-label opacity-50 mb-1">Avg Reliability</div>
              <div className={`text-xl font-black atlas-mono ${avgReliabilityAfter !== null ? healthColor(avgReliabilityAfter) : ''}`}>
                {avgReliabilityAfter !== null ? `${avgReliabilityAfter}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] atlas-label opacity-50 mb-1">Bunching</div>
              <div className={`text-xl font-black atlas-mono ${bunchingAfter > 0 ? 'text-fuchsia-400' : 'text-emerald-400'}`}>
                {bunchingAfter}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delta callout */}
      {relDelta !== null && (
        <div className={`precision-panel p-5 border-l-4 ${relDelta >= 0 ? 'border-emerald-500 bg-emerald-500/5' : 'border-red-500 bg-red-500/5'}`}>
          <div className="flex items-center gap-2 mb-2">
            {relDelta >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            <span className={`atlas-label ${relDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Reliability Impact</span>
          </div>
          <p className="text-sm text-[var(--fg)]">
            Average corridor reliability
            {relDelta >= 0 ? ' improved' : ' declined'} by{' '}
            <span className={`font-black atlas-mono ${relDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {relDelta > 0 ? '+' : ''}{relDelta}%
            </span>{' '}
            after the schedule change.
            {bunchingAfter !== bunchingBefore && (
              <> Bunching {bunchingAfter < bunchingBefore ? 'decreased' : 'increased'} from {bunchingBefore} to {bunchingAfter} corridors.</>
            )}
          </p>
        </div>
      )}

      {/* Corridor-level comparison */}
      {afterCount > 0 && (
        <div className="precision-panel overflow-hidden">
          <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <span className="atlas-label">Post-Change Corridor Detail</span>
            <span className="text-[9px] text-[var(--text-muted)]">{afterCount} corridors in window</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Corridor</th>
                  <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Routes</th>
                  <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Reliability</th>
                  <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Observed</th>
                  <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Status</th>
                </tr>
              </thead>
              <tbody>
                {afterResults.slice(0, 20).map((c, i) => (
                  <tr
                    key={c.link_id}
                    className={`border-b border-[var(--border)]/50 hover:bg-[var(--item-bg)] transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--item-bg)]/40'}`}
                  >
                    <td className="px-4 py-2.5 text-[10px] text-[var(--text-muted)]">
                      {c.stop_a_name ?? '?'} → {c.stop_b_name ?? '?'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {(c.route_short_names ?? []).map(n => (
                          <span key={n} className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">{n}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${healthBg(c.reliability_score)}`} style={{ width: `${c.reliability_score}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)]">{Math.round(c.reliability_score)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${headwayColor(c.actual_headway_min ?? null)}`}>
                        {c.actual_headway_min ? `${c.actual_headway_min}m` : '—'}
                      </span>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
