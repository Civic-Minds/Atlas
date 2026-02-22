import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Search, ChevronRight, Filter, Clock, Map as MapIcon, RotateCcw, Download, ShieldCheck, Database } from 'lucide-react';
import { AnalysisResult, GtfsData, CorridorResult, calculateCorridors, SpacingResult } from '../../utils/gtfsUtils';
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
    const [corridorResults, setCorridorResults] = useState<CorridorResult[]>([]);
    const [spacingResults, setSpacingResults] = useState<SpacingResult[]>([]);
    const [showCorridors, setShowCorridors] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setStatusMessage('Initializing worker...');

        try {
            const worker = new Worker(new URL('../../workers/gtfs.worker.ts', import.meta.url), {
                type: 'module'
            });

            worker.onmessage = async (e) => {
                const { type, message, gtfsData, analysisResults, error } = e.data;

                if (type === 'STATUS') {
                    setStatusMessage(message);
                } else if (type === 'DONE') {
                    const { gtfsData, analysisResults, spacingResults } = e.data;
                    setGtfsData(gtfsData);
                    setAnalysisResults(analysisResults);
                    if (spacingResults) setSpacingResults(spacingResults);

                    // Persist
                    await storage.setItem(STORES.GTFS, 'latest', gtfsData);
                    await storage.setItem(STORES.ANALYSIS, 'latest', analysisResults);
                    if (spacingResults) await storage.setItem('spacing_diagnostic', 'latest', spacingResults);

                    setLoading(false);
                    worker.terminate();
                } else if (type === 'ERROR') {
                    console.error('Analysis failed:', error);
                    alert('Analysis failed: ' + error);
                    setLoading(false);
                    worker.terminate();
                }
            };

            worker.postMessage({
                file,
                startTimeMins: 7 * 60,
                endTimeMins: 22 * 60
            });

        } catch (error) {
            console.error('Worker failed:', error);
            alert('Failed to start analysis worker.');
            setLoading(false);
        }
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
                <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                />
                <EmptyStateHero
                    icon={ShieldCheck}
                    title="Headway Screen"
                    description="Analysis-ready frequency reporting. Upload a GTFS archive to begin the audit."
                    primaryAction={{
                        label: "Upload GTFS File",
                        icon: Upload,
                        onClick: () => fileInputRef.current?.click()
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
                title="Headway Alpha"
                badge={{ label: `${gtfsData.routes.length} routes detected` }}
                actions={[
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
                            const res = calculateCorridors(gtfsData, activeDay, 360, 600); // 6am-10am peak default
                            setCorridorResults(res);
                            setShowCorridors(true);
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

            {/* Corridor Audit Modal */}
            <AnimatePresence>
                {showCorridors && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowCorridors(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-5xl max-h-[80vh] bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel)]">
                                <div>
                                    <h2 className="atlas-h3">Corridor Intelligence Audit</h2>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Detecting high-frequency road segments shared across multiple routes.</p>
                                </div>
                                <button
                                    onClick={() => setShowCorridors(false)}
                                    className="p-2 hover:bg-[var(--item-bg)] rounded-lg transition-colors"
                                >
                                    <RotateCcw className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                <div className="grid grid-cols-1 gap-4">
                                    {corridorResults.length === 0 ? (
                                        <div className="py-20 text-center opacity-40">
                                            <MapIcon className="w-12 h-12 mx-auto mb-4 stroke-1" />
                                            <p className="atlas-label">No corridors detected <br />with current filters</p>
                                        </div>
                                    ) : (
                                        corridorResults.map((corridor, idx) => (
                                            <div key={idx} className="precision-panel p-4 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                                                <div className="flex items-center gap-6">
                                                    <div className="flex -space-x-2">
                                                        {corridor.routeIds.slice(0, 3).map((r, i) => (
                                                            <div key={i} className="w-8 h-8 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-[var(--bg)] shadow-sm">
                                                                {r}
                                                            </div>
                                                        ))}
                                                        {corridor.routeIds.length > 3 && (
                                                            <div className="w-8 h-8 rounded-full bg-[var(--item-bg)] text-[var(--text-muted)] text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg)]">
                                                                +{corridor.routeIds.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold flex items-center gap-2">
                                                            <span>Stop {corridor.stopA}</span>
                                                            <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                                                            <span>Stop {corridor.stopB}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <span className="atlas-label">{corridor.routeIds.join(', ')}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8">
                                                    <div className="text-right">
                                                        <div className="atlas-label mb-1">Combined Avg</div>
                                                        <div className="text-lg font-black atlas-mono text-emerald-600 dark:text-emerald-400">{corridor.avgHeadway}m</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="atlas-label mb-1">Peak Flow</div>
                                                        <div className="text-lg font-black atlas-mono text-indigo-600 dark:text-indigo-400">{corridor.peakHeadway}m</div>
                                                    </div>
                                                    <div className="w-px h-8 bg-[var(--border)]" />
                                                    <button className="btn-secondary !p-2">
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t border-[var(--border)] bg-[var(--panel)]">
                                <p className="text-[10px] text-[var(--text-muted)] text-center font-bold uppercase tracking-widest">
                                    Corridor algorithm v0.5 • Segment matching by Node-to-Node topology
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Stop Health Diagnostic Modal */}
            <AnimatePresence>
                {showDiagnostics && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowDiagnostics(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-5xl max-h-[85vh] bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel)]">
                                <div>
                                    <h2 className="atlas-h3">Stop Spacing & Health Audit</h2>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Identifying redundancy and optimizing walk-shed coverage. Target: 400m-800m spacing.</p>
                                </div>
                                <button
                                    onClick={() => setShowDiagnostics(false)}
                                    className="p-2 hover:bg-[var(--item-bg)] rounded-lg transition-colors"
                                >
                                    <RotateCcw className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {spacingResults.length === 0 ? (
                                        <div className="col-span-full py-20 text-center opacity-40">
                                            <Database className="w-12 h-12 mx-auto mb-4 stroke-1" />
                                            <p className="atlas-label">No spacing data available. <br />Upload a GTFS file to run diagnostics.</p>
                                        </div>
                                    ) : (
                                        spacingResults.filter(s => s.redundantPairs.length > 0).map((spacing, idx) => (
                                            <div key={idx} className="precision-panel p-6 flex flex-col gap-4 group hover:border-amber-500/30 transition-all">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="atlas-mono text-xs font-black px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">{spacing.route}</span>
                                                            <span className="text-sm font-bold text-[var(--fg)]">Direction {spacing.direction}</span>
                                                        </div>
                                                        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{spacing.totalStops} total stops processed</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="atlas-label mb-1">Median Spacing</div>
                                                        <div className="atlas-mono text-lg font-black text-indigo-600 dark:text-indigo-400">{spacing.medianSpacing}m</div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-tighter text-amber-600 dark:text-amber-400">
                                                        <span>Redundancy Alert</span>
                                                        <span>{spacing.redundantPairs.length} pairs detected</span>
                                                    </div>
                                                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                        {spacing.redundantPairs.map((pair, pIdx) => (
                                                            <div key={pIdx} className="bg-amber-500/5 border border-amber-500/20 p-2 rounded-lg flex items-center justify-between">
                                                                <div className="text-[10px] font-medium truncate max-w-[200px]">
                                                                    <span className="opacity-60">{pair.stopAName}</span>
                                                                    <ChevronRight className="inline-block w-2.5 h-2.5 mx-1" />
                                                                    <span className="opacity-60">{pair.stopBName}</span>
                                                                </div>
                                                                <span className="atlas-mono text-[10px] font-black">{pair.distance}m</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-[var(--border)] mt-auto">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-[var(--text-muted)]">Walk-shed Overlap</span>
                                                        <span className="text-[10px] font-black text-red-500">{((spacing.redundantPairs.length / spacing.totalStops) * 100).toFixed(1)}% Critical</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t border-[var(--border)] bg-[var(--panel)]">
                                <p className="text-[10px] text-[var(--text-muted)] text-center font-bold uppercase tracking-widest">
                                    Stop Health v1.0 • Radius: 400m (Walk-shed) • Redundancy detected by spatial adjacency
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
