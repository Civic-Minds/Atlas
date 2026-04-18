import React, { useState, useEffect, useMemo } from 'react';
import { Zap, GitFork, ArrowRight, AlertTriangle, CheckCircle2, TrendingUp, BarChart3, Globe, Clock, ShieldCheck, PauseCircle, Map as MapIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ModuleHeader } from '../../components/ModuleHeader';
import { fetchAgencies, screenRoutes, fetchSegmentBottlenecks, fetchStopDwells, auditServiceChange, AgencyMeta, ScreenRoute, SegmentBottleneck, StopDwell, AuditResult } from '../../services/atlasApi';
import StopArrivalTimeline from './StopArrivalTimeline';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useNotificationStore } from '../../hooks/useNotification';
import './Intelligence.css';

const TIER_THRESHOLDS = {
    freedom: 15, // Jarrett Walker's "Turn Up and Go"
    high: 10,
    coverage: 30
};

const SERVICE_PERIODS = [
    { id: 'all-day', label: 'All Day', start: 300, end: 1440, icon: Globe },
    { id: 'am-peak', label: 'AM Peak', start: 360, end: 540, icon: TrendingUp },
    { id: 'mid-day', label: 'Mid-Day', start: 540, end: 900, icon: Clock },
    { id: 'pm-peak', label: 'PM Peak', start: 900, end: 1080, icon: Zap },
    { id: 'evening', label: 'Evening', start: 1080, end: 1320, icon: Clock },
];

export default function IntelligenceView() {
    const navigate = useNavigate();
    const { agencyId } = useAuthStore();
    const { addToast } = useNotificationStore();
    const [agencies, setAgencies] = useState<AgencyMeta[]>([]);
    const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState(SERVICE_PERIODS[2]); // Default to Mid-Day
    const [routes, setRoutes] = useState<ScreenRoute[]>([]);
    const [bottlenecks, setBottlenecks] = useState<SegmentBottleneck[]>([]);
    const [dwells, setDwells] = useState<StopDwell[]>([]);
    const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
    const [auditing, setAuditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAgencies().then(data => {
            setAgencies(data);
            if (agencyId) {
                const auto = data.find(a => a.slug === agencyId);
                if (auto) setSelectedAgency(auto.slug);
            } else if (data.length > 0) {
                setSelectedAgency(data[0].slug);
            }
        }).catch(err => setError(err.message));
    }, [agencyId]);

    useEffect(() => {
        if (!selectedAgency) return;
        setLoading(true);
        setAuditResult(null); // Clear previous audit when agency changes
        screenRoutes({
            agency: selectedAgency,
            maxHeadway: 60,
            windowStart: selectedPeriod.start,
            windowEnd: selectedPeriod.end,
            dayType: 'Weekday',
            directions: 'one'
        }).then(res => {
            setRoutes(res.routes);
        }).catch(err => setError(err.message));

        fetchSegmentBottlenecks(selectedAgency, 5)
            .then(res => setBottlenecks(res.bottlenecks))
            .catch(err => console.warn('Bottlenecks unavailable', err));

        fetchStopDwells(selectedAgency, 5)
            .then(res => setDwells(res.dwells))
            .catch(err => console.warn('Dwells unavailable', err))
            .finally(() => setLoading(false));
    }, [selectedAgency, selectedPeriod]);

    const handleAudit = async () => {
        if (!selectedAgency) return;
        setAuditing(true);
        try {
            const res = await auditServiceChange(selectedAgency);
            setAuditResult(res);
        } catch (err: any) {
            const msg = err.message ?? '';
            if (msg.includes('404') || msg.toLowerCase().includes('feed versions')) {
                addToast('Before/After Audit requires at least 2 imported feed versions for this agency.', 'warning');
            } else {
                addToast(`Audit failed: ${msg}`, 'error');
            }
        } finally {
            setAuditing(false);
        }
    };

    const stats = useMemo(() => {
        if (routes.length === 0) return null;
        
        const freedomRoutes = routes.filter(r => parseFloat(r.avg_headway) <= TIER_THRESHOLDS.freedom);
        const coverageRoutes = routes.filter(r => parseFloat(r.avg_headway) > TIER_THRESHOLDS.freedom);
        const zigZagRoutes = routes.filter(r => (r.circuity_index || 1) > 1.4);
        const avgCircuity = routes.reduce((acc, r) => acc + (r.circuity_index || 1), 0) / routes.length;

        return {
            freedomCount: freedomRoutes.length,
            coverageCount: coverageRoutes.length,
            freedomPercent: Math.round((freedomRoutes.length / routes.length) * 100),
            zigZagCount: zigZagRoutes.length,
            avgCircuity: Math.round(avgCircuity * 100) / 100,
            totalRoutes: routes.length
        };
    }, [routes]);

    const auditSummary = useMemo(() => {
        if (!auditResult) return null;
        const avgA = auditResult.before.results.reduce((acc, c) => acc + c.reliability_score, 0) / auditResult.before.results.length || 0;
        const avgB = auditResult.after.results.reduce((acc, c) => acc + c.reliability_score, 0) / auditResult.after.results.length || 0;
        const delta = avgB - avgA;
        return {
            beforeScore: Math.round(avgA),
            afterScore: Math.round(avgB),
            delta: Math.round(delta * 10) / 10,
            pivotDate: new Date(auditResult.pivotDate).toLocaleDateString()
        };
    }, [auditResult]);


    return (
        <div className="module-container">
            <ModuleHeader 
                badge={{ label: 'Strategic Audit' }}
                actions={[
                    {
                        label: auditing ? "Auditing..." : "Before/After Audit",
                        icon: Clock,
                        onClick: handleAudit,
                        variant: auditing ? 'secondary' : 'primary'
                    },
                    {
                        label: "Download Report",
                        icon: ShieldCheck,
                        onClick: () => window.print(),
                        variant: 'secondary'
                    }
                ]}
            />

            {/* Service Change Audit Result */}
            {auditResult && auditSummary && (
                <div className="precision-panel mb-8 border-l-4 border-indigo-500 bg-indigo-500/5 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">Service Change Performance Audit</h3>
                                <div className="text-[10px] text-[var(--text-muted)] font-medium">Pivot Date: {auditSummary.pivotDate} (30-day window comparison)</div>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${auditSummary.delta >= 0 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'}`}>
                                {auditSummary.delta >= 0 ? '+' : ''}{auditSummary.delta} Reliability Delta
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-[var(--item-bg)]/50 p-4 rounded-xl border border-[var(--border)]">
                                <div className="text-[10px] atlas-label opacity-50 mb-2">Before Change (Old Feed)</div>
                                <div className="text-2xl font-black atlas-mono">{auditSummary.beforeScore}%</div>
                                <div className="text-[9px] text-[var(--text-muted)]">{auditResult.before.results.length} corridors analyzed</div>
                            </div>
                            <div className="bg-[var(--item-bg)]/50 p-4 rounded-xl border border-[var(--border)]">
                                <div className="text-[10px] atlas-label opacity-50 mb-2">After Change (New Feed)</div>
                                <div className="text-2xl font-black atlas-mono">{auditSummary.afterScore}%</div>
                                <div className="text-[9px] text-[var(--text-muted)]">{auditResult.after.results.length} corridors analyzed</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Horizontal Agency Filter Bar */}
            <div className="flex items-center gap-4 mb-8 bg-[var(--item-bg)] p-2 rounded-2xl border border-[var(--border)] overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-2 px-4 border-r border-[var(--border)] mr-2 shrink-0">
                    <Globe className="w-4 h-4 text-indigo-500" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)]">Agency Fleet</span>
                </div>
                <div className="flex items-center gap-2">
                    {agencies.map(a => (
                        <button
                            key={a.slug}
                            onClick={() => setSelectedAgency(a.slug)}
                            className={`px-4 py-2 rounded-xl border transition-all text-nowrap flex items-center gap-2 ${
                                selectedAgency === a.slug 
                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold' 
                                    : 'bg-[var(--bg)] border-transparent text-[var(--text-muted)] hover:border-[var(--border)]'
                            }`}
                        >
                            <span className="text-[10px] font-bold">{a.display_name}</span>
                        </button>
                    ))}
                </div>
                
                <div className="w-px h-6 bg-[var(--border)] mx-2 shrink-0" />

                <div className="flex items-center gap-2 pr-4">
                    {SERVICE_PERIODS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setSelectedPeriod(p)}
                            className={`px-4 py-2 rounded-xl border transition-all text-nowrap flex items-center gap-2 ${
                                selectedPeriod.id === p.id 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold' 
                                    : 'bg-[var(--bg)] border-transparent text-[var(--text-muted)] hover:border-[var(--border)]'
                            }`}
                        >
                            <p.icon className="w-3 h-3 opacity-60" />
                            <span className="text-[10px] font-bold">{p.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="atlas-label">Auditing Network Intelligence...</p>
                </div>
            ) : (
                <>
            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="precision-panel p-6 border-l-4 border-indigo-500">
                    <div className="flex items-center gap-3 mb-4">
                        <Zap className="w-5 h-5 text-indigo-500" />
                        <span className="atlas-label">Frequent Service Density</span>
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                        <span className="text-4xl font-black atlas-mono">{stats?.freedomPercent}%</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">
                        {stats?.freedomCount} of {stats?.totalRoutes} routes meet the "High-Frequency" service standard (&lt;15m).
                    </p>
                </div>

                <div className="precision-panel p-6 border-l-4 border-emerald-500">
                    <div className="flex items-center gap-3 mb-4">
                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                        <span className="atlas-label">Geometric Circuity</span>
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                        <span className="text-4xl font-black atlas-mono">{stats?.avgCircuity}x</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">
                        Geometric inefficiency average. {stats?.zigZagCount} routes are flagged as "Zig-Zags" (&gt;1.4x).
                    </p>
                </div>

                <div className="precision-panel p-6 border-l-4 border-amber-500">
                    <div className="flex items-center gap-3 mb-4">
                        <Clock className="w-5 h-5 text-amber-500" />
                        <span className="atlas-label">Coverage Drain</span>
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                        <span className="text-4xl font-black atlas-mono">{stats?.coverageCount}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium leading-relaxed">
                        Routes providing purely social coverage (low frequency) rather than high-capacity demand.
                    </p>
                </div>
            </div>

            {/* Congestion & Bottleneck Analysis (The "MRI") */}
            {bottlenecks.length > 0 && (
                <div className="precision-panel mb-8 border-l-4 border-red-500 overflow-hidden">
                    <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            <span className="atlas-label">Congestion & Bottleneck Analysis (MRI)</span>
                        </div>
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded text-[9px] font-black border border-red-500/20">Critical Friction</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-0 divide-x divide-[var(--border)] bg-[var(--bg)]">
                        {bottlenecks.map((b, idx) => (
                            <div key={idx} className="p-4 hover:bg-[var(--item-bg)]/30 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-red-600/10 text-red-600 atlas-mono font-bold text-[10px] px-1.5 py-0.5 rounded border border-red-500/20">{b.route_name}</span>
                                    <span className="text-[10px] font-black text-red-500 atlas-mono">+{Math.round(b.avg_delay_delta)}s Delay</span>
                                </div>
                                <div className="text-[11px] font-bold text-[var(--fg)] mb-1 truncate">{b.from_stop_name}</div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-0.5 h-3 bg-red-500/30 ml-1"></div>
                                    <ArrowRight className="w-3 h-3 text-[var(--text-muted)] opacity-30" />
                                </div>
                                <div className="text-[11px] font-bold text-[var(--fg)] truncate">{b.to_stop_name}</div>
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="text-[8px] atlas-label opacity-50">{b.obs_count} detections</span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)]">{Math.round(b.total_delay_added / 60)}m Total Loss</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Curb-Side Friction (Boarding & Fare Dwell MRI) */}
            {dwells.length > 0 && (
                <div className="precision-panel mb-8 border-l-4 border-indigo-500 overflow-hidden">
                    <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <PauseCircle className="w-5 h-5 text-indigo-500" />
                            <span className="atlas-label">Curb-Side Friction (Boarding & Fare Dwell)</span>
                        </div>
                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 rounded text-[9px] font-black border border-indigo-500/20">Operational Drag</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-0 divide-x divide-[var(--border)] bg-[var(--bg)]">
                        {dwells.map((d, idx) => (
                            <div key={idx} className="p-4 hover:bg-[var(--item-bg)]/30 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-indigo-600/10 text-indigo-600 atlas-mono font-bold text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/20">{d.route_name}</span>
                                    <span className="text-[10px] font-black text-indigo-500 atlas-mono">{Math.round(d.avg_dwell_seconds)}s Avg</span>
                                </div>
                                <div className="text-[11px] font-bold text-[var(--fg)] mb-1 truncate">{d.stop_name}</div>
                                <div className="mt-1 flex flex-col gap-0.5">
                                    <div className="text-[9px] text-[var(--text-muted)] font-medium">Boarding Friction</div>
                                    <div className="w-full h-1 bg-[var(--border)] rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min((d.avg_dwell_seconds / 120) * 100, 100)}%` }}></div>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="text-[8px] atlas-label opacity-50">{d.obs_count} stops detected</span>
                                    <span className="text-[9px] font-black text-[var(--text-muted)]">Max {Math.round(d.max_dwell_seconds / 60)}m</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Live Stop Performance */}
            {selectedAgency && (
                <div className="mb-8">
                    <StopArrivalTimeline agency={selectedAgency} />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* JW Optimization Proposals */}
                <div className="precision-panel overflow-hidden">
                        <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-indigo-500" />
                                <span className="atlas-label">Geometric Optimization Proposals</span>
                            </div>
                            {routes.filter(r => (r.circuity_index || 1) > 1.4).length > 0 && (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded text-[9px] font-black border border-amber-500/20">Action Required</span>
                            )}
                        </div>
                        <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
                            {routes
                                .filter(r => (r.circuity_index || 1) > 1.4)
                                .sort((a, b) => (b.circuity_index || 1) - (a.circuity_index || 1))
                                .map(r => (
                                    <div key={r.gtfs_route_id} className="p-4 hover:bg-[var(--item-bg)]/50 transition-colors">
                                        <div className="flex items-center justify-between gap-4 mb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-xs px-2 py-1 rounded border border-indigo-500/20">{r.route_short_name}</span>
                                                <div>
                                                    <div className="text-xs font-bold text-[var(--fg)]">Straighten Corridor</div>
                                                    <div className="text-[10px] text-[var(--text-muted)]">{r.route_long_name || `Route ${r.route_short_name}`}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-black text-red-500 atlas-mono">{r.circuity_index}x Circuity</div>
                                                <div className="text-[8px] atlas-label opacity-50">Zig-Zag Risk</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between bg-[var(--bg)]/80 p-3 rounded-lg border border-[var(--border)]">
                                            <div className="flex items-center gap-3">
                                                <GitFork className="w-4 h-4 text-emerald-500" />
                                                <div className="text-[9px] font-medium text-[var(--text-muted)]">
                                                    Design Proposal: Convert indirect loops to linear trunk line.
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => navigate(`/map?agency=${selectedAgency}&route=${r.gtfs_route_id}`)}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500 text-white rounded text-[9px] font-bold hover:bg-indigo-600 transition-all"
                                            >
                                                Inspect <MapIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                </div>

                {/* High-Frequency Network Auditor */}
                <div className="precision-panel overflow-hidden">
                    <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-emerald-500" />
                            <span className="atlas-label">High-Frequency Corridors</span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] font-black border border-emerald-500/20">System Backbone</span>
                    </div>
                    <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
                        {routes
                            .filter(r => parseFloat(r.avg_headway) <= 20)
                            .sort((a,b) => parseFloat(a.avg_headway) - parseFloat(b.avg_headway))
                            .map(r => (
                                <div key={r.gtfs_route_id} className="p-4 flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-[var(--item-bg)] flex items-center justify-center border border-[var(--border)]">
                                            {parseFloat(r.avg_headway) <= 15 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black atlas-mono text-[var(--fg)]">{r.route_short_name}</span>
                                                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{r.avg_headway}m headway</span>
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)] font-medium">
                                                Active from {Math.floor(r.service_span_start/60)}am - {Math.floor(r.service_span_end/60)}pm
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="w-24 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full ${parseFloat(r.reliability_score || '0') > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                        style={{ width: `${r.reliability_score || 0}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-[8px] font-bold atlas-mono text-[var(--text-muted)]">{Math.round(parseFloat(r.reliability_score || '0'))}% Reliability</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${parseFloat(r.avg_headway) <= 15 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-600'}`}>
                                            {parseFloat(r.avg_headway) <= 15 ? 'FREQUENT' : 'COVERAGE'}
                                        </span>
                                        <button 
                                            onClick={() => navigate(`/map?agency=${selectedAgency}&route=${r.gtfs_route_id}`)}
                                            className="p-1.5 rounded-lg bg-[var(--item-bg)] border border-[var(--border)] text-[var(--text-muted)] hover:text-indigo-500 hover:border-indigo-500/30 transition-all"
                                        >
                                            <MapIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <div className="text-[8px] atlas-mono opacity-50">{r.trip_count} trips daily</div>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
            </>
            )}
        </div>
    );
}
