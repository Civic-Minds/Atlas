import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Filter, Clock, Map as MapIcon, RotateCcw, Download, ShieldCheck, Upload, Database, FileCheck, FileText } from 'lucide-react';
import { AnalysisResult, GtfsData, SpacingResult, CorridorResult } from '../../utils/gtfsUtils';
import { downloadCsv } from '../../utils/exportUtils';
import { storage, STORES } from '../../core/storage';
import { ModuleHeader } from '../../components/ModuleHeader';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import { useGtfsWorker } from '../../hooks/useGtfsWorker';
import { useTransitStore } from '../../types/store';
import { useNotificationStore } from '../../hooks/useNotification';
import { CorridorAuditModal } from './components/CorridorAuditModal';
import { StopHealthModal } from './components/StopHealthModal';
import { ValidationReportModal } from './components/ValidationReportModal';
import { RouteDetailModal } from './components/RouteDetailModal';
import { CommitModal } from './components/CommitModal';
import { useCatalogStore } from '../../types/catalogStore';
import './Screener.css';

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

/** Static class maps — Tailwind JIT can't detect dynamically interpolated class names */
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

export default function ScreenerView() {
    const {
        gtfsData,
        analysisResults,
        spacingResults,
        validationReport,
        setRawData,
        loadPersistedData,
        clearData
    } = useTransitStore();

    const { addToast } = useNotificationStore();
    const navigate = useNavigate();
    const [corridorResults, setCorridorResults] = useState<CorridorResult[]>([]);
    const [showCorridors, setShowCorridors] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const [selectedRouteResult, setSelectedRouteResult] = useState<AnalysisResult | null>(null);
    const [activeDay, setActiveDay] = useState('Weekday');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
    const [resetPending, setResetPending] = useState(false);
    const [showCommit, setShowCommit] = useState(false);
    const [lastFileName, setLastFileName] = useState('feed.zip');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { loading, status, runAnalysis } = useGtfsWorker();
    const { loadCatalog } = useCatalogStore();

    // Load persisted data on mount
    useEffect(() => {
        if (!gtfsData) {
            loadPersistedData();
        }
        loadCatalog();
    }, [loadPersistedData, gtfsData, loadCatalog]);

    const handleReset = async () => {
        if (!resetPending) {
            setResetPending(true);
            addToast('Click Reset again within 3 seconds to confirm.', 'warning');
            setTimeout(() => setResetPending(false), 3000);
            return;
        }
        setResetPending(false);
        await clearData();
        addToast('Data cleared successfully', 'info');
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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLastFileName(file.name);

        runAnalysis(file, async (data) => {
            await setRawData(data);
            addToast('GTFS analysis complete!', 'success');
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <div className="text-center">
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mb-1">Analyzing GTFS engine</p>
                        <p className="text-xs font-mono text-indigo-400 font-bold">{status}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!gtfsData) {
        return (
            <div className="module-container">
                <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                />
                <EmptyStateHero
                    icon={ShieldCheck}
                    title="Screen"
                    description="Analysis-ready frequency reporting. Waiting for data ingest from the administrative console."
                    primaryAction={{
                        label: "Open Admin Panel",
                        icon: Database,
                        href: "/admin"
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
                title="Screen"
                badge={{ label: `${gtfsData.routes.length} routes detected` }}
                actions={[
                    {
                        label: "Commit to Catalog",
                        icon: Database,
                        onClick: () => setShowCommit(true),
                        variant: 'primary'
                    },
                    {
                        label: "Board Report",
                        icon: FileText,
                        onClick: () => navigate('/strategy'),
                        variant: 'primary'
                    },
                    {
                        label: validationReport ? `Validation (${validationReport.errors}E / ${validationReport.warnings}W)` : 'Validation',
                        icon: FileCheck,
                        onClick: () => setShowValidation(true),
                        variant: 'secondary'
                    },
                    {
                        label: "Stop Health",
                        icon: ShieldCheck,
                        onClick: () => setShowDiagnostics(true),
                        variant: 'secondary'
                    },
                    {
                        label: "Corridor Analysis",
                        icon: MapIcon,
                        onClick: () => {
                            if (!gtfsData) return;
                            const worker = new Worker(new URL('../../workers/gtfs.worker.ts', import.meta.url), { type: 'module' });
                            worker.onmessage = (ev) => {
                                if (ev.data.type === 'CORRIDORS_DONE') {
                                    setCorridorResults(ev.data.corridors);
                                    setShowCorridors(true);
                                    worker.terminate();
                                }
                            };
                            worker.postMessage({
                                type: 'CORRIDORS',
                                gtfsData,
                                day: activeDay,
                                startMins: 360,
                                endMins: 600,
                            });
                        },
                        variant: 'secondary'
                    },
                    {
                        label: "Export",
                        icon: Download,
                        onClick: () => downloadCsv(filteredResults, 'transit-screener-results.csv'),
                        variant: 'primary'
                    },
                    {
                        label: "Reset",
                        icon: RotateCcw,
                        onClick: handleReset,
                        variant: 'ghost'
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
                                <th className="px-6 py-4 atlas-label">Mode</th>
                                <th className="px-6 py-4 atlas-label">Tier</th>
                                <th className="px-6 py-4 atlas-label text-right">Trips</th>
                                <th className="px-6 py-4 atlas-label text-right">Avg</th>
                                <th className="px-6 py-4 atlas-label text-right">Peak</th>
                                <th className="px-6 py-4 atlas-label text-right">Reliability</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {filteredResults.map((result, i) => {
                                const config = TIER_CONFIG.find(c => c.id === result.tier);
                                return (
                                    <tr
                                        key={i}
                                        className="hover:bg-[var(--item-bg)] transition-colors group cursor-pointer"
                                        onClick={() => setSelectedRouteResult(result)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <span className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-xs px-2 py-1 rounded border border-indigo-500/20">{result.route}</span>
                                                <span className="font-semibold text-sm text-[var(--fg)]">Route {result.route}</span>
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
                                        <td className="pr-4 py-4"><ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-indigo-600 transition-colors" /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <CorridorAuditModal
                isOpen={showCorridors}
                onClose={() => setShowCorridors(false)}
                results={corridorResults}
            />

            <StopHealthModal
                isOpen={showDiagnostics}
                onClose={() => setShowDiagnostics(false)}
                results={spacingResults}
            />

            <ValidationReportModal
                isOpen={showValidation}
                onClose={() => setShowValidation(false)}
                report={validationReport}
            />

            <RouteDetailModal
                isOpen={!!selectedRouteResult}
                onClose={() => setSelectedRouteResult(null)}
                result={selectedRouteResult}
            />

            {gtfsData && (
                <CommitModal
                    isOpen={showCommit}
                    onClose={() => setShowCommit(false)}
                    gtfsData={gtfsData}
                    analysisResults={analysisResults}
                    fileName={lastFileName}
                    onCommitted={(stats) => {
                        addToast(`Committed: ${stats.added} new, ${stats.updated} updated, ${stats.unchanged} unchanged`, 'success');
                    }}
                />
            )}
        </div>
    );
}
