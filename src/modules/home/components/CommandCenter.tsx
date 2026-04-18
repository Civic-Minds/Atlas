import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, BarChart3, Building2, CheckCircle2,
  Database, Gauge, Globe,
  Satellite, Server, Target
} from 'lucide-react';
import { useAuthStore } from '../../../hooks/useAuthStore';
import { useViewAs } from '../../../hooks/useViewAs';
import {
  fetchAgencies, fetchMatchingStats, fetchTrends,
  type AgencyMeta, type MatchingStat, type TrendPoint,
} from '../../../services/atlasApi';

const MODULES = [
  {
    id: 'analyze',
    title: 'Analyze',
    description: 'Frequency tiers, headways, and route performance',
    icon: Target,
    path: '/analyze',
    accent: 'indigo',
  },
  {
    id: 'performance',
    title: 'Performance',
    description: 'Live OTP, bottlenecks, ghost bus detection',
    icon: Gauge,
    path: '/performance',
    accent: 'amber',
  },
  {
    id: 'pulse',
    title: 'Pulse',
    description: 'Route health heatmaps and gap analysis',
    icon: Activity,
    path: '/pulse',
    accent: 'emerald',
  },
  {
    id: 'monitor',
    title: 'Monitor',
    description: 'Strategic audit — circuity, frequency gaps, corridor coverage',
    icon: BarChart3,
    path: '/monitor',
    accent: 'blue',
  },
  {
    id: 'predict',
    title: 'Predict',
    description: 'Population density vs. service coverage gaps',
    icon: Database,
    path: '/predict',
    accent: 'purple',
  },
  {
    id: 'audit',
    title: 'Audit',
    description: 'Published frequency vs. actual GTFS verification',
    icon: CheckCircle2,
    path: '/audit',
    accent: 'rose',
  },
];

const ACCENT_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20',  dot: 'bg-indigo-500'  },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   dot: 'bg-amber-500'   },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
  purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20',  dot: 'bg-purple-500'  },
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    dot: 'bg-blue-500'    },
  rose:    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20',    dot: 'bg-rose-500'    },
};

export const CommandCenter: React.FC = () => {
  const navigate = useNavigate();
  const { role, user } = useAuthStore();
  const { setViewAsAgency } = useViewAs();
  const [agencies, setAgencies] = useState<AgencyMeta[]>([]);
  const [matchStats, setMatchStats] = useState<MatchingStat[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait until Firebase has resolved — user is null until then in DEV mode
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetchAgencies().catch(() => []),
      fetchMatchingStats().catch(() => ({ stats: [] })),
      fetchTrends().catch(() => ({ trends: [] })),
    ]).then(([ag, ms, tr]) => {
      setAgencies(ag as AgencyMeta[]);
      setMatchStats((ms as any).stats ?? []);
      setTrends((tr as any).trends ?? []);
    }).finally(() => setLoading(false));
  }, [user]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  // Derived system stats
  const totalAgencies = agencies.length;
  const agenciesWithData = agencies.filter(a => a.feed_version_id).length;
  const totalRoutes = agencies.reduce((s, a) => s + (a.route_count ?? 0), 0);
  const registeredSlugs = new Set(agencies.map(a => a.slug));
  const filteredMatchStats = matchStats.filter(m => registeredSlugs.has(m.agency_id));
  const totalObs = Math.round(filteredMatchStats.reduce((s, m) => s + m.total_obs, 0));
  const avgHealth = filteredMatchStats.length > 0
    ? Math.round(filteredMatchStats.reduce((s, m) => s + m.healthScore, 0) / filteredMatchStats.length)
    : null;
  const avgMatchRate = filteredMatchStats.length > 0
    ? Math.round(filteredMatchStats.reduce((s, m) => s + (m.matched_obs / Math.max(1, m.total_obs)) * 100, 0) / filteredMatchStats.length)
    : null;

  const handleViewAsAgency = (agency: AgencyMeta) => {
    setViewAsAgency(agency);
    navigate('/performance');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-muted)]">Loading Command Center...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-8 py-10 max-w-7xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <h1 className="text-3xl font-black tracking-tight text-[var(--fg)] mb-2">
            {greeting}
          </h1>
          <p className="text-base text-[var(--text-muted)] font-medium">
            System overview across <span className="text-indigo-400 font-bold">{totalAgencies}</span> registered {totalAgencies === 1 ? 'agency' : 'agencies'}
          </p>
        </motion.div>

        {/* System Health Strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8"
        >
          <SystemKpi
            icon={Building2}
            label="Agencies"
            value={String(totalAgencies)}
            sub={`${filteredMatchStats.length} with live RT`}
            color="indigo"
          />
          <SystemKpi
            icon={Database}
            label="Total Routes"
            value={totalRoutes > 0 ? totalRoutes.toLocaleString() : '—'}
            sub="across all feeds"
            color="blue"
          />
          <SystemKpi
            icon={Satellite}
            label="Observations"
            value={totalObs > 0 ? totalObs > 1000 ? `${(totalObs / 1000).toFixed(1)}k` : String(totalObs) : '—'}
            sub="last 5 min"
            color="purple"
          />
          <SystemKpi
            icon={Gauge}
            label="Avg Health"
            value={avgHealth !== null && avgHealth > 0 ? String(avgHealth) : '—'}
            sub={avgHealth !== null && avgHealth > 0 ? (avgHealth >= 80 ? 'Excellent' : avgHealth >= 60 ? 'Moderate' : 'Needs attention') : 'No RT data'}
            color={avgHealth !== null && avgHealth > 0 ? (avgHealth >= 80 ? 'emerald' : avgHealth >= 60 ? 'amber' : 'red') : 'muted'}
          />
          <SystemKpi
            icon={CheckCircle2}
            label="Match Rate"
            value={avgMatchRate !== null ? `${avgMatchRate}%` : '—'}
            sub="trip matching · 5 min"
            color={avgMatchRate !== null ? (avgMatchRate >= 80 ? 'emerald' : avgMatchRate >= 50 ? 'amber' : 'red') : 'muted'}
          />
          <SystemKpi
            icon={Activity}
            label="RT Agencies"
            value={filteredMatchStats.length > 0 ? String(filteredMatchStats.length) : '—'}
            sub={`of ${totalAgencies} reporting now`}
            color={filteredMatchStats.length > 0 ? 'emerald' : 'muted'}
          />
        </motion.div>

        {/* Main Content — Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Agency Registry */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-2 precision-panel overflow-hidden"
          >
            <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span className="atlas-label">Agency Registry</span>
              </div>
              <span className="text-[9px] atlas-mono text-[var(--text-muted)]">
                {totalAgencies} registered
              </span>
            </div>
            {agencies.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--text-muted)]">
                No agencies registered yet
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]/50 max-h-[380px] overflow-y-auto custom-scrollbar">
                {agencies.map((agency) => {
                  const stat = matchStats.find(m => m.agency_id === agency.slug);
                  return (
                    <button
                      key={agency.slug}
                      onClick={() => handleViewAsAgency(agency)}
                      className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--item-bg)] transition-colors text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--item-bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-indigo-500 group-hover:border-indigo-500/30 transition-all shrink-0">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[12px] font-bold text-[var(--fg)] truncate">
                            {agency.display_name}
                          </span>
                          {agency.region && (
                            <span className="text-[9px] text-[var(--text-muted)] atlas-mono shrink-0">
                              {agency.region}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[var(--text-muted)] atlas-mono">
                            {agency.slug}
                          </span>
                          {agency.route_count !== null && (
                            <span className="text-[9px] text-[var(--text-muted)]">
                              {agency.route_count} routes
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {stat ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              stat.healthScore >= 80 ? 'bg-emerald-500' :
                              stat.healthScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                            <span className={`text-[10px] font-bold atlas-mono ${
                              stat.healthScore >= 80 ? 'text-emerald-400' :
                              stat.healthScore >= 60 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                              {stat.healthScore}
                            </span>
                          </div>
                        ) : agency.feed_version_id ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                            <span className="text-[9px] text-[var(--text-muted)]">Static only</span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-[var(--text-muted)] italic">No feed</span>
                        )}
                        <ArrowRight className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Matching Stats Panel */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="precision-panel overflow-hidden"
          >
            <div className="bg-[var(--item-bg)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span className="atlas-label">RT Matching</span>
              </div>
              <span className="text-[9px] atlas-mono text-[var(--text-muted)]">
                {filteredMatchStats.length} active
              </span>
            </div>
            {matchStats.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--text-muted)]">
                No real-time data
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]/50 max-h-[380px] overflow-y-auto custom-scrollbar">
                {filteredMatchStats.map((stat) => {
                  const matchRate = Math.round((stat.matched_obs / Math.max(1, stat.total_obs)) * 100);
                  const agencyName = agencies.find(a => a.slug === stat.agency_id)?.display_name ?? stat.agency_id;
                  return (
                    <div key={stat.agency_id} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-bold text-[var(--fg)]">
                          {agencyName}
                        </span>
                        <span className={`text-[10px] font-bold atlas-mono ${
                          stat.healthScore >= 80 ? 'text-emerald-400' :
                          stat.healthScore >= 60 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {stat.healthScore}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              matchRate >= 80 ? 'bg-emerald-500' :
                              matchRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${matchRate}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-bold atlas-mono text-[var(--text-muted)] w-8 text-right">
                          {matchRate}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]">
                        <span>{stat.total_obs.toLocaleString()} obs</span>
                        <span>{stat.direct_matches} direct</span>
                        <span>{stat.spatial_matches} spatial</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Module Quick Access */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="atlas-label">Modules</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {MODULES.map((mod) => {
              const colors = ACCENT_MAP[mod.accent] ?? ACCENT_MAP.indigo;
              return (
                <button
                  key={mod.id}
                  onClick={() => navigate(mod.path)}
                  className="group precision-panel p-4 text-left hover:border-transparent transition-all relative overflow-hidden"
                >
                  <div className={`w-8 h-8 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.text} mb-3 group-hover:scale-110 transition-transform`}>
                    <mod.icon className="w-4 h-4" />
                  </div>
                  <div className="text-[12px] font-bold text-[var(--fg)] mb-1">{mod.title}</div>
                  <div className="text-[9px] text-[var(--text-muted)] leading-relaxed">{mod.description}</div>
                  <div className={`absolute top-0 right-0 w-0.5 h-full ${colors.dot} opacity-0 group-hover:opacity-100 transition-opacity`} />
                </button>
              );
            })}
          </div>
        </motion.div>

      </div>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

function SystemKpi({ icon: Icon, label, value, color, sub }: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  color: string;
  sub: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 border-emerald-500',
    amber:   'text-amber-400 border-amber-500',
    orange:  'text-orange-400 border-orange-500',
    red:     'text-red-400 border-red-500',
    indigo:  'text-indigo-400 border-indigo-500',
    blue:    'text-blue-400 border-blue-500',
    purple:  'text-purple-400 border-purple-500',
    muted:   'text-[var(--text-muted)] border-[var(--border)]',
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
