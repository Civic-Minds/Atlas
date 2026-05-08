import React, { useState, useEffect, useMemo } from 'react';
import { Zap, GitFork, ArrowRight, AlertTriangle, CheckCircle2, TrendingUp, BarChart3, Globe, Clock, ShieldCheck, PauseCircle, Map as MapIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchAgencies, screenRoutes, fetchSegmentBottlenecks, fetchStopDwells, auditServiceChange, AgencyMeta, ScreenRoute, SegmentBottleneck, StopDwell, AuditResult } from '../../../services/atlasApi';
import { useAuthStore } from '../../../hooks/useAuthStore';
import { useNotificationStore } from '../../../hooks/useNotification';
import StopArrivalTimeline from '../../intelligence/StopArrivalTimeline';

const TIER_THRESHOLDS = {
    freedom: 15,
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

export function StrategicAudit({ agency: selectedAgency }: { agency: string }) {
    const navigate = useNavigate();
    const { addToast } = useNotificationStore();
    const [selectedPeriod, setSelectedPeriod] = useState(SERVICE_PERIODS[2]); 
    const [routes, setRoutes] = useState<ScreenRoute[]>([]);
    const [bottlenecks, setBottlenecks] = useState<SegmentBottleneck[]>([]);
    const [dwells, setDwells] = useState<StopDwell[]>([]);
    const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
    const [auditing, setAuditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedAgency) return;
        setLoading(true);
        setAuditResult(null);
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
            addToast('Audit complete', 'success');
        } catch (err: any) {
            const msg = err.message ?? '';
            if (msg.includes('404')) {
                addToast('Audit requires 2 imported feeds.', 'warning');
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

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <p className="atlas-label">Calculating Strategic Metrics...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Run Audit Action */}
            <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                    {SERVICE_PERIODS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setSelectedPeriod(p)}
                            className={`px-4 py-2 rounded-xl border transition-all text-nowrap flex items-center gap-2 ${
                                selectedPeriod.id === p.id 
                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold' 
                                    : 'bg-[var(--item-bg)] border-transparent text-[var(--text-muted)] hover:border-[var(--border)]'
                            }`}
                        >
                            <p.icon className="w-3 h-3 opacity-60" />
                            <span className="text-[10px] font-bold">{p.label}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAudit}
                        disabled={auditing}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all disabled:opacity-50"
                    >
                        {auditing ? 'Processing...' : 'Run Service Change Audit'}
                    </button>
                </div>
            </div>

            {/* Service Change Audit Result */}
            {auditResult && auditSummary && (
                <div className="precision-panel border-l-4 border-indigo-500 bg-indigo-500/5 animate-in slide-in-from-top-4 duration-500">
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-[var(--item-bg)]/50 p-4 rounded-xl border border-[var(--border)]">
                                <div className="text-[10px] atlas-label opacity-50 mb-2">Before Change (Old Feed)</div>
                                <div className="text-2xl font-black atlas-mono">{auditSummary.beforeScore}%</div>
                                <div className="text-[9px] text-[var(--text-muted)]">Corridor Reliability</div>
                            </div>
                            <div className="bg-[var(--item-bg)]/50 p-4 rounded-xl border border-[var(--border)]">
                                <div className="text-[10px] atlas-label opacity-50 mb-2">After Change (New Feed)</div>
                                <div className="text-2xl font-black atlas-mono">{auditSummary.afterScore}%</div>
                                <div className={`text-[9px] font-bold ${auditSummary.delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {auditSummary.delta >= 0 ? '+' : ''}{auditSummary.delta} Service Delta
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="precision-panel p-6 border-l-4 border-indigo-500">
                    <div className="flex items-center gap-3 mb-4">
                        <Zap className="w-5 h-5 text-indigo-500" />
                        <span className="atlas-label">Frequent Service Density</span>
                    </div>
                    <div className="text-4xl font-black atlas-mono">{stats?.freedomPercent}%</div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">
                        {stats?.freedomCount} of {stats?.totalRoutes} routes meet &lt;15m headway.
                    </p>
                </div>

                <div className="precision-panel p-6 border-l-4 border-emerald-500">
                    <div className="flex items-center gap-3 mb-4">
                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                        <span className="atlas-label">Geometric Circuity</span>
                    </div>
                    <div className="text-4xl font-black atlas-mono">{stats?.avgCircuity}x</div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">
                        {stats?.zigZagCount} routes flagged as indirect (&gt;1.4x).
                    </p>
                </div>

                <div className="precision-panel p-6 border-l-4 border-amber-500">
                    <div className="flex items-center gap-3 mb-4">
                        <Clock className="w-5 h-5 text-amber-500" />
                        <span className="atlas-label">Coverage Drain</span>
                    </div>
                    <div className="text-4xl font-black atlas-mono text-amber-500">{stats?.coverageCount}</div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-2">
                        Social coverage routes vs. high-capacity trunks.
                    </p>
                </div>
            </div>

            {/* MRI Panel - Bottlenecks */}
            {bottlenecks.length > 0 && (
                <div className="precision-panel border-l-4 border-red-500 overflow-hidden">
                    <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            <span className="atlas-label text-red-500">Segment Bottlenecks (MRI)</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 divide-x divide-[var(--border)]">
                        {bottlenecks.map((b, idx) => (
                            <div key={idx} className="p-4 hover:bg-[var(--item-bg)]/30 transition-colors">
                                <div className="text-[10px] font-black text-red-500 atlas-mono mb-2">+{Math.round(b.avg_delay_delta)}s Delay</div>
                                <div className="text-[11px] font-bold truncate">{b.from_stop_name}</div>
                                <div className="text-[11px] font-bold truncate">→ {b.to_stop_name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MRI Panel - Dwells */}
            {dwells.length > 0 && (
                <div className="precision-panel border-l-4 border-indigo-500 overflow-hidden">
                    <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <PauseCircle className="w-5 h-5 text-indigo-500" />
                            <span className="atlas-label text-indigo-500">Boarding & Fare Dwell (MRI)</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 divide-x divide-[var(--border)]">
                        {dwells.map((d, idx) => (
                            <div key={idx} className="p-4 hover:bg-[var(--item-bg)]/30 transition-colors">
                                <div className="text-[10px] font-black text-indigo-500 atlas-mono mb-2">{Math.round(d.avg_dwell_seconds)}s Avg</div>
                                <div className="text-[11px] font-bold truncate">{d.stop_name}</div>
                                <div className="text-[9px] atlas-label opacity-40 mt-1">{d.obs_count} detections</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <StopArrivalTimeline agency={selectedAgency} />
        </div>
    );
}
