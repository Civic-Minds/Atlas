import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Gauge, Target } from 'lucide-react';
import {
  fetchMatchingStats, fetchNetworkPulse, fetchGhostBuses,
  type MatchingStat, type NetworkPulseRoute, type GhostRoute,
  type MatchingStatsResponse, type NetworkPulseResponse, type GhostResponse
} from '../../../services/atlasApi';
import { TabLoading } from './TabLoading';
import { TabError } from './TabError';
import {
  healthColor, feedQualitySummary, feedQualityHeadline
} from '../PerformanceHelpers';

export function OverviewTab({ agency }: { agency: string }) {
  const [matchStats, setMatchStats] = useState<MatchingStat | null>(null);
  const [networkRoutes, setNetworkRoutes] = useState<NetworkPulseRoute[]>([]);
  const [ghosts, setGhosts] = useState<GhostRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchMatchingStats(agency).catch((): MatchingStatsResponse => ({ ts: '', stats: [] })),
      fetchNetworkPulse(agency).catch((): NetworkPulseResponse => ({ agency, ts: '', count: 0, routes: [] })),
      fetchGhostBuses(agency, 60).catch((): GhostResponse => ({ agency, windowMinutes: 60, ts: '', routes: [] })),
    ]).then(([ms, np, gh]) => {
      setMatchStats(ms.stats?.[0] ?? null);
      setNetworkRoutes(np.routes ?? []);
      setGhosts(gh.routes ?? []);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency]);

  // Derived KPIs
  const routesReportingNow = networkRoutes.filter(r => r.currentVehicles > 0).length;
  const liveVehiclesNow = networkRoutes.reduce((sum, route) => sum + route.currentVehicles, 0);
  const wideGapRoutes = networkRoutes.filter(r => r.worstGap !== null && r.worstGap > 20).length;
  const matchRate = matchStats ? Math.round((matchStats.matched_obs / Math.max(matchStats.total_obs, 1)) * 100) : null;
  const healthScore = matchStats?.healthScore ?? null;
  const totalGhosts = ghosts.reduce((sum, g) => sum + g.ghostCount, 0);
  const directMatches = matchStats?.direct_matches ?? 0;
  const spatialMatches = matchStats?.spatial_matches ?? 0;
  const unmatchedObs = matchStats?.unmatched ?? 0;

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;

  return (
    <div className="space-y-5">
      <div className="precision-panel p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="atlas-label mb-2">What Matters Now</div>
            <p className="text-base font-bold text-[var(--fg)] leading-snug">
              {feedQualityHeadline(healthScore, matchRate)}
            </p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              {wideGapRoutes > 0 || totalGhosts > 0
                ? `${wideGapRoutes} route${wideGapRoutes === 1 ? '' : 's'} have severe observed gaps and ${totalGhosts} ghost trip${totalGhosts === 1 ? '' : 's'} were flagged in the last hour.`
                : 'No severe gap or ghost-trip alerts are firing right now.'}
            </p>
          </div>
          <div className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${
            healthScore !== null && healthScore < 50
              ? 'bg-red-500/10 text-red-400'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}>
            {healthScore !== null ? `${healthScore}% feed quality` : 'Awaiting feed data'}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--item-bg)]/40 px-4 py-3">
            <div className="text-[10px] atlas-label text-[var(--text-muted)]">Match Path</div>
            <div className="mt-1 text-sm font-bold text-[var(--fg)]">
              {matchStats ? `${directMatches} direct, ${spatialMatches} spatial` : 'No match diagnostics yet'}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              {matchStats ? `${unmatchedObs} unmatched observations in the last 5 minutes` : 'Waiting for live observations'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--item-bg)]/40 px-4 py-3">
            <div className="text-[10px] atlas-label text-[var(--text-muted)]">Live Presence</div>
            <div className="mt-1 text-sm font-bold text-[var(--fg)]">
              {liveVehiclesNow} vehicles across {routesReportingNow} routes
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Current 5-minute reporting window, not the full scheduled network
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--item-bg)]/40 px-4 py-3">
            <div className="text-[10px] atlas-label text-[var(--text-muted)]">Immediate Attention</div>
            <div className="mt-1 text-sm font-bold text-[var(--fg)]">
              {wideGapRoutes} wide-gap route{wideGapRoutes === 1 ? '' : 's'}
              {totalGhosts > 0 ? `, ${totalGhosts} ghost trip${totalGhosts === 1 ? '' : 's'}` : ''}
            </div>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Worst delay build-up is listed directly below
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Feed quality */}
        <div className="precision-panel p-4 border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-emerald-500" />
            <span className="atlas-label">Feed Quality</span>
          </div>
          <div className={`text-3xl font-black atlas-mono ${healthScore !== null ? healthColor(healthScore) : ''}`}>
            {healthScore !== null ? `${healthScore}%` : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {healthScore !== null ? feedQualitySummary(healthScore) : 'Awaiting live data'}
          </div>
        </div>

        {/* Match Rate */}
        <div className="precision-panel p-4 border-l-4 border-indigo-500">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-indigo-500" />
            <span className="atlas-label">Realtime Match Rate</span>
          </div>
          <div className="text-3xl font-black atlas-mono">
            {matchRate !== null ? `${matchRate}%` : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {matchStats ? `${matchStats.matched_obs.toLocaleString()} of ${matchStats.total_obs.toLocaleString()} observations matched` : 'No observations'}
          </div>
        </div>

        {/* Live vehicles */}
        <div className="precision-panel p-4 border-l-4 border-amber-500">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-amber-500" />
            <span className="atlas-label">Live Vehicles Now</span>
          </div>
          <div className="text-3xl font-black atlas-mono">{liveVehiclesNow}</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {routesReportingNow > 0
              ? `${routesReportingNow} route${routesReportingNow === 1 ? '' : 's'} are reporting right now`
              : 'No routes are reporting in the current 5-minute window'}
          </div>
        </div>

        {/* Alerts */}
        <div className={`precision-panel p-4 border-l-4 ${wideGapRoutes > 0 || totalGhosts > 0 ? 'border-red-500' : 'border-emerald-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={`w-4 h-4 ${wideGapRoutes > 0 || totalGhosts > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
            <span className="atlas-label">Current Issues</span>
          </div>
          <div className="flex items-baseline gap-3">
            {wideGapRoutes > 0 && (
              <div>
                <span className="text-2xl font-black atlas-mono text-red-400">{wideGapRoutes}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-1">wide gaps</span>
              </div>
            )}
            {totalGhosts > 0 && (
              <div>
                <span className="text-2xl font-black atlas-mono text-orange-400">{totalGhosts}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-1">ghost trips</span>
              </div>
            )}
            {wideGapRoutes === 0 && totalGhosts === 0 && (
              <div className="text-3xl font-black atlas-mono text-emerald-400">0</div>
            )}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Derived from ghost-trip checks and routes with observed worst gaps above 20 minutes
          </div>
        </div>
      </div>
    </div>
  );
}
