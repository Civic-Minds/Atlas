import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Search, ChevronRight, Filter, Clock, Map as MapIcon, RotateCcw, Download, ShieldCheck, Database } from 'lucide-react';
import { AnalysisResult, GtfsData } from '../../utils/gtfsUtils';
import { downloadCsv } from '../../utils/exportUtils';
import { storage, STORES } from '../../core/storage';
import { ModuleHeader } from '../../components/ModuleHeader';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import './Screener.css';

const TIER_CONFIG = [
    { id: '10', label: 'Freq+', name: 'Freq+', color: 'emerald' },
    { id: '15', label: 'Freq', name: 'Freq', color: 'blue' },
    { id: '20', label: 'Good', name: 'Good', color: 'indigo' },
    { id: '30', label: 'Basic', name: 'Basic', color: 'amber' },
    { id: '60', label: 'Infreq', name: 'Infreq', color: 'orange' },
    { id: 'span', label: 'Span', name: 'Span', color: 'slate' }
];

export default function ScreenerView() {
    const [gtfsData, setGtfsData] = useState<GtfsData | null>(null);
    const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [activeDay, setActiveDay] = useState('Weekday');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Persist data on load
    useEffect(() => {
        const loadPersisted = async () => {
            const savedGtfs = await storage.getItem<GtfsData>(STORES.GTFS, 'latest');
            const savedResults = await storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest');
            if (savedGtfs && savedResults) {
                setGtfsData(savedGtfs);
                setAnalysisResults(savedResults);
            }
        };
        loadPersisted();
    }, []);

    const handleReset = async () => {
        if (!confirm('This will clear the current analysis. Ingested data remains in the Admin panel.')) return;
        setGtfsData(null);
        setAnalysisResults([]);
        await storage.clearStore(STORES.GTFS);
        await storage.clearStore(STORES.ANALYSIS);
    };

    const filteredResults = useMemo(() => {
        return analysisResults.filter(r => {
            const matchesDay = r.day === activeDay;
            const matchesTier = activeTiers.size === 0 || activeTiers.has(r.tier);
            const matchesSearch = r.route.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesDay && matchesTier && matchesSearch;
        });
    }, [analysisResults, activeDay, searchQuery, activeTiers]);

    const tierCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        analysisResults.filter(r => r.day === activeDay).forEach(r => {
            counts[r.tier] = (counts[r.tier] || 0) + 1;
        });
        return counts;
    }, [analysisResults, activeDay]);

    const toggleTier = (tier: string) => {
        const next = new Set(activeTiers);
        if (next.has(tier)) next.delete(tier);
        else next.add(tier);
        setActiveTiers(next);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <div className="text-center">
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mb-1">Analyzing GTFS engine</p>
                        <p className="text-xs font-mono text-indigo-400 font-bold">{statusMessage}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!gtfsData) {
        return (
            <div className="module-container">
                <EmptyStateHero
                    icon={ShieldCheck}
                    title="Headway Screen"
                    description="Analysis-ready frequency reporting. Waiting for data ingest from the administrative console."
                    primaryAction={{
                        label: "Open Admin Panel",
                        icon: Database,
                        href: "/admin",
                        onClick: () => { }
                    }}
                    features={[
                        { icon: <Clock />, title: 'Frequency Tiers', desc: 'Auto-categorize routes by headway performance.' },
                        { icon: <MapIcon />, title: 'System-Wide', desc: 'Identify coverage gaps across the entire network.' },
                        { icon: <Filter />, title: 'Deep Insights', desc: 'Identify gaps and export compliance reports.' }
                    ]}
                />
            </div>
        );
    }

    return (
        <div className="module-container">
            <ModuleHeader
                title="Headway Screen"
                badge={{ label: `${gtfsData.routes.length} routes detected` }}
                actions={[
                    {
                        label: "Export CSV",
                        icon: Download,
                        onClick: () => downloadCsv(filteredResults, 'transit-screener-results.csv'),
                        variant: 'primary'
                    },
                    {
                        label: "Reset",
                        icon: RotateCcw,
                        onClick: handleReset,
                        variant: 'secondary'
                    }
                ]}
            />

            <div className="flex gap-1 bg-[var(--item-bg)] p-1 rounded-xl w-fit mb-8 border border-[var(--border)]">
                {['Weekday', 'Saturday', 'Sunday'].map(day => (
                    <button
                        key={day}
                        onClick={() => setActiveDay(day)}
                        className={`px-6 py-2 rounded-lg text-[10px] font-bold transition-all ${activeDay === day
                            ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
                            }`}
                    >
                        {day}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
                {TIER_CONFIG.map(tier => (
                    <button
                        key={tier.id}
                        onClick={() => toggleTier(tier.id)}
                        className={`precision-panel p-4 text-left transition-all ${activeTiers.has(tier.id)
                            ? `border-${tier.color}-500/40 bg-${tier.color}-500/5`
                            : 'hover:border-[var(--border-hover)]'
                            }`}
                    >
                        <div className="atlas-label mb-2">{tier.label}</div>
                        <div className={`text-2xl font-bold text-${tier.color}-600 dark:text-${tier.color}-400 atlas-mono`}>
                            {tierCounts[tier.id] || 0}
                        </div>
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between gap-6 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter by route name..."
                        className="w-full pl-12 pr-4 py-3 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-sm text-[var(--fg)] shadow-sm"
                    />
                </div>
                <div className="atlas-label">
                    Results: <span className="text-indigo-600 dark:text-indigo-400 atlas-mono font-black">{filteredResults.length}</span>
                </div>
            </div>

            <div className="precision-panel overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[var(--item-bg)] border-b border-[var(--border)]">
                                <th className="px-6 py-4 atlas-label">Route</th>
                                <th className="px-6 py-4 atlas-label">Tier</th>
                                <th className="px-6 py-4 atlas-label text-right">Trips</th>
                                <th className="px-6 py-4 atlas-label text-right">Avg Headway</th>
                                <th className="px-6 py-4 atlas-label text-right">Median</th>
                                <th className="px-6 py-4 atlas-label text-right">Reliability</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {filteredResults.map((result, i) => {
                                const config = TIER_CONFIG.find(c => c.id === result.tier);
                                return (
                                    <tr key={i} className="hover:bg-[var(--item-bg)] transition-colors group cursor-pointer">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <span className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-xs px-2 py-1 rounded border border-indigo-500/20">{result.route}</span>
                                                <span className="font-semibold text-sm text-[var(--fg)]">Route {result.route}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-${config?.color}-600 dark:text-${config?.color}-400 font-bold text-[9px] px-2 py-1 rounded bg-${config?.color}-500/5 border border-${config?.color}-500/10 shadow-sm`}>
                                                {config?.name}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">{result.tripCount}</td>
                                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">{Math.round(result.avgHeadway)}m</td>
                                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">{result.medianHeadway}m</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-12 h-1 bg-[var(--item-bg)] rounded-full overflow-hidden border border-[var(--border)]">
                                                    <div
                                                        className={`h-full rounded-full ${result.reliabilityScore > 80 ? 'bg-emerald-500' : result.reliabilityScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${result.reliabilityScore}%` }}
                                                    />
                                                </div>
                                                <span className={`text-[10px] atlas-mono font-bold ${result.reliabilityScore > 80 ? 'text-emerald-600 dark:text-emerald-400' : result.reliabilityScore > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {result.reliabilityScore}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="pr-4 py-4"><ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-indigo-600 transition-colors" /></td>
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
