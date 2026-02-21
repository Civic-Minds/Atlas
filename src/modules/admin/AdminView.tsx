import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Database, CheckCircle2, AlertCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { GtfsData, AnalysisResult } from '../../utils/gtfsUtils';
import { storage, STORES } from '../../core/storage';

export default function AdminView() {
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setIsSuccess(false);
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
                    // Persist results
                    await storage.setItem(STORES.GTFS, 'latest', gtfsData);
                    await storage.setItem(STORES.ANALYSIS, 'latest', analysisResults);

                    setLoading(false);
                    setStatusMessage('Data Ingested Successfully');
                    setIsSuccess(true);
                    worker.terminate();
                } else if (type === 'ERROR') {
                    console.error('Analysis failed:', error);
                    setStatusMessage('Analysis failed: ' + error);
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
            console.error('Worker initialization failed:', error);
            setStatusMessage('Failed to start analysis worker.');
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('Clear all ingested data? This cannot be undone.')) return;
        await storage.clearStore(STORES.GTFS);
        await storage.clearStore(STORES.ANALYSIS);
        setIsSuccess(false);
        setStatusMessage('Database Cleared');
    };

    return (
        <div className="atlas-page max-w-4xl mx-auto py-12 px-6">
            <header className="mb-12 border-b border-[var(--border)] pb-8 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-indigo-500 mb-2">
                        <ShieldCheck className="w-5 h-5" />
                        <span className="atlas-label font-black tracking-widest text-[10px]">ADMINISTRATIVE CONSOLE</span>
                    </div>
                    <h1 className="atlas-h1 mb-2">Data Ingest</h1>
                    <p className="text-[var(--text-muted)] text-lg">Manage Headway Central Database and GTFS assets.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={handleReset} className="btn-secondary text-red-500 hover:bg-red-500/10">
                        <RotateCcw className="w-4 h-4" /> Reset DB
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Upload Section */}
                <div className="precision-panel p-8 bg-indigo-500/5 border-indigo-500/20">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <Upload className="w-5 h-5 text-indigo-500" />
                        Asset Ingestion
                    </h2>

                    <input
                        type="file"
                        accept=".zip"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />

                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        disabled={loading}
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-full p-12 bg-[var(--bg)] border-2 border-dashed border-indigo-500/30 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-indigo-500 transition-all ${loading ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {loading ? (
                            <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        ) : isSuccess ? (
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                        ) : (
                            <Database className="w-10 h-10 text-indigo-400 opacity-50" />
                        )}
                        <div className="text-center">
                            <div className="font-bold text-[var(--fg)]">
                                {loading ? 'Processing GTFS...' : isSuccess ? 'Ingest Complete' : 'Upload GTFS Library'}
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1 font-bold">GTFS .ZIP ARCHIVES ONLY</p>
                        </div>
                    </motion.button>

                    {statusMessage && (
                        <div className={`mt-6 p-4 rounded-xl border text-sm font-mono flex items-start gap-3 ${isSuccess ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600' : 'bg-[var(--item-bg)] border-[var(--border)] text-indigo-500'}`}>
                            {isSuccess ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                            {statusMessage}
                        </div>
                    )}
                </div>

                {/* System Stats */}
                <div className="precision-panel p-8">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <Database className="w-5 h-5 text-[var(--text-muted)]" />
                        Database Status
                    </h2>

                    <div className="space-y-6">
                        <div className="flex justify-between items-center py-3 border-b border-[var(--border)]">
                            <span className="atlas-label">Target Environment</span>
                            <span className="text-sm font-bold text-emerald-500">PRODUCTION</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-[var(--border)]">
                            <span className="atlas-label">Storage Engine</span>
                            <span className="text-sm font-bold text-[var(--fg)]">IndexedDB // STORES.GTFS</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-[var(--border)]">
                            <span className="atlas-label">Persistence Mode</span>
                            <span className="text-sm font-bold text-indigo-500 font-mono">PERSISTENT_RECOVERY</span>
                        </div>
                    </div>

                    <div className="mt-8 p-6 bg-[var(--item-bg)] rounded-2xl border border-[var(--border)] text-xs text-[var(--text-muted)] leading-relaxed italic">
                        All data ingestion is handled locally in the browser worker thread. Ingested GTFS assets are stored in the local HeadwayDB for persistence across sessions.
                    </div>
                </div>
            </div>
        </div>
    );
}
