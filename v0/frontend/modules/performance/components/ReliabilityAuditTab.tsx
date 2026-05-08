import React, { useState, useEffect } from 'react';
import { Scale, Clock, CheckCircle, XCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  screenRoutes, fetchNetworkPulse,
  type ScreenRoute, type NetworkPulseRoute
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  headwayColor
} from '../PerformanceHelpers';

interface PromiseRow {
  routeId: string;
  routeName: string;
  scheduledHeadway: number;
  tier: string;
  observedGap: number | null;
  currentVehicles: number;
  deviation: number | null;
  status: 'exceeding' | 'meeting' | 'underperforming' | 'failing' | 'no_data';
}

export function ReliabilityAuditTab({ agency }: { agency: string }) {
  const [rows, setRows] = useState<PromiseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      screenRoutes({
        agency,
        maxHeadway: 60,
        windowStart: 420,
        windowEnd: 1140,
        dayType: 'Weekday',
        directions: 'one',
      }).catch(() => ({ routes: [] as ScreenRoute[] })),
      fetchNetworkPulse(agency).catch(() => ({ routes: [] as NetworkPulseRoute[] })),
    ]).then(([screenData, pulseData]) => {
      const sRoutes = screenData?.routes ?? [];
      const pRoutes = pulseData?.routes ?? [];
      const observed = new Map(pRoutes.map(r => [r.routeId, r]));

      const merged: PromiseRow[] = sRoutes.map(sr => {
        const obs = observed.get(sr.gtfs_route_id);
        const scheduledHw = parseFloat(sr.avg_headway) || 0;
        const observedGap = obs?.avgGap ?? null;
        const deviation = observedGap !== null && scheduledHw > 0
          ? Math.round(((observedGap - scheduledHw) / scheduledHw) * 100)
          : null;

        let status: PromiseRow['status'] = 'no_data';
        if (deviation !== null) {
          if (deviation <= -10) status = 'exceeding';
          else if (deviation <= 15) status = 'meeting';
          else if (deviation <= 50) status = 'underperforming';
          else status = 'failing';
        }

        return {
          routeId: sr.gtfs_route_id,
          routeName: sr.route_short_name || sr.route_long_name || sr.gtfs_route_id,
          scheduledHeadway: scheduledHw,
          tier: sr.tier || '—',
          observedGap,
          currentVehicles: obs?.currentVehicles ?? 0,
          deviation,
          status,
        };
      });

      // Sort: failing first, then underperforming, meeting, exceeding, no_data
      const order = { failing: 0, underperforming: 1, meeting: 2, exceeding: 3, no_data: 4 };
      merged.sort((a, b) => order[a.status] - order[b.status]);
      setRows(merged);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;

  if (rows.length === 0) {
    return (
      <div className="precision-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Scale className="w-8 h-8 opacity-30" />
        <p className="text-sm font-bold">No frequency data available</p>
        <p className="text-[10px]">Requires both static GTFS imported and real-time observations for this agency.</p>
      </div>
    );
  }

  const meetingCount = rows.filter(r => r.status === 'meeting' || r.status === 'exceeding').length;
  const failingCount = rows.filter(r => r.status === 'failing').length;
  const underCount = rows.filter(r => r.status === 'underperforming').length;
  const withData = rows.filter(r => r.status !== 'no_data').length;

  const statusConfig = {
    exceeding: { label: 'Exceeding', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: ArrowDownRight },
    meeting: { label: 'Meeting', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
    underperforming: { label: 'Under', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: ArrowUpRight },
    failing: { label: 'Failing', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
    no_data: { label: 'No Data', color: 'text-[var(--text-muted)]', bg: 'bg-[var(--item-bg)]', icon: Clock },
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="precision-panel p-5 border-l-4 border-emerald-500">
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Meeting Promise</div>
          <div className="text-2xl font-black atlas-mono text-emerald-400">{meetingCount}</div>
          <div className="text-[9px] text-[var(--text-muted)]">{withData > 0 ? `${Math.round(meetingCount / withData * 100)}%` : '—'} of observed routes</div>
        </div>
        <div className={`precision-panel p-5 border-l-4 ${underCount > 0 ? 'border-orange-500' : 'border-emerald-500'}`}>
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Underperforming</div>
          <div className={`text-2xl font-black atlas-mono ${underCount > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>{underCount}</div>
          <div className="text-[9px] text-[var(--text-muted)]">+15–50% above scheduled</div>
        </div>
        <div className={`precision-panel p-5 border-l-4 ${failingCount > 0 ? 'border-red-500' : 'border-emerald-500'}`}>
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Failing</div>
          <div className={`text-2xl font-black atlas-mono ${failingCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{failingCount}</div>
          <div className="text-[9px] text-[var(--text-muted)]">&gt;50% above scheduled</div>
        </div>
        <div className="precision-panel p-5 border-l-4 border-indigo-500">
          <div className="text-[10px] atlas-label text-[var(--text-muted)] mb-2">Total Routes</div>
          <div className="text-2xl font-black atlas-mono">{rows.length}</div>
          <div className="text-[9px] text-[var(--text-muted)]">{rows.length - withData} without live data</div>
        </div>
      </div>

      {/* Table */}
      <div className="precision-panel overflow-hidden">
        <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-indigo-400" />
            <span className="atlas-label">Scheduled vs. Observed — Weekday 7am–7pm</span>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Meeting</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400 inline-block" /> Under</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> Failing</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Route</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Tier</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Scheduled</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Observed</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Deviation</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Vehicles</th>
                <th className="px-4 py-3 text-[9px] atlas-label opacity-50">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cfg = statusConfig[r.status];
                const StatusIcon = cfg.icon;
                return (
                  <tr
                    key={r.routeId}
                    className={`border-b border-[var(--border)]/50 hover:bg-[var(--item-bg)] transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--item-bg)]/40'}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="atlas-mono text-xs font-black">{r.routeName}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">{r.tier}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-bold text-[var(--text-muted)]">{r.scheduledHeadway.toFixed(0)}m</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${r.observedGap !== null ? headwayColor(r.observedGap) : 'text-[var(--text-muted)]'}`}>
                        {r.observedGap !== null ? `${r.observedGap}m` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.deviation !== null ? (
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-bold atlas-mono ${r.deviation > 50 ? 'text-red-400' : r.deviation > 15 ? 'text-orange-400' : r.deviation <= -10 ? 'text-emerald-400' : 'text-emerald-400'}`}>
                            {r.deviation > 0 ? '+' : ''}{r.deviation}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${r.currentVehicles > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                        <span className="text-xs font-bold text-[var(--fg)]">{r.currentVehicles}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold ${cfg.color} ${cfg.bg} w-fit`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Intelligence */}
        {failingCount > 0 && (
          <div className="px-6 py-5 bg-red-500/5 border-t border-red-500/20">
            <div className="text-[10px] atlas-label text-red-400 mb-1">Frequency Promise Gap</div>
            <p className="text-sm font-bold text-[var(--fg)] leading-relaxed">
              ⚠️ <span className="text-red-400 atlas-mono">{failingCount}</span> route{failingCount !== 1 ? 's are' : ' is'} running
              &gt;50% above published headway. Riders on these routes are experiencing significantly worse service than advertised.
              {rows.filter(r => r.status === 'failing')[0] && (
                <> Route <span className="text-indigo-400 atlas-mono">{rows.filter(r => r.status === 'failing')[0].routeName}</span> is
                  scheduled at {rows.filter(r => r.status === 'failing')[0].scheduledHeadway.toFixed(0)}m but running at{' '}
                  <span className="text-red-400">{rows.filter(r => r.status === 'failing')[0].observedGap}m</span>.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
