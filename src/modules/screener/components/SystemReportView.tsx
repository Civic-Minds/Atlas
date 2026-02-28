import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    FileText,
    Printer,
    ArrowLeft,
    TrendingUp,
    AlertCircle,
    CheckCircle2,
    Clock,
    BarChart3,
    Activity,
    Map,
    Bus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTransitStore } from '../../../types/store';
import { AnalysisResult } from '../../../types/gtfs';
import './SystemReport.css';

const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
    <div className="bg-[var(--item-bg)] border border-[var(--border)] p-6 rounded-2xl shadow-sm">
        <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-xl bg-${color}-500/10 text-${color}-600 dark:text-${color}-400`}>
                <Icon className="w-6 h-6" />
            </div>
            <div className="text-right">
                <div className="text-2xl font-black atlas-mono tracking-tight text-[var(--fg)]">{value}</div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">{title}</div>
            </div>
        </div>
        <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
            {subtext}
        </p>
    </div>
);

export default function SystemReportView() {
    const { analysisResults, gtfsData, validationReport } = useTransitStore();

    const stats = useMemo(() => {
        if (!analysisResults.length) return null;

        const weekdayResults = analysisResults.filter((r: AnalysisResult) => r.day === 'Weekday');
        const highFreq = weekdayResults.filter((r: AnalysisResult) => ['5', '8', '10', '15'].includes(r.tier));
        const avgReliability = weekdayResults.reduce((acc: number, r: AnalysisResult) => acc + r.reliabilityScore, 0) / weekdayResults.length;
        const totalTrips = weekdayResults.reduce((acc: number, r: AnalysisResult) => acc + r.tripCount, 0);

        // Mode breakdown
        const modes: Record<string, { count: number, highFreq: number }> = {};
        weekdayResults.forEach((r: AnalysisResult) => {
            const mode = r.modeName || 'Transit';
            if (!modes[mode]) modes[mode] = { count: 0, highFreq: 0 };
            modes[mode].count++;
            if (['5', '8', '10', '15'].includes(r.tier)) modes[mode].highFreq++;
        });

        return {
            totalRoutes: weekdayResults.length,
            highFreqCount: highFreq.length,
            highFreqPct: (highFreq.length / weekdayResults.length) * 100,
            avgReliability,
            totalTrips,
            modes: Object.entries(modes).map(([name, data]) => ({
                name,
                ...data,
                pct: (data.highFreq / data.count) * 100
            }))
        };
    }, [analysisResults]);

    const benchmarks = {
        nationalAvg: { freq: 12.5, reliability: 78 },
        topTier: { freq: 45.3, reliability: 92 },
        peerAgencies: [
            { name: 'MTA Subway', freq: 88, reliability: 82 },
            { name: 'WMATA Metro', freq: 72, reliability: 85 },
            { name: 'LA Metro', freq: 35, reliability: 74 }
        ]
    };

    if (!stats || !gtfsData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
                <FileText className="w-16 h-16 text-[var(--text-muted)] mb-4 opacity-20" />
                <h1 className="text-2xl font-bold text-[var(--fg)] mb-2">No Analysis Data Found</h1>
                <p className="text-[var(--text-muted)] mb-8">Please upload and analyze a GTFS feed in the Screener first.</p>
                <Link to="/screener" className="atlas-button-primary">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Screener
                </Link>
            </div>
        );
    }

    const printReport = () => window.print();

    return (
        <div className="report-page bg-[var(--bg)] min-h-screen text-[var(--fg)] pb-20">
            {/* Control Bar (Hidden on Print) */}
            <div className="print:hidden sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
                <Link to="/screener" className="flex items-center gap-2 text-sm font-bold text-[var(--text-muted)] hover:text-indigo-500 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Analysis
                </Link>
                <div className="flex items-center gap-3">
                    <button
                        onClick={printReport}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95"
                    >
                        <Printer className="w-4 h-4" /> Print Document
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div className="max-w-4xl mx-auto mt-12 px-6 print:mt-0">
                <header className="mb-12 border-b-4 border-indigo-600 pb-8">
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">Transit Intelligence Official Report</div>
                                    <h1 className="text-4xl font-black tracking-tighter">System Reliability & Frequency Audit</h1>
                                </div>
                            </div>
                            <p className="text-[var(--text-muted)] font-medium max-w-xl">
                                Detailed analysis of system-wide headway performance, tiered by mode-specific thresholds. Generated on {new Date().toLocaleDateString()} for board-level review.
                            </p>
                        </div>
                        <div className="text-right print:hidden">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Validation Health</div>
                            <div className={`flex items-center gap-1.5 justify-end font-bold text-sm ${validationReport?.errors === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {validationReport?.errors === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                {validationReport?.errors === 0 ? 'Spec Compliant' : `${validationReport?.errors} Errors Detected`}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Stat Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    <StatCard
                        title="Freq Coverage"
                        value={`${stats.highFreqPct.toFixed(1)}%`}
                        subtext="Percentage of routes meeting 15-min or better frequency."
                        icon={TrendingUp}
                        color="indigo"
                    />
                    <StatCard
                        title="Avg Reliability"
                        value={`${stats.avgReliability.toFixed(0)}%`}
                        subtext="System-wide adherence to scheduled headways."
                        icon={Activity}
                        color="emerald"
                    />
                    <StatCard
                        title="Service Volume"
                        value={stats.totalTrips.toLocaleString()}
                        subtext="Total unique trips processed across analyzed window."
                        icon={Bus}
                        color="blue"
                    />
                    <StatCard
                        title="Routes Audit"
                        value={stats.totalRoutes}
                        subtext="Unique routes evaluated in this baseline report."
                        icon={Map}
                        color="amber"
                    />
                </div>

                {/* Mode Breakdown */}
                <section className="mb-12 bg-[var(--item-bg)] border border-[var(--border)] rounded-3xl overflow-hidden p-8">
                    <h2 className="text-xl font-black mb-6 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-500" />
                        Mode Performance Breakdown
                    </h2>
                    <div className="space-y-8">
                        {stats.modes.map((mode) => (
                            <div key={mode.name}>
                                <div className="flex justify-between items-end mb-3">
                                    <div>
                                        <div className="text-sm font-black text-[var(--fg)]">{mode.name}</div>
                                        <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{mode.count} Routes Audited</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-black text-indigo-600">{mode.pct.toFixed(0)}%</div>
                                        <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Meeting Tier goal</div>
                                    </div>
                                </div>
                                <div className="h-4 bg-indigo-500/10 rounded-full overflow-hidden border border-indigo-500/10">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${mode.pct}%` }}
                                        transition={{ duration: 1, ease: 'easeOut' }}
                                        className="h-full bg-indigo-600 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Benchmarking Comparison */}
                <section className="mb-12">
                    <h2 className="text-xl font-black mb-6 flex items-center gap-2 px-2">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        National Benchmarking
                    </h2>
                    <div className="bg-[var(--item-bg)] border border-[var(--border)] rounded-3xl p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-6">Frequency Coverage (%)</h3>
                                <div className="space-y-6">
                                    <div className="relative">
                                        <div className="flex justify-between text-xs font-bold mb-2">
                                            <span className="text-indigo-600">This Agency</span>
                                            <span>{stats.highFreqPct.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-3 bg-indigo-500/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-600" style={{ width: `${stats.highFreqPct}%` }} />
                                        </div>
                                    </div>
                                    <div className="relative pt-2 border-t border-[var(--border)]">
                                        <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] mb-1">
                                            <span>National Peer Avg</span>
                                            <span>{benchmarks.nationalAvg.freq}%</span>
                                        </div>
                                        <div className="h-1.5 bg-[var(--item-bg)] rounded-full overflow-hidden">
                                            <div className="h-full bg-[var(--text-muted)] opacity-30" style={{ width: `${benchmarks.nationalAvg.freq}%` }} />
                                        </div>
                                    </div>
                                    {benchmarks.peerAgencies.map(peer => (
                                        <div key={peer.name} className="flex justify-between items-center text-[10px] font-medium text-[var(--text-muted)]">
                                            <span>{peer.name}</span>
                                            <span className="atlas-mono">{peer.freq}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-6">Reliability Benchmark (%)</h3>
                                <div className="space-y-6">
                                    <div className="relative">
                                        <div className="flex justify-between text-xs font-bold mb-2">
                                            <span className="text-emerald-500">This Agency</span>
                                            <span>{stats.avgReliability.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-3 bg-emerald-500/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500" style={{ width: `${stats.avgReliability}%` }} />
                                        </div>
                                    </div>
                                    <div className="relative pt-2 border-t border-[var(--border)]">
                                        <div className="flex justify-between text-[10px] font-bold text-[var(--text-muted)] mb-1">
                                            <span>National Peer Avg</span>
                                            <span>{benchmarks.nationalAvg.reliability}%</span>
                                        </div>
                                        <div className="h-1.5 bg-[var(--item-bg)] rounded-full overflow-hidden">
                                            <div className="h-full bg-[var(--text-muted)] opacity-30" style={{ width: `${benchmarks.nationalAvg.reliability}%` }} />
                                        </div>
                                    </div>
                                    {benchmarks.peerAgencies.map(peer => (
                                        <div key={peer.name} className="flex justify-between items-center text-[10px] font-medium text-[var(--text-muted)]">
                                            <span>{peer.name}</span>
                                            <span className="atlas-mono">{peer.reliability}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Frequency Tier Distribution */}
                <section className="mb-12">
                    <h2 className="text-xl font-black mb-6 flex items-center gap-2 px-2">
                        <Clock className="w-5 h-5 text-indigo-500" />
                        Headway Tier Distribution
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['5', '8', '10', '15', '20', '30', '60', 'span'].map((tierId: string) => {
                            const count = analysisResults.filter((r: AnalysisResult) => r.day === 'Weekday' && r.tier === tierId).length;
                            const tierName = {
                                '5': 'Rapid (5m)',
                                '8': 'Freq++ (8m)',
                                '10': 'Freq+ (10m)',
                                '15': 'Freq (15m)',
                                '20': 'Good (20m)',
                                '30': 'Basic (30m)',
                                '60': 'Infreq (60m)',
                                'span': 'Span Only'
                            }[tierId];

                            if (count === 0) return null;

                            return (
                                <div key={tierId} className="flex items-center justify-between p-4 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl">
                                    <span className="text-sm font-bold text-[var(--fg)]">{tierName}</span>
                                    <div className="flex items-center gap-3">
                                        <div className="text-xs font-black atlas-mono text-indigo-600">{count}</div>
                                        <div className="w-16 h-1 bg-indigo-600/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-600" style={{ width: `${(count / stats.totalRoutes) * 100}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <footer className="mt-20 pt-8 border-t border-[var(--border)] text-center text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                    <p>Internal Transit Strategy Document — Confidential — {new Date().getFullYear()} Atlas Intelligence Platform</p>
                </footer>
            </div>
        </div>
    );
}
