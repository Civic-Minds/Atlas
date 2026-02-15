import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Search, ChevronRight, Filter, Clock, Map as MapIcon, RotateCcw, Download } from 'lucide-react';
import { AnalysisResult, GtfsData } from '../../utils/gtfsUtils';
import { downloadCsv } from '../../utils/exportUtils';
import { storage, STORES } from '../../core/storage';
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
                    setGtfsData(gtfsData);
                    setAnalysisResults(analysisResults);

                    // Persist results
                    await storage.setItem(STORES.GTFS, 'latest', gtfsData);
                    await storage.setItem(STORES.ANALYSIS, 'latest', analysisResults);

                    setLoading(false);
                    setStatusMessage('');
                    worker.terminate();
                } else if (type === 'ERROR') {
                    console.error('Analysis failed:', error);
                    alert('Failed to analyze GTFS: ' + error);
                    setLoading(false);
                    setStatusMessage('');
                    worker.terminate();
                }
            };

            worker.postMessage({
                file,
                startTimeMins: 7 * 60,
                endTimeMins: 22 * 60
            });

        } catch (error) {
            console.error('Worker initialization failed:', error);
            alert('Failed to start analysis worker.');
            setLoading(false);
            setStatusMessage('');
        }
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

    const handleReset = async () => {
        setGtfsData(null);
        setAnalysisResults([]);
        await storage.clearStore(STORES.GTFS);
        await storage.clearStore(STORES.ANALYSIS);
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
            <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="text-center mb-16 max-w-2xl">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        <h2 className="atlas-h1">Screen</h2>
                        <p className="text-lg text-[var(--text-muted)]">Local, private, and instant GTFS analysis with high-precision reporting.</p>
                    </motion.div>
                </div>

                <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                />

                <div className="flex flex-col items-center gap-4">
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full max-w-md p-12 bg-[var(--card)] border border-[var(--border)] rounded-[2rem] shadow-soft hover:border-indigo-500/30 transition-all group"
                    >
                        <Upload className="w-10 h-10 mx-auto text-indigo-500 mb-6" />
                        <div className="text-lg font-bold text-[var(--fg)] mb-2">Upload GTFS Zip</div>
                        <p className="atlas-label">Supports .zip archives</p>
                    </motion.button>

                    <button
                        onClick={async () => {
                            setLoading(true);
                            setStatusMessage('Fetching sample data...');
                            try {
                                const response = await fetch('/data/samples/gtfs-sample.zip');
                                if (!response.ok) throw new Error('Sample not found');
                                const blob = await response.blob();
                                const file = new File([blob], 'sample.zip', { type: 'application/zip' });

                                setStatusMessage('Initializing worker...');
                                const worker = new Worker(new URL('../../workers/gtfs.worker.ts', import.meta.url), {
                                    type: 'module'
                                });

                                worker.onmessage = async (e) => {
                                    const { type, message, gtfsData, analysisResults, error } = e.data;

                                    if (type === 'STATUS') {
                                        setStatusMessage(message);
                                    } else if (type === 'DONE') {
                                        setGtfsData(gtfsData);
                                        setAnalysisResults(analysisResults);
                                        await storage.setItem(STORES.GTFS, 'latest', gtfsData);
                                        await storage.setItem(STORES.ANALYSIS, 'latest', analysisResults);
                                        setLoading(false);
                                        setStatusMessage('');
                                        worker.terminate();
                                    } else if (type === 'ERROR') {
                                        alert('Failed to analyze sample GTFS: ' + error);
                                        setLoading(false);
                                        setStatusMessage('');
                                        worker.terminate();
                                    }
                                };

                                worker.postMessage({
                                    file,
                                    startTimeMins: 7 * 60,
                                    endTimeMins: 22 * 60
                                });

                            } catch (e) {
                                alert('Demo data not available. Please upload a GTFS zip.');
                                setLoading(false);
                                setStatusMessage('');
                            }
                        }}
                        className="atlas-label hover:text-indigo-500 transition-colors"
                    >
                        Or load sample data for verification
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl pt-24">
                    {[
                        { icon: <Clock />, title: 'Instant Results', desc: 'Visualize frequency tiers and headways immediately.' },
                        { icon: <MapIcon />, title: 'Privacy First', desc: '100% local processing. Data never leaves your browser.' },
                        { icon: <Filter />, title: 'Deep Insights', desc: 'Identify gaps and export compliance reports.' }
                    ].map((f, i) => (
                        <div key={i} className="text-center group">
                            <div className="text-indigo-500 w-6 h-6 mx-auto mb-4 opacity-70 group-hover:opacity-100 transition-opacity">{f.icon}</div>
                            <div className="font-bold text-[var(--fg)] mb-2">{f.title}</div>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto w-full">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <div className="flex items-center gap-4">
                    <h1 className="atlas-h2">Screen</h1>
                    <span className="atlas-label bg-[var(--item-bg)] border border-[var(--border)] px-3 py-1 rounded-full">
                        {gtfsData.routes.length} routes detected
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => downloadCsv(filteredResults, 'transit-screener-results.csv')}
                        className="btn-primary"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={handleReset}
                        className="btn-secondary"
                    >
                        <RotateCcw className="w-4 h-4" /> Reset
                    </button>
                </div>
            </header>

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
