import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Gauge, Activity, Ghost, Zap, Timer, Eye, ArrowRight,
  AlertTriangle, TrendingUp, TrendingDown, Target, Info
} from 'lucide-react';
import {
  fetchNetworkPulse, fetchSegmentBottlenecks, fetchGhostBuses, fetchMatchingStats, fetchHealthTrend,
  type NetworkPulseRoute, type SegmentBottleneck, type GhostRoute, type MatchingStat, type HealthTrendPoint
} from '../../../services/atlasApi';
import { TrendSparkline } from '../../../components/common/TrendSparkline';

interface DashboardProps {
  agencyId: string;
  agencyName: string;
}

export const AgencyDashboard: React.FC<DashboardProps> = ({ agencyId, agencyName }) => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<NetworkPulseRoute[]>([]);
  const [bottlenecks, setBottlenecks] = useState<SegmentBottleneck[]>([]);
  const [ghosts, setGhosts] = useState<GhostRoute[]>([]);
  const [matchStats, setMatchStats] = useState<MatchingStat | null>(null);
  const [healthTrend, setHealthTrend] = useState<HealthTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Load data independently to prevent slow queries from blocking the entire UI
    fetchNetworkPulse(agencyId)
      .then(d => setRoutes((d as any).routes ?? []))
      .catch(() => setRoutes([]))
      .finally(() => setLoading(false));

    fetchSegmentBottlenecks(agencyId, 3)
      .then(d => setBottlenecks((d as any).bottlenecks ?? []))
      .catch(() => setBottlenecks([]));

    fetchGhostBuses(agencyId, 60)
      .then(d => setGhosts((d as any).routes ?? []))
      .catch(() => setGhosts([]));

    fetchMatchingStats(agencyId)
      .then(d => setMatchStats((d as any).stats?.[0] ?? null))
      .catch(() => setMatchStats(null));

    fetchHealthTrend(agencyId)
      .then(d => setHealthTrend(d.trend ?? []))
      .catch(() => setHealthTrend([]));
  }, [agencyId]);

  // Derived KPIs
  const totalRoutes = routes.length;
  const activeNow = routes.filter(r => r.currentVehicles > 0).length;
  const healthScore = matchStats?.healthScore ?? 0;
  const wideGaps = routes.filter(r => (r.worstGap ?? 0) > 20).length;
  const frequentRoutes = routes.filter(r => (r.avgGap ?? 100) <= 10).length;
  const totalGhosts = ghosts.reduce((sum, g) => sum + g.ghostCount, 0);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* ── Greeting ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--fg)]">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}
          </h1>
          <p className="mt-1 text-[var(--text-muted)] text-sm">
            Here's how <span className="font-bold text-indigo-500">{agencyName}</span> is performing right now.
          </p>
        </div>
      </div>

      {/* ── Main KPI Strip ─────────────────────────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-6 gap-4"
      >
        <KpiCard
          label="HEALTH"
          value={`${healthScore}%`}
          subtitle={healthScore >= 80 ? 'Healthy feed' : healthScore >= 60 ? 'Degraded' : 'Needs attention'}
          icon={Gauge}
          color={healthScore >= 80 ? 'emerald' : healthScore >= 60 ? 'yellow' : 'red'}
          trend={healthTrend.map(p => p.score)}
        />
        <KpiCard
          label="VEHICLES NOW"
          value={routes.reduce((s, r) => s + r.currentVehicles, 0).toString()}
          subtitle={`across ${activeNow} routes`}
          icon={Activity}
          color="indigo"
        />
        <KpiCard
          label="ROUTES ACTIVE"
          value={`${activeNow}/${totalRoutes || '—'}`}
          subtitle={`${frequentRoutes} frequent (≤10m)`}
          icon={Activity}
          color="yellow"
        />
        <KpiCard
          label="FREQUENT"
          value={frequentRoutes.toString()}
          subtitle="at ≤10m headway"
          icon={Target}
          color="emerald"
        />
        <KpiCard
          label="WIDE GAPS"
          value={wideGaps.toString()}
          subtitle={`routes >20m gap`}
          icon={AlertTriangle}
          color={wideGaps > 0 ? 'orange' : 'emerald'}
        />
        <KpiCard
          label="GHOST TRIPS"
          value={totalGhosts.toString()}
          subtitle="last 60 minutes"
          icon={Ghost}
          color={totalGhosts > 0 ? 'red' : 'emerald'}
        />
      </motion.div>

      {/* ── Visual Intelligence Row ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Network Pulse Trend */}
        <div className="lg:col-span-2 precision-panel p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="atlas-label mb-1">Network Pulse</div>
              <h2 className="text-sm font-bold text-[var(--fg)]">Reliability — Last 24 Hours</h2>
            </div>
            <div className="flex items-center gap-4 text-[10px] atlas-mono text-[var(--text-muted)]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500" /> Match Rate
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Confidence
              </div>
            </div>
          </div>
          
          <div className="h-48 w-full relative">
            {healthTrend.length > 0 ? (
              <div className="w-full h-full">
                <TrendSparkline 
                  data={healthTrend.map(p => p.matchRate)} 
                  color="#6366f1" 
                  width={800} 
                  height={180} 
                  strokeWidth={3} 
                />
                <div className="absolute inset-0 opacity-40">
                  <TrendSparkline 
                    data={healthTrend.map(p => p.reliabilityScore)} 
                    color="#10b981" 
                    width={800} 
                    height={180} 
                    strokeWidth={2} 
                  />
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-[11px]">
                {loading ? 'Computing trend diagnostics...' : 'No historical data for this window'}
              </div>
            )}
          </div>
          
          <div className="mt-4 flex justify-between text-[9px] atlas-mono text-[var(--text-muted)] opacity-50">
            <span>24h ago</span>
            <span>Now</span>
          </div>
        </div>

        {/* Top Intelligence Callouts */}
        <div className="space-y-6">
           {/* Bottlenecks */}
           <div className="precision-panel overflow-hidden">
            <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-orange-400" />
                <span className="atlas-label">Top Bottlenecks</span>
              </div>
              <button onClick={() => navigate('/performance#performance-delay')} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">View all →</button>
            </div>
            <div className="p-2 divide-y divide-[var(--border)]/30">
              {bottlenecks.length > 0 ? bottlenecks.map((bn, i) => (
                <div key={i} className="px-4 py-3 hover:bg-[var(--item-bg)]/50 transition-colors rounded-lg group">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded bg-[var(--item-bg)] border border-[var(--border)] flex items-center justify-center text-[10px] font-black text-[var(--text-muted)] shrink-0">{i+1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-[var(--fg)] truncate">
                        <span className="text-indigo-400 atlas-mono mr-2">{bn.route_name}</span>
                        {bn.from_stop_name}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                          <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (bn.avg_delay_delta / 120) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] atlas-mono font-bold text-red-400">+{Math.round(bn.avg_delay_delta)}s</span>
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-[11px] text-[var(--text-muted)]">No active bottlenecks</div>
              )}
            </div>
          </div>

          {/* Critical Gaps */}
          <div className="precision-panel overflow-hidden">
            <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                <span className="atlas-label">Worst Gaps</span>
              </div>
              <button onClick={() => navigate('/pulse')} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors text-right">Open Pulse →</button>
            </div>
            <div className="p-2">
              {routes.filter(r => (r.worstGap ?? 0) > 20).slice(0, 5).map((r, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-[var(--item-bg)]/50 transition-colors rounded-lg group">
                   <div className="flex items-center gap-3">
                    <span className="w-8 atlas-mono text-xs font-black text-[var(--fg)]">{r.routeId}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-[var(--text-muted)]">{r.currentVehicles} vehicles</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-red-400 atlas-mono">{r.worstGap?.toFixed(1)}m <span className="text-[9px] text-[var(--text-muted)] font-normal">worst</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Module Links ───────────────────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <ModuleCard
          title="Performance"
          subtitle="OTP, bottlenecks, ghosts"
          icon={Gauge}
          onClick={() => navigate('/performance')}
        />
        <ModuleCard
          title="Pulse"
          subtitle="Route health heatmaps"
          icon={Activity}
          onClick={() => navigate('/pulse')}
        />
        <ModuleCard
          title="Live Map"
          subtitle="Vehicle positions"
          icon={Eye}
          onClick={() => navigate('/map')}
        />
        <ModuleCard
          title="Analyze"
          subtitle="Frequency screening"
          icon={Target}
          onClick={() => navigate('/analyze')}
        />
      </motion.div>
    </div>
  );
};

function KpiCard({ label, value, subtitle, icon: Icon, color, trend }: {
  label: string;
  value: string;
  subtitle: string;
  icon: any;
  color: 'indigo' | 'emerald' | 'yellow' | 'orange' | 'red';
  trend?: number[];
}) {
  const colorMap = {
    indigo: 'text-indigo-400 border-indigo-500/50 bg-indigo-500/5',
    emerald: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/5',
    yellow: 'text-yellow-400 border-yellow-500/50 bg-yellow-500/5',
    orange: 'text-orange-400 border-orange-500/50 bg-orange-500/5',
    red: 'text-red-400 border-red-500/50 bg-red-500/5',
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } }}
      className="precision-panel p-5 relative overflow-hidden group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${colorMap[color].split(' ')[0]}`} />
          <span className="text-[10px] font-bold tracking-wider text-[var(--text-muted)]">{label}</span>
        </div>
        {trend && trend.length > 0 && (
          <div className="opacity-50 group-hover:opacity-100 transition-opacity">
            <TrendSparkline data={trend} color={color === 'emerald' ? '#10b981' : color === 'red' ? '#ef4444' : '#6366f1'} width={40} height={16} />
          </div>
        )}
      </div>
      <div className="text-2xl font-black text-[var(--fg)] atlas-mono leading-none">
        {value}
      </div>
      <div className="mt-2 text-[10px] text-[var(--text-muted)] font-medium">
        {subtitle}
      </div>
      {/* Subtle background glow */}
      <div className={`absolute -right-4 -bottom-4 w-16 h-16 rounded-full blur-2xl opacity-10 ${colorMap[color].split(' ')[0].replace('text-', 'bg-')}`} />
    </motion.div>
  );
}

function ModuleCard({ title, subtitle, icon: Icon, onClick }: {
  title: string;
  subtitle: string;
  icon: any;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="precision-panel p-5 flex items-center gap-4 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-[var(--item-bg)] border border-[var(--border)] flex items-center justify-center group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 transition-all shrink-0">
        <Icon className="w-5 h-5 text-[var(--text-muted)] group-hover:text-indigo-400 transition-all" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-[var(--fg)] group-hover:text-indigo-300 transition-all">{title}</div>
        <div className="text-[10px] text-[var(--text-muted)] truncate">{subtitle}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all ml-auto shrink-0" />
    </button>
  );
}
