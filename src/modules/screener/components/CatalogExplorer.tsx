import React, { useState, useMemo } from 'react';
import { Search, MapIcon, Clock, Activity, ShieldCheck, Download, ChevronRight } from 'lucide-react';
import { useCatalogStore } from '../../../types/catalogStore';
import { downloadCsv } from '../../../utils/exportUtils';
import { useAuthStore } from '../../../hooks/useAuthStore';
import { RouteDetailModal } from './RouteDetailModal';
import { AnalysisResult } from '../../../types/gtfs';

const TIER_CONFIG = [
    { id: '5', label: 'Rapid', name: 'Rapid', color: 'cyan' },
    { id: '8', label: 'Freq++', name: 'Freq++', color: 'teal' },
    { id: '10', label: 'Freq+', name: 'Freq+', color: 'emerald' },
    { id: '15', label: 'Freq', name: 'Freq', color: 'blue' },
    { id: '20', label: 'Good', name: 'Good', color: 'indigo' },
    { id: '30', label: 'Basic', name: 'Basic', color: 'amber' },
    { id: '60', label: 'Infreq', name: 'Infreq', color: 'orange' },
    { id: 'span', label: 'Span', name: 'Span', color: 'slate' }
];

const TIER_ACTIVE_CLASSES: Record<string, string> = {
    cyan: 'border-cyan-500/40 bg-cyan-500/5',
    teal: 'border-teal-500/40 bg-teal-500/5',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    blue: 'border-blue-500/40 bg-blue-500/5',
    indigo: 'border-indigo-500/40 bg-indigo-500/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
    orange: 'border-orange-500/40 bg-orange-500/5',
    slate: 'border-slate-500/40 bg-slate-500/5',
};

const TIER_VALUE_CLASSES: Record<string, string> = {
    cyan: 'text-cyan-600 dark:text-cyan-400',
    teal: 'text-teal-600 dark:text-teal-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    amber: 'text-amber-600 dark:text-amber-400',
    orange: 'text-orange-600 dark:text-orange-400',
    slate: 'text-slate-600 dark:text-slate-400',
};

const TIER_BADGE_CLASSES: Record<string, string> = {
    cyan: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/5 border-cyan-500/10',
    teal: 'text-teal-600 dark:text-teal-400 bg-teal-500/5 border-teal-500/10',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/5 border-blue-500/10',
    indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 border-indigo-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/10',
    orange: 'text-orange-600 dark:text-orange-400 bg-orange-500/5 border-orange-500/10',
    slate: 'text-slate-600 dark:text-slate-400 bg-slate-500/5 border-slate-500/10',
};

export const CatalogExplorer: React.FC = () => {
    const { currentRoutes } = useCatalogStore();
    const { agencyId } = useAuthStore();
    const [activeDay, setActiveDay] = useState('Weekday');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
    const [activeAgency, setActiveAgency] = useState<string | null>(agencyId || null);
    const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);

    const agencies = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of currentRoutes) {
            if (!map.has(r.agencyId)) map.set(r.agencyId, r.agencyName);
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [currentRoutes]);

    const filteredResults = useMemo(() => {
        return currentRoutes.filter(r => {
            const matchesDay = r.dayType === activeDay;
            const matchesTier = activeTiers.size === 0 || activeTiers.has(r.tier);
            const matchesSearch = r.route.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  (r.routeLongName && r.routeLongName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                  r.agencyName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesAgency = !activeAgency || r.agencyId === activeAgency;
            return matchesDay && matchesTier && matchesSearch && matchesAgency;
        });
    }, [currentRoutes, activeDay, searchQuery, activeTiers, activeAgency]);

    const tierCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        currentRoutes.filter(r => r.dayType === activeDay && (!activeAgency || r.agencyId === activeAgency)).forEach(r => {
            counts[r.tier] = (counts[r.tier] || 0) + 1;
        });
        return counts;
    }, [currentRoutes, activeDay, activeAgency]);

    const toggleTier = (tier: string) => {
        const next = new Set(activeTiers);
        if (next.has(tier)) next.delete(tier);
        else next.add(tier);
        setActiveTiers(next);
    };

    return (
        <div className="catalog-explorer">
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

            {/* Agency Filter */}
            {!agencyId && agencies.length > 1 && (
                <div className="mb-8">
                    <label className="atlas-label text-[9px] mb-2 block">Filter by Agency</label>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setActiveAgency(null)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${!activeAgency ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30' : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                        >
                            All Agencies
                        </button>
                        {agencies.map(a => (
                            <button
                                key={a.id}
                                onClick={() => setActiveAgency(a.id)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${activeAgency === a.id ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30' : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                            >
                                {a.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
                {TIER_CONFIG.map(tier => (
                    <button
                        key={tier.id}
                        onClick={() => toggleTier(tier.id)}
                        className={`precision-panel p-4 text-left transition-all ${activeTiers.has(tier.id)
                            ? TIER_ACTIVE_CLASSES[tier.color]
                            : 'hover:border-[var(--border-hover)]'
                            }`}
                    >
                        <div className="atlas-label mb-2">{tier.label}</div>
                        <div className={`text-2xl font-bold atlas-mono ${TIER_VALUE_CLASSES[tier.color]}`}>
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
                        placeholder="Filter by route or agency..."
                        className="w-full pl-12 pr-4 py-3 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-sm text-[var(--fg)] shadow-sm"
                    />
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => downloadCsv(filteredResults, 'atlas-regional-catalog.csv')}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--item-bg)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--fg)] hover:border-indigo-500 transition-colors"
                    >
                        <Download className="w-4 h-4" /> Export Regional CSV
                    </button>
                    <div className="atlas-label">
                        Catalog Routes: <span className="text-indigo-600 dark:text-indigo-400 atlas-mono font-black">{filteredResults.length}</span>
                    </div>
                </div>
            </div>

            <div className="precision-panel overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[var(--item-bg)] border-b border-[var(--border)]">
                                <th className="px-6 py-4 atlas-label">Agency</th>
                                <th className="px-6 py-4 atlas-label">Route</th>
                                <th className="px-6 py-4 atlas-label">Mode</th>
                                <th className="px-6 py-4 atlas-label">Tier</th>
                                <th className="px-6 py-4 atlas-label text-right">Trips</th>
                                <th className="px-6 py-4 atlas-label text-right">Avg</th>
                                <th className="px-6 py-4 atlas-label text-right">Peak</th>
                                <th className="px-6 py-4 atlas-label text-right">Reliability</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {filteredResults.map((result) => {
                                const config = TIER_CONFIG.find(c => c.id === result.tier);
                                return (
                                    <tr
                                        key={result.id}
                                        onClick={() => {
                                            setSelectedResult({
                                                route: result.route,
                                                dir: result.dir,
                                                day: result.dayType as any,
                                                tier: result.tier,
                                                avgHeadway: result.avgHeadway,
                                                medianHeadway: result.medianHeadway,
                                                tripCount: result.tripCount,
                                                reliabilityScore: result.reliabilityScore,
                                                consistencyScore: result.consistencyScore || result.reliabilityScore,
                                                bunchingPenalty: result.bunchingPenalty || 0,
                                                outlierPenalty: result.outlierPenalty || 0,
                                                headwayVariance: result.headwayVariance || 0,
                                                bunchingFactor: result.bunchingFactor || 0,
                                                peakHeadway: result.peakHeadway || 0,
                                                baseHeadway: result.baseHeadway || 0,
                                                serviceSpan: result.serviceSpan,
                                                modeName: result.modeName,
                                                routeLongName: result.routeLongName,
                                                times: [],
                                                gaps: [],
                                                serviceIds: [],
                                                warnings: []
                                            });
                                        }}
                                        className="hover:bg-[var(--item-bg)] transition-colors group cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{result.agencyName}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <span className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-xs px-2 py-1 rounded border border-indigo-500/20">{result.route}</span>
                                                <span className="font-semibold text-sm text-[var(--fg)] max-w-[200px] truncate">{result.routeLongName || `Route ${result.route}`}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                                {result.modeName || 'Transit'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`font-bold text-[9px] px-2 py-1 rounded border shadow-sm ${TIER_BADGE_CLASSES[config?.color || 'slate']}`}>
                                                {config?.name}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">{result.tripCount}</td>
                                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">{Math.round(result.avgHeadway)}m</td>
                                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-indigo-500 font-bold">{result.peakHeadway ? `${Math.round(result.peakHeadway)}m` : '-'}</td>
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <RouteDetailModal 
                isOpen={!!selectedResult}
                onClose={() => setSelectedResult(null)}
                result={selectedResult}
            />
        </div>
    );
}