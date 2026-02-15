import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Shield,
    Check,
    X,
    HelpCircle,
    ExternalLink,
    RefreshCcw,
    Upload,
    Search,
    ChevronRight,
    Activity,
    Trophy,
    Settings,
    CheckCircle2,
    AlertTriangle
} from 'lucide-react';
import { AnalysisResult, GtfsData } from '../../utils/gtfsUtils';
import { storage, STORES } from '../../core/storage';
import './Verifier.css';

export default function VerifierView() {
    const [gtfsData, setGtfsData] = useState<GtfsData | null>(null);
    const [queue, setQueue] = useState<AnalysisResult[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [evidenceUrl, setEvidenceUrl] = useState('https://www.mbta.com/schedules/1/line');
    const [streak, setStreak] = useState(0);
    const [stats, setStats] = useState({ correct: 0, wrong: 0, total: 0 });
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Persist data on load
    useEffect(() => {
        const loadPersisted = async () => {
            const savedGtfs = await storage.getItem<GtfsData>(STORES.GTFS, 'latest');
            const savedResults = await storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest');
            if (savedGtfs && savedResults) {
                setGtfsData(savedGtfs);
                setQueue(savedResults.sort(() => Math.random() - 0.5));
                setCurrentIndex(0);
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
                    setQueue(analysisResults.sort(() => Math.random() - 0.5));
                    setCurrentIndex(0);

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

    const handleDecision = useCallback((type: 'correct' | 'wrong' | 'unsure') => {
        if (currentIndex >= queue.length) return;

        setStats(prev => ({
            ...prev,
            [type]: (prev as any)[type] + 1,
            total: prev.total + 1
        }));

        if (type === 'correct') setStreak(s => s + 1);
        else setStreak(0);

        setCurrentIndex(prev => prev + 1);
    }, [currentIndex, queue.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'q' || e.key === 'Q') handleDecision('correct');
            if (e.key === 'w' || e.key === 'W') handleDecision('wrong');
            if (e.key === 'e' || e.key === 'E') handleDecision('unsure');
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDecision]);

    const currentClaim = queue[currentIndex];

    if (loading) {
        return (
            <div className="verifier-container items-center justify-center">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <div className="text-center">
                        <p className="atlas-label mb-1">Simulating Validation Engine</p>
                        <p className="text-xs font-mono text-indigo-400 font-bold">{statusMessage}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!gtfsData) {
        return (
            <div className="verifier-container">
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-4"
                    >
                        <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Shield className="w-12 h-12 text-indigo-400" />
                        </div>
                        <h2 className="atlas-h1">Manual Validation Mode</h2>
                        <p className="text-xl text-[var(--text-muted)] max-w-lg mx-auto">
                            Verify AI-generated frequency claims against real-world agency schedules.
                        </p>
                    </motion.div>

                    <input
                        type="file"
                        accept=".zip"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-primary px-8 py-4 rounded-2xl text-lg shadow-lg shadow-indigo-500/20"
                    >
                        <Upload className="w-5 h-5" /> Start Validation Task
                    </motion.button>
                </div>
            </div>
        );
    }

    if (currentIndex >= queue.length) {
        return (
            <div className="verifier-container items-center justify-center">
                <div className="glass-panel p-12 text-center space-y-6 max-w-md">
                    <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
                    <h2 className="atlas-h2">Analysis Complete</h2>
                    <p className="text-[var(--text-muted)]">You've verified all routes in this feed.</p>
                    <div className="flex justify-center gap-8 py-4">
                        <div>
                            <div className="text-2xl font-black text-emerald-400">{stats.correct}</div>
                            <div className="atlas-label">Correct</div>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-red-400">{stats.wrong}</div>
                            <div className="atlas-label">Incorrect</div>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            setGtfsData(null);
                            await storage.clearStore(STORES.GTFS);
                            await storage.clearStore(STORES.ANALYSIS);
                        }}
                        className="btn-secondary w-full justify-center py-4"
                    >
                        <RefreshCcw className="w-4 h-4" /> Reset and Restart
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="verifier-container">
            <header className="flex items-center justify-between mb-8 px-6 pt-6">
                <div className="flex items-center gap-4">
                    <h1 className="atlas-h2">Arcade</h1>
                    <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-600 dark:text-amber-400">
                        <Trophy className="w-3 h-3" />
                        <span className="atlas-label">Phase 2 Verification</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl">
                        <span className="atlas-label">Streak</span>
                        <span className="atlas-mono text-indigo-600 dark:text-indigo-400">{streak}</span>
                    </div>
                    <button className="btn-secondary">
                        <Settings className="w-4 h-4" />
                        Options
                    </button>
                </div>
            </header>

            <div className="verifier-arena">
                {/* AI Claims Feed */}
                <div className="verifier-pane">
                    <div className="pane-header">
                        <h2 className="pane-title">AI engine output</h2>
                        <span className="atlas-label bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">Live feed</span>
                    </div>
                    <div className="pane-content">
                        <AnimatePresence mode="wait">
                            {currentClaim && (
                                <motion.div
                                    key={currentClaim.route}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="claim-card"
                                >
                                    <div className="atlas-label text-indigo-500 mb-2">Route Analysis</div>
                                    <div className="claim-route">{currentClaim.route}</div>
                                    <div className="claim-tier">{currentClaim.tier === 'span' ? 'Span' : `${currentClaim.tier}m`}</div>

                                    <div className="claim-details">
                                        <div className="claim-detail-item">
                                            <div className="detail-label">Service Day</div>
                                            <div className="detail-value text-indigo-500">{currentClaim.day}</div>
                                        </div>
                                        <div className="claim-detail-item">
                                            <div className="detail-label">Trips</div>
                                            <div className="detail-value text-emerald-500">{currentClaim.tripCount}</div>
                                        </div>
                                    </div>

                                    <div className="mt-8 text-sm text-[var(--text-muted)] leading-relaxed">
                                        Analyze the provided agency schedule and confirm if the proposed service tier accurately reflects the route's operational frequency.
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Evidence Panel (Iframe for verification) */}
                <div className="verifier-pane flex-[2]">
                    <div className="pane-header">
                        <h2 className="pane-title">Reference material</h2>
                        <div className="flex items-center gap-4">
                            <span className="atlas-label">Source: mbta.com / pdf</span>
                        </div>
                    </div>
                    <div className="pane-content">
                        <div className="evidence-controls">
                            <input
                                type="text"
                                className="url-input"
                                value={evidenceUrl}
                                onChange={(e) => setEvidenceUrl(e.target.value)}
                            />
                            <button className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
                                <ExternalLink className="w-4 h-4" />
                            </button>
                        </div>
                        <iframe
                            src={evidenceUrl}
                            className="evidence-frame"
                            title="Evidence Panel"
                        />
                    </div>
                </div>

                {/* Feedback Panel */}
                <div className="verifier-pane decision-pane">
                    <div className="pane-header">
                        <h2 className="pane-title">Consensus</h2>
                    </div>
                    <div className="decision-buttons">
                        <button
                            className="decision-btn btn-correct"
                            onClick={() => handleDecision('correct')}
                        >
                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div className="flex-1 text-left">
                                <div>Correct</div>
                                <div className="atlas-label opacity-60">Verify frequency</div>
                            </div>
                            <span className="key-hint">Q</span>
                        </button>

                        <button
                            className="decision-btn btn-wrong"
                            onClick={() => handleDecision('wrong')}
                        >
                            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="flex-1 text-left">
                                <div>Wrong</div>
                                <div className="atlas-label opacity-60">Flag anomaly</div>
                            </div>
                            <span className="key-hint">W</span>
                        </button>

                        <button
                            className="decision-btn btn-unsure"
                            onClick={() => handleDecision('unsure')}
                        >
                            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <HelpCircle className="w-5 h-5" />
                            </div>
                            <div className="flex-1 text-left">
                                <div>Unsure</div>
                                <div className="atlas-label opacity-60">Request review</div>
                            </div>
                            <span className="key-hint">E</span>
                        </button>

                        <div className="mt-auto p-4 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl">
                            <div className="atlas-label mb-3">Operator Guidelines</div>
                            <ul className="space-y-2">
                                <li className="text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                                    <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                                    Frequency must match "Freq" if headway is &lt; 15 mins.
                                </li>
                                <li className="text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                                    <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                                    Check span of service for "Span" tier.
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
