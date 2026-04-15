import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Gauge, Activity, Ghost, Zap, Timer, Eye, ArrowRight,
  AlertTriangle, TrendingUp, Scale, BarChart3, MapPin, Radio
} from 'lucide-react';
import {
  fetchNetworkPulse, fetchSegmentBottlenecks, fetchGhostBuses, fetchMatchingStats,
  type NetworkPulseRoute, type SegmentBottleneck, type GhostRoute, type MatchingStat,
} from '../../../services/atlasApi';

interface DashboardProps {
  agencyId: string;
  agencyName: string;
}

export const AgencyDashboard: React.FC<DashboardProps> = ({ agencyId, agencyName }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<NetworkPulseRoute[]>([]);
  const [bottlenecks, setBottlenecks] = useState<SegmentBottleneck[]>([]);
  const [ghosts, setGhosts] = useState<GhostRoute[]>([]);
  const [matchStats, setMatchStats] = useState<MatchingStat | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchNetworkPulse(agencyId).catch(() => ({ routes: [] })),
      fetchSegmentBottlenecks(agencyId, 3).catch(() => ({ bottlenecks: [] })),
      fetchGhostBuses(agencyId, 60).catch(() => ({ routes: [] })),
      fetchMatchingStats(agencyId).catch(() => ({ stats: [] })),
    ]).then(([np, bn, gh, ms]) => {
      setRoutes((np as any).routes ?? []);
      setBottlenecks((bn as any).bottlenecks ?? []);
      setGhosts((gh as any).routes ?? []);
      setMatchStats((ms as any).stats?.[0] ?? null);
    }).finally(() => setLoading(false));
  }, [agencyId]);

  // Derived KPIs
  const totalRoutes = routes.length;
  const activeNow = routes.filter(r => r.currentVehicles > 0).length;
  const frequentRoutes = routes.filter(r => r.avgGap !== null && r.avgGap <= 10).length;
  const wideGapRoutes = routes.filter(r => r.worstGap !== null && r.worstGap > 20).length;
  const totalVehicles = routes.reduce((s, r) => s + r.currentVehicles, 0);
  const totalGhosts = ghosts.reduce((s, g) => s + g.ghostCount, 0);
  const healthScore = matchStats?.healthScore ?? null;
  const worstRoute = routes[0]; // Already sorted by worst gap

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-muted)]">Loading your network...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-8 py-10 max-w-7xl mx-auto w-full">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <h1 className="text-3xl font-black tracking-tight text-[var(--fg)] mb-2">
            {greeting}
          </h1>
          <p className="text-lg text-[var(--text-muted)] font-medium">
            Here's how <span className="text-indigo-400 font-bold">{agencyName}</span> is performing right now.
          </p>
        </motion.div>

        {/* KPI Strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10"
        >
          <KpiCard
            icon={Gauge}
            label="Health"
            value={healthScore !== null ? String(healthScore) : '—'}
            color={healthScore !== null ? (healthScore >= 80 ? 'emerald' : healthScore >= 60 ? 'yellow' : 'red') : 'muted'}
            sub={healthScore !== null ? (healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs attention') : ''}
          />
          <KpiCard
            icon={Radio}
            label="Vehicles Now"
            value={String(totalVehicles)}
            color="indigo"
            sub={`across ${activeNow} routes`}
          />
          <KpiCard
            icon={Activity}
            label="Routes Active"
            value={`${activeNow}/${totalRoutes}`}
            color="amber"
            sub={`${frequentRoutes} frequent (≤10m)`}
          />
          <KpiCard
            icon={Scale}
            label="Frequent"
            value={String(frequentRoutes)}
            color="emerald"
            sub="at ≤10m headway"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Wide Gaps"
            value={String(wideGapRoutes)}
            color={wideGapRoutes > 0 ? 'red' : 'emerald'}
            sub="routes >20m gap"
          />
          <KpiCard
            icon={Ghost}
            label="Ghost Trips"
            value={String(totalGhosts)}
            color={totalGhosts > 0 ? 'orange' : 'emerald'}
            sub="last 60 minutes"
          />
        </motion.div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* Top Bottlenecks */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="precision-panel overflow-hidden"
          >
            <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-red-400" />
                <span className="atlas-label">Top Bottlenecks</span>
              </div>
              <button
                onClick={() => navigate('/performance')}
                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {bottlenecks.length === 0 ? (
              <div className="px-5 py-8 text-center text-[10px] text-[var(--text-muted)]">No bottleneck data yet</div>
            ) : (
              <div className="divide-y divide-[var(--border)]/50">
                {bottlenecks.map((b, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${
                      i === 0 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--item-bg)] text-[var(--text-muted)]'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold atlas-mono text-indigo-400">{b.route_name}</span>
                        <span className="text-[9px] text-[var(--text-muted)] truncate">
                          {b.from_stop_name} → {b.to_stop_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden max-w-[140px]">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, (Math.abs(b.avg_delay_delta) / 120) * 100)}%` }} />
                        </div>
                        <span className="text-[9px] font-bold text-red-400 atlas-mono">
                          +{Math.abs(b.avg_delay_delta) < 60 ? `${Math.round(b.avg_delay_delta)}s` : `${Math.round(b.avg_delay_delta / 60)}m`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Worst Routes */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="precision-panel overflow-hidden"
          >
            <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="atlas-label">Worst Routes by Gap</span>
              </div>
              <button
                onClick={() => navigate('/pulse')}
                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors"
              >
                Open Pulse <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {routes.length === 0 ? (
              <div className="px-5 py-8 text-center text-[10px] text-[var(--text-muted)]">No route data available</div>
            ) : (
              <div className="divide-y divide-[var(--border)]/50">
                {routes.slice(0, 5).map((r, i) => {
                  const gapColor = r.worstGap !== null ? (r.worstGap <= 10 ? 'text-emerald-400' : r.worstGap <= 15 ? 'text-yellow-400' : r.worstGap <= 20 ? 'text-orange-400' : 'text-red-400') : 'text-[var(--text-muted)]';
                  return (
                    <div key={r.routeId} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="atlas-mono text-xs font-black w-10">{r.routeId}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${r.currentVehicles > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                          <span className="text-[10px] text-[var(--text-muted)]">{r.currentVehicles} vehicles</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className={`text-xs font-bold atlas-mono ${gapColor}`}>
                            {r.worstGap !== null ? `${r.worstGap}m` : '—'}
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)] ml-1">worst</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold atlas-mono text-[var(--text-muted)]">
                            {r.avgGap !== null ? `${r.avgGap}m` : '—'}
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)] ml-1">avg</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <QuickAction
            icon={Gauge}
            title="Performance"
            subtitle="OTP, bottlenecks, ghosts"
            onClick={() => navigate('/performance')}
          />
          <QuickAction
            icon={Eye}
            title="Pulse"
            subtitle="Route health heatmaps"
            onClick={() => navigate('/pulse')}
          />
          <QuickAction
            icon={MapPin}
            title="Live Map"
            subtitle="Vehicle positions"
            onClick={() => navigate('/map')}
          />
          <QuickAction
            icon={TrendingUp}
            title="Analyze"
            subtitle="Frequency screening"
            onClick={() => navigate('/analyze')}
          />
        </motion.div>
      </div>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  color: string;
  sub: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 border-emerald-500',
    yellow: 'text-yellow-400 border-yellow-500',
    amber: 'text-amber-400 border-amber-500',
    orange: 'text-orange-400 border-orange-500',
    red: 'text-red-400 border-red-500',
    indigo: 'text-indigo-400 border-indigo-500',
    muted: 'text-[var(--text-muted)] border-[var(--border)]',
  };
  const c = colorMap[color] || colorMap.muted;

  return (
    <div className={`precision-panel p-4 border-l-2 ${c.split(' ')[1]}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3 h-3 ${c.split(' ')[0]}`} />
        <span className="text-[9px] atlas-label opacity-60">{label}</span>
      </div>
      <div className={`text-xl font-black atlas-mono ${c.split(' ')[0]}`}>{value}</div>
      {sub && <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

function QuickAction({ icon: Icon, title, subtitle, onClick }: {
  icon: React.ComponentType<any>;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group precision-panel p-4 text-left hover:border-indigo-500/30 transition-all flex items-center gap-3"
    >
      <div className="w-9 h-9 rounded-lg bg-[var(--item-bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-indigo-500 group-hover:border-indigo-500/30 transition-all shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-[var(--fg)]">{title}</div>
        <div className="text-[9px] text-[var(--text-muted)] truncate">{subtitle}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all ml-auto shrink-0" />
    </button>
  );
}
