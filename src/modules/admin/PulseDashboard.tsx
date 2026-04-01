import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ShieldCheck, AlertCircle, CheckCircle2, Clock, Globe, Navigation, Search, Share } from 'lucide-react';
import { useAuthStore } from '../../hooks/useAuthStore';


interface IngestionLog {
    agency_id: string;
    polled_at: string;
    success: boolean;
    vehicle_count: number | null;
    error_msg: string | null;
    notion_sync_at: string | null;
    notion_sync_status: string | null;
}


interface MatchingStats {
    agency_id: string;
    total_obs: string;
    matched_obs: string;
    avg_confidence: string;
    direct_matches: string;
    spatial_matches: string;
    unmatched: string;
    healthScore: number;
}

interface HealthTrend {
    hour: string;
    agency_id: string;
    avg_vehicles: string;
    success_rate: string;
}

interface GhostBusStats {
    agencyId: string;
    routeId: string;
    totalScheduledTrips: number;
    totalObservedTrips: number;
    ghostCount: number;
    ghostRate: number;
}

interface CorridorPerformance {
    linkId: string;
    agencyId: string;
    observedTripCount: number;
    avgDelaySeconds: number;
    reliabilityScore: number;
    bunchingCount: number;
    earlyCount: number;
    onTimeCount: number;
    lateCount: number;
}

const TrendSparkline: React.FC<{ data: number[], color: string }> = ({ data, color }) => {
    if (data.length < 2) return <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />;
    const max = Math.max(...data) || 1;
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(' ');
    
    return (
        <svg viewBox="0 0 100 100" className="w-12 h-6 overflow-visible" preserveAspectRatio="none">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                className="opacity-50"
            />
        </svg>
    );
};

export default function PulseDashboard() {
    const [ingestionLogs, setIngestionLogs] = useState<IngestionLog[]>([]);
    const [matchingStats, setMatchingStats] = useState<MatchingStats[]>([]);
    const [trends, setTrends] = useState<HealthTrend[]>([]);
    const [ghostStats, setGhostStats] = useState<Record<string, GhostBusStats[]>>({});
    const [corridorPerformance, setCorridorPerformance] = useState<Record<string, CorridorPerformance[]>>({});
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const user = useAuthStore(state => state.user);

    const fetchData = async () => {
        try {
            const authHeaders: Record<string, string> = {};
            if (user) {
                const idToken = await user.getIdToken();
                authHeaders['Authorization'] = `Bearer ${idToken}`;
            }
            const [ingRes, matchRes, trendRes] = await Promise.all([
                fetch('/api/ingestion?limit=50', { headers: authHeaders }),
                fetch('/api/intelligence/matching-stats', { headers: authHeaders }),
                fetch('/api/intelligence/trends', { headers: authHeaders })
            ]);
            const ingData = await ingRes.json();
            const matchData = await matchRes.json();
            const trendData = await trendRes.json();
            
            setIngestionLogs(ingData);
            setMatchingStats(matchData.stats || []);
            setTrends(trendData.trends || []);

            // Fetch specific intel for each agency found
            const agencies = matchData.stats.map((s: any) => s.agency_id);
            for (const agency of agencies) {
                try {
                    const [ghostRes, perfRes] = await Promise.all([
                        fetch(`/api/intelligence/ghosts?agency=${agency}`, { headers: authHeaders }),
                        fetch(`/api/corridors/performance?agency=${agency}`, { headers: authHeaders })
                    ]);
                    const ghostData = await ghostRes.json();
                    const perfData = await perfRes.json();
                    
                    setGhostStats(prev => ({ ...prev, [agency]: ghostData.routes || [] }));
                    setCorridorPerformance(prev => ({ ...prev, [agency]: perfData.corridors || [] }));
                } catch (e) {
                    console.warn(`Intel fetch failed for ${agency}:`, e);
                }
            }

            setLastRefresh(new Date());
            setLoading(false);
        } catch (err) {
            console.error('Pulse fetch failed:', err);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    // Derived stats
    const totalVehicles = matchingStats.reduce((acc, s) => acc + parseInt(s.total_obs), 0);
    const avgConfidence = matchingStats.length > 0 
        ? matchingStats.reduce((acc, s) => acc + parseFloat(s.avg_confidence), 0) / matchingStats.length 
        : 0;

    const exportToCSV = (data: any[], filename: string) => {
        if (data.length === 0) return;
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(obj => 
            Object.values(obj).map(val => 
                typeof val === 'string' && val.includes(',') ? `"${val}"` : val
            ).join(',')
        );
        const csvContent = [headers, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    return (
        <div className="space-y-8">
            {/* Top Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="precision-panel p-6 bg-emerald-500/5 border-emerald-500/20">
                    <div className="flex items-center gap-3 mb-2 text-emerald-500">
                        <Globe className="w-4 h-4" />
                        <span className="atlas-label text-[10px]">ACTIVE AGENCIES</span>
                    </div>
                    <div className="text-3xl font-black text-[var(--fg)]">{matchingStats.length}</div>
                </div>
                <div className="precision-panel p-6 bg-indigo-500/5 border-indigo-500/20">
                    <div className="flex items-center gap-3 mb-2 text-indigo-500">
                        <Navigation className="w-4 h-4" />
                        <span className="atlas-label text-[10px]">TOTAL VEHICLES [5M]</span>
                    </div>
                    <div className="text-3xl font-black text-[var(--fg)]">{totalVehicles.toLocaleString()}</div>
                </div>
                <div className="precision-panel p-6 bg-amber-500/5 border-amber-500/20">
                    <div className="flex items-center gap-3 mb-2 text-amber-500">
                        <Search className="w-4 h-4" />
                        <span className="atlas-label text-[10px]">AVG MATCH CONFIDENCE</span>
                    </div>
                    <div className="text-3xl font-black text-[var(--fg)]">{Math.round(avgConfidence * 100)}%</div>
                </div>
                <div className="precision-panel p-6 bg-[var(--item-bg)]/50 border-[var(--border)]">
                    <div className="flex items-center gap-3 mb-2 text-[var(--text-muted)]">
                        <Clock className="w-4 h-4" />
                        <span className="atlas-label text-[10px]">LAST REFRESH</span>
                    </div>
                    <div className="text-3xl font-black text-[var(--fg)] font-mono text-lg mt-1">
                        {lastRefresh.toLocaleTimeString([], { hour12: false })}
                    </div>
                </div>
            </div>

            {/* Ingestion Matrix */}
            <div className="precision-panel overflow-hidden">
                <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-3">
                        <Activity className="w-5 h-5 text-emerald-500" />
                        Agency Health Matrix
                    </h2>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => exportToCSV(matchingStats, 'atlas_matching_stats')}
                            className="btn-secondary flex items-center gap-2 text-[10px] font-bold py-2 px-4"
                            disabled={loading || matchingStats.length === 0}
                        >
                            <Share className="w-3.5 h-3.5" /> Export CSV
                        </button>
                        <div className="flex items-center gap-1.5 border-l border-[var(--border)] pl-4">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] atlas-label font-black opacity-50 uppercase tracking-widest">Live Flow</span>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[var(--item-bg)]/30">
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Agency</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Last Poll</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest text-indigo-400">Feed Health</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Vehicles</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Trend (24h)</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Match</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest text-[#f59e0b]">Bunch</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest text-[#10b981]">OTP</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest text-[#ef4444]">Ghost</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest">Notion</th>
                                <th className="px-6 py-4 atlas-label text-[10px] opacity-50 uppercase tracking-widest text-right">Ver</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {matchingStats.map(stat => {
                                const lastLog = ingestionLogs.find(l => l.agency_id === stat.agency_id);
                                const isHealthy = lastLog?.success ?? true;
                                const lastSeen = lastLog ? new Date(lastLog.polled_at) : null;
                                
                                return (
                                    <tr key={stat.agency_id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-[var(--fg)]">{stat.agency_id.toUpperCase()}</div>
                                            <div className="text-[10px] text-[var(--text-muted)] font-bold">{stat.agency_id === 'mtabus' ? 'MTA NYC BUS' : 'ACTIVE FEED'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {isHealthy ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                                )}
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isHealthy ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {isHealthy ? 'Healthy' : 'Degraded'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[10px] font-bold text-[var(--fg)] font-mono">
                                                {lastSeen ? lastSeen.toLocaleTimeString([], { hour12: false }) : 'Waiting...'}
                                            </div>
                                            <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">UTC SYNC</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-sm font-black ${
                                                    stat.healthScore >= 90 ? 'text-emerald-500' :
                                                    stat.healthScore >= 70 ? 'text-amber-500' : 'text-red-500'
                                                }`}>
                                                    {stat.healthScore}%
                                                </span>
                                                <div className="flex-1 max-w-[40px] h-1 bg-[var(--item-bg)]/50 rounded-full overflow-hidden border border-white/5">
                                                    <div 
                                                        className={`h-full transition-all duration-1000 ${
                                                            stat.healthScore >= 90 ? 'bg-emerald-500' :
                                                            stat.healthScore >= 70 ? 'bg-amber-500' : 'bg-red-500'
                                                        }`}
                                                        style={{ width: `${stat.healthScore}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-tighter mt-0.5">COMPOSITE</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-black text-[var(--fg)]">{parseInt(stat.total_obs).toLocaleString()}</div>
                                            <div className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">PINGS / 5M</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <TrendSparkline 
                                                data={trends.filter(t => t.agency_id === stat.agency_id).map(t => parseFloat(t.avg_vehicles))} 
                                                color={isHealthy ? '#10b981' : '#f43f5e'} 
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1 max-w-[100px] h-1.5 bg-[var(--item-bg)] rounded-full overflow-hidden border border-[var(--border)]">
                                                    <div 
                                                        className="h-full bg-indigo-500 transition-all duration-1000" 
                                                        style={{ width: `${parseFloat(stat.avg_confidence) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-black font-mono text-indigo-400">
                                                    {Math.round(parseFloat(stat.avg_confidence) * 100)}%
                                                </span>
                                            </div>
                                            <div className="text-[9px] text-[var(--text-muted)] font-bold mt-1">
                                                {stat.direct_matches} Direct | {stat.spatial_matches} Spatial
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const agencyPerf = corridorPerformance[stat.agency_id] || [];
                                                const totalBunching = agencyPerf.reduce((acc, p) => acc + (p.bunchingCount || 0), 0);
                                                return (
                                                    <>
                                                        <div className={`text-sm font-black ${totalBunching > 0 ? 'text-amber-500' : 'text-[var(--fg)] opacity-50'}`}>
                                                            {totalBunching}
                                                        </div>
                                                        <div className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">EVENTS [60S]</div>
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const agencyPerf = corridorPerformance[stat.agency_id] || [];
                                                const total = agencyPerf.reduce((acc, p) => acc + (p.observedTripCount || 0), 0);
                                                const early = agencyPerf.reduce((acc, p) => acc + (p.earlyCount || 0), 0);
                                                const onTime = agencyPerf.reduce((acc, p) => acc + (p.onTimeCount || 0), 0);
                                                const late = agencyPerf.reduce((acc, p) => acc + (p.lateCount || 0), 0);
                                                
                                                if (total === 0) return <span className="opacity-30 text-xs">NO DATA</span>;
                                                
                                                const otRate = Math.round((onTime / total) * 100);
                                                
                                                return (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-emerald-500">{otRate}%</span>
                                                            <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-tighter">ON-TIME</span>
                                                        </div>
                                                        <div className="flex gap-2 text-[9px] font-mono">
                                                            <span className="text-amber-500/80">{early}E</span>
                                                            <span className="text-red-500/80">{late}L</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const agencyGhosts = ghostStats[stat.agency_id] || [];
                                                const totalGhosts = agencyGhosts.reduce((acc, g) => acc + (g.ghostCount || 0), 0);
                                                return (
                                                    <>
                                                        <div className={`text-sm font-black ${totalGhosts > 0 ? 'text-red-500' : 'text-[var(--fg)] opacity-50'}`}>
                                                            {totalGhosts}
                                                        </div>
                                                        <div className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-widest">MISSING TRIPS</div>
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    {lastLog?.notion_sync_at ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                                            <Share className="w-2.5 h-2.5 text-indigo-400" />
                                                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">Synced</span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-[9px] text-[var(--text-muted)] font-bold italic opacity-30">Pending</div>
                                                    )}
                                                </div>
                                                {lastLog?.notion_sync_status && (
                                                    <div className="text-[9px] font-mono text-[var(--fg)] opacity-60 bg-white/5 p-1 rounded border border-white/5 leading-tight">
                                                        {lastLog.notion_sync_status}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20">
                                                <ShieldCheck className="w-3 h-3 text-indigo-500" />
                                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter italic">V0.13.0</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {loading && (
                    <div className="p-12 flex flex-col items-center justify-center gap-4 border-t border-[var(--border)]">
                        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <span className="text-[10px] atlas-label opacity-50 uppercase tracking-widest">Connecting to feeds...</span>
                    </div>
                )}
            </div>

            {/* Error Log Footer */}
            <div className="precision-panel p-6 bg-red-500/5 border-red-500/10">
                <h3 className="text-xs font-black text-red-500 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> Recent Service Shocks
                </h3>
                <div className="space-y-2">
                    {ingestionLogs.filter(l => !l.success).slice(0, 3).map((log, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] font-mono border-b border-red-500/10 pb-2 mb-2 last:border-0">
                            <span className="text-red-400 font-bold">[{log.agency_id.toUpperCase()}]</span>
                            <span className="text-[var(--text-muted)] truncate max-w-[400px]">{log.error_msg}</span>
                            <span className="text-red-300 opacity-50">{new Date(log.polled_at).toLocaleTimeString()}</span>
                        </div>
                    ))}
                    {ingestionLogs.filter(l => !l.success).length === 0 && (
                        <div className="text-[10px] text-[var(--text-muted)] italic">No critical errors in recent ingestion logs. Platform stability is high.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
