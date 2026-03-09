import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Database, CheckCircle2, AlertCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { useGtfsWorker } from '../../hooks/useGtfsWorker';
import { useTransitStore } from '../../types/store';
import { useNotificationStore } from '../../hooks/useNotification';
import { useCatalogStore } from '../../types/catalogStore';

export default function AdminView() {
    const { loading, status, runAnalysis } = useGtfsWorker();
    const { setRawData, clearData } = useTransitStore();
    const { feeds, removeFeed, loadCatalog } = useCatalogStore();
    const { addToast } = useNotificationStore();
    const [isSuccess, setIsSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load available feeds when admin mounts
    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsSuccess(false);

        runAnalysis(file, async (data) => {
            await setRawData(data);
            setIsSuccess(true);
            addToast('GTFS data ingested successfully', 'success');
        });
    };

    const handleReset = async () => {
        if (!confirm('Clear all ingested data? This cannot be undone.')) return;
        await clearData();
        setIsSuccess(false);
        addToast('Database cleared', 'info');
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

                    {(status || isSuccess) && (
                        <div className={`mt-6 p-4 rounded-xl border text-sm font-mono flex items-start gap-3 ${isSuccess ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600' : 'bg-[var(--item-bg)] border-[var(--border)] text-indigo-500'}`}>
                            {isSuccess ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                            {isSuccess ? 'Data Ingested Successfully' : status}
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

            {/* Catalog Feeds */}
            <div className="mt-8 precision-panel p-8 bg-[var(--item-bg)] border-[var(--border)]">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                    <Database className="w-5 h-5 text-indigo-500" />
                    Cataloged Feeds
                </h2>

                {feeds.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-muted)] text-sm italic border border-dashed border-[var(--border)] rounded-2xl">
                        No feeds currently stored in the catalog.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {feeds.map(feed => (
                            <div key={feed.feedId} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-[var(--bg)] border border-[var(--border)] rounded-2xl gap-4 hover:border-indigo-500/50 transition-colors">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-bold text-lg text-[var(--fg)]">{feed.agencyName}</h3>
                                        <span className="atlas-label bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 rounded">{feed.committedRouteCount} routes</span>
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-4">
                                        <span>Uploaded: {new Date(feed.uploadedAt).toLocaleDateString()}</span>
                                        <span>{feed.feedStartDate} to {feed.feedEndDate}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={async () => {
                                            if (confirm(`Are you sure you want to delete the catalog data for ${feed.agencyName}?`)) {
                                                await removeFeed(feed.feedId);
                                                addToast(`${feed.agencyName} deleted from catalog`, 'info');
                                            }
                                        }}
                                        className="btn-secondary text-red-500 hover:bg-red-500/10 px-4 py-2"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
