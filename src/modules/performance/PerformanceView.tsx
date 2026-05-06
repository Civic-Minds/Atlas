import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, AlertTriangle, Ghost, Clock, TrendingDown, TrendingUp,
  MapPin, ArrowRight, Timer, Gauge, ChevronDown, Scale, GitCompareArrows,
  Zap, Target, Eye, CheckCircle, XCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { ModuleIntro } from '../../components/ModuleIntro';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';
import {
  fetchSegmentBottlenecks, fetchStopDwells, fetchGhostBuses, fetchMatchingStats,
  fetchCorridorPerformance, fetchNetworkPulse, screenRoutes, auditServiceChange,
  fetchStopAdherence, fetchLiveRoutes,
  type SegmentBottleneck, type StopDwell, type GhostRoute,
  type MatchingStat, type CorridorPerformance, type NetworkPulseRoute,
  type ScreenRoute, type AuditResult,
  type NetworkPulseResponse, type GhostResponse, type MatchingStatsResponse,
  type StopAdherenceRecord,
} from '../../services/atlasApi';

// ── Shared tab states ────────────────────────────────────────────────────────

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

function TabError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-500 text-sm py-8">
      <AlertTriangle className="w-4 h-4" /> {message}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDelay(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  return `${mins > 0 ? '+' : ''}${mins}m`;
}

function delaySeverity(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs <= 60) return 'text-emerald-400';
  if (abs <= 180) return 'text-yellow-400';
  if (abs <= 300) return 'text-orange-400';
  return 'text-red-400';
}

function delayBg(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs <= 60) return 'border-emerald-500';
  if (abs <= 180) return 'border-yellow-500';
  if (abs <= 300) return 'border-orange-500';
  return 'border-red-500';
}

function healthColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function healthBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-yellow-400';
  if (score >= 40) return 'bg-orange-400';
  return 'bg-red-500';
}

function ghostRateColor(rate: number): string {
  if (rate <= 0.05) return 'text-emerald-400';
  if (rate <= 0.15) return 'text-yellow-400';
  if (rate <= 0.30) return 'text-orange-400';
  return 'text-red-400';
}

function feedQualitySummary(score: number): string {
  if (score >= 90) return 'Trips and positions are matching cleanly.';
  if (score >= 75) return 'Feed is usable, with some drift in assignment or stability.';
  if (score >= 50) return 'Feed quality is mixed. Expect noticeable matching gaps.';
  if (score >= 25) return 'Realtime feed is unreliable right now.';
  return 'Realtime feed quality is near-zero right now.';
}

function feedQualityHeadline(score: number | null, matchRate: number | null): string {
  if (score === null) return 'Waiting for realtime feed diagnostics.';
  if (score < 25 && matchRate !== null && matchRate >= 90) {
    return 'Trip matching is landing, but the feed itself looks unstable.';
  }
  if (score < 25) return 'Realtime feed quality is breaking down right now.';
  if (score < 50) return 'Realtime feed quality is weak and likely affecting downstream metrics.';
  if (score < 75) return 'Realtime feed is usable, but not especially trustworthy.';
  return 'Realtime feed looks healthy enough to trust for active monitoring.';
}

function headwayColor(mins: number | null): string {
  if (mins === null) return 'text-[var(--text-muted)]';
  if (mins <= 6) return 'text-emerald-400';
  if (mins <= 10) return 'text-yellow-400';
  if (mins <= 15) return 'text-orange-400';
  return 'text-red-400';
}

function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div className="space-y-1">
        <h2 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
        <p className="text-[12px] text-[var(--text-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ agency }: { agency: string }) {
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

// ── Bottlenecks Tab ──────────────────────────────────────────────────────────

function BottlenecksTab({ agency }: { agency: string }) {
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

// ── Ghost Buses Tab ──────────────────────────────────────────────────────────

function GhostsTab({ agency }: { agency: string }) {
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

// ── Dwell Tab ────────────────────────────────────────────────────────────────

function DwellsTab({ agency }: { agency: string }) {
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

// ── Corridor Performance Tab ─────────────────────────────────────────────────

function CorridorsTab({ agency }: { agency: string }) {
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

// ── Frequency Promise Tab ────────────────────────────────────────────────────
// The bridge: compares static GTFS scheduled headway with live observed headway

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

function ReliabilityAuditTab({ agency }: { agency: string }) {
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

// ── Service Change Audit Tab ─────────────────────────────────────────────────

function ServiceAuditTab({ agency }: { agency: string }) {
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

// ── Stop Adherence Tab ───────────────────────────────────────────────────────

function StopAdherenceTab({ agency }: { agency: string }) {
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

// ── Main View ────────────────────────────────────────────────────────────────

export default function PerformanceView() {
  const { role, agencyId: userAgencyId } = useAuthStore();
  const { viewAsAgency } = useViewAs();
  const isAdmin = role === 'admin' || role === 'researcher';
  const defaultAgency = isAdmin ? (viewAsAgency?.slug ?? '') : (userAgencyId ?? '');
  const [agency, setAgency] = useState(defaultAgency);

  useEffect(() => {
    if (isAdmin) setAgency(viewAsAgency?.slug ?? '');
  }, [viewAsAgency, isAdmin]);

  const sections = [
    { id: 'performance-overview', label: 'Overview', icon: Gauge },
    { id: 'performance-reliability', label: 'Reliability', icon: Scale },
    { id: 'performance-delay', label: 'Delay', icon: Zap },
    { id: 'performance-ghosts', label: 'Ghosts', icon: Ghost },
    { id: 'performance-dwells', label: 'Dwells', icon: Timer },
    { id: 'performance-corridors', label: 'Corridors', icon: Eye },
    { id: 'performance-audit', label: 'Audit', icon: GitCompareArrows },
    { id: 'performance-adherence', label: 'Adherence', icon: Target },
  ] as const;

  return (
    <div className="module-container">
      <div className="print:hidden">
        <ModuleIntro
          subtitle="Inspect feed quality, delay build-up, ghost trips, dwell friction, and corridor reliability."
        />
      </div>

    {!agency ? (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)] text-sm">
        Select an agency above to load performance data.
      </div>
    ) : (
      <div className="print:block space-y-8">
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3 print:hidden">
          {sections.map(section => {
            const Icon = section.icon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--item-bg)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                <Icon className="w-3.5 h-3.5" />
                {section.label}
              </a>
            );
          })}
        </div>

        <SectionShell
          id="performance-overview"
          title="Overview"
          description="Start with the operating readout: feed quality, live reporting volume, and immediate issues."
        >
          <OverviewTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-reliability"
          title="Reliability Audit"
          description="Compare scheduled headways with observed service to see where the published promise is holding or breaking."
        >
          <ReliabilityAuditTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-delay"
          title="Delay Build-Up"
          description="Inspect where delay is accumulating and which segments are dragging the network down."
        >
          <BottlenecksTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-ghosts"
          title="Ghost Trips"
          description="Find routes with scheduled service but missing or inconsistent realtime presence."
        >
          <GhostsTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-dwells"
          title="Stop Friction"
          description="Review stop-level dwell behaviour and where boarding friction is slowing service."
        >
          <DwellsTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-corridors"
          title="Live Corridors"
          description="Track shared trunk corridors and see where combined service is holding or collapsing."
        >
          <CorridorsTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-audit"
          title="Service Change Audit"
          description="Run before-and-after analysis against imported feed history to measure the impact of schedule changes."
        >
          <ServiceAuditTab agency={agency} />
        </SectionShell>

        <SectionShell
          id="performance-adherence"
          title="Schedule Adherence"
          description="Pick a route to see stop-by-stop on-time performance, delay trends, and which stops accumulate the most lateness."
        >
          <StopAdherenceTab agency={agency} />
        </SectionShell>
      </div>
    )}
  </div>
);
}
