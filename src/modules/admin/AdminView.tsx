import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Database, CheckCircle2, AlertCircle, RotateCcw, Users } from 'lucide-react';
import { useGtfsWorker } from '../../hooks/useGtfsWorker';
import { useTransitStore } from '../../types/store';
import { useNotificationStore } from '../../hooks/useNotification';
import { useCatalogStore } from '../../types/catalogStore';
import { usePopulationStore } from '../../hooks/usePopulationStore';

export default function AdminView() {
    const { loading, status, runAnalysis } = useGtfsWorker();
    const { setRawData, clearData } = useTransitStore();
    const { feeds, removeFeed, loadCatalog } = useCatalogStore();
    const { points, uploadPopulationCsv, loadPopulation, clearPopulation, loading: popLoading, error: popError } = usePopulationStore();
    const { addToast } = useNotificationStore();
    const [isSuccess, setIsSuccess] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const popInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadCatalog();
        loadPopulation();
    }, [loadCatalog, loadPopulation]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;
        setIsSuccess(false);

        if (files.length === 1) {
            runAnalysis(files[0], async (data) => {
                await setRawData(data);
                setIsSuccess(true);
                addToast('GTFS data ingested successfully', 'success');
            });
        } else {
            // Batch ingest
            let successCount = 0;
            const { commitFeed } = useCatalogStore.getState();
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setBatchProgress({ current: i + 1, total: files.length, filename: file.name });
                
                await new Promise<void>((resolve) => {
                    runAnalysis(file, async (data) => {
                        try {
                            const agencyName = file.name.replace(/\.zip$/i, '');
                            const { activeCriteria } = useTransitStore.getState();
                            
                            // Apply phase 2 logic to get analysisResults
                            const { applyAnalysisCriteria } = await import('../../core/transit-logic');
                            const analysisResults = applyAnalysisCriteria(data.rawDepartures, activeCriteria);
                            
                            await commitFeed(data.gtfsData, analysisResults, agencyName, file.name);
                            successCount++;
                        } catch (e) {
                            console.error(`Failed to commit ${file.name}`, e);
                        } finally {
                            resolve();
                        }
                    });
                });
            }
            
            setBatchProgress(null);
            setIsSuccess(true);
            addToast(`Batch ingested ${successCount} feeds to catalog`, 'success');
            
            // Reset input so the same files can be selected again if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleReset = async () => {
        if (!confirm('Clear all ingested data? This cannot be undone.')) return;
        await Promise.all([
            clearData(),
            clearPopulation()
        ]);
        setIsSuccess(false);
        addToast('Database cleared', 'info');
    };

    const handlePopUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await uploadPopulationCsv(file);
            addToast('Population data uploaded successfully', 'success');
        } catch (e) {
            addToast('Failed to upload population data', 'error');
        }
        if (popInputRef.current) popInputRef.current.value = '';
    };

    return (
        <div className="atlas-page max-w-4xl mx-auto py-12 px-6">
            <header className="mb-12 border-b border-[var(--border)] pb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)] mb-1">Admin</h1>
                    <p className="text-sm text-[var(--text-muted)]">Upload GTFS feeds and manage stored data.</p>
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
                        Upload GTFS
                    </h2>

                    <input
                        type="file"
                        accept=".zip"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />

                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        disabled={loading || !!batchProgress}
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-full p-12 bg-[var(--bg)] border-2 border-dashed border-indigo-500/30 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-indigo-500 transition-all ${loading || !!batchProgress ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {loading || !!batchProgress ? (
                            <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        ) : isSuccess ? (
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                        ) : (
                            <Database className="w-10 h-10 text-indigo-400 opacity-50" />
                        )}
                        <div className="text-center">
                            <div className="font-bold text-[var(--fg)]">
                                {batchProgress ? `Processing ${batchProgress.current} of ${batchProgress.total}...` : loading ? 'Processing GTFS...' : isSuccess ? 'Ingest Complete' : 'Upload GTFS Library'}
                            </div>
                            {batchProgress ? (
                                <p className="text-[10px] text-indigo-500 mt-1 font-bold truncate max-w-[200px] mx-auto">{batchProgress.filename}</p>
                            ) : (
                                <p className="text-[10px] text-[var(--text-muted)] mt-1 font-bold">GTFS .ZIP ARCHIVES ONLY (Select multiple for batch)</p>
                            )}
                        </div>
                    </motion.button>

                    {(status || isSuccess || !!batchProgress) && (
                        <div className={`mt-6 p-4 rounded-xl border text-sm font-mono flex items-start gap-3 ${isSuccess && !batchProgress ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600' : 'bg-[var(--item-bg)] border-[var(--border)] text-indigo-500'}`}>
                            {isSuccess && !batchProgress ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                            {isSuccess && !batchProgress ? 'Data Ingested Successfully' : status}
                        </div>
                    )}
                </div>

                {/* Population Upload Section */}
                <div className="precision-panel p-8 bg-emerald-500/5 border-emerald-500/20">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <Users className="w-5 h-5 text-emerald-500" />
                        Equity Data
                    </h2>

                    <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        ref={popInputRef}
                        onChange={handlePopUpload}
                    />

                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        disabled={popLoading}
                        onClick={() => popInputRef.current?.click()}
                        className={`w-full p-8 bg-[var(--bg)] border-2 border-dashed border-emerald-500/30 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-emerald-500 transition-all ${popLoading ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {popLoading ? (
                            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                        ) : points.length > 0 ? (
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        ) : (
                            <Users className="w-8 h-8 text-emerald-400 opacity-50" />
                        )}
                        <div className="text-center">
                            <div className="font-bold text-[var(--fg)] text-sm">
                                {popLoading ? 'Parsing CSV...' : points.length > 0 ? 'Population Data Active' : 'Upload Population CSV'}
                            </div>
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 font-bold">CENSUS BLOCK CENTROIDS (ID,LAT,LON,COUNT)</p>
                        </div>
                    </motion.button>

                    {popError && (
                        <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-red-500 text-[10px] font-bold">
                            {popError}
                        </div>
                    )}
                    
                    {points.length > 0 && (
                        <div className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 text-xs font-bold flex items-center justify-between">
                            <span>{points.length.toLocaleString()} nodes indexed</span>
                            <button onClick={clearPopulation} className="text-red-500 hover:underline">Clear</button>
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
                            <span className="atlas-label">Storage</span>
                            <span className="text-sm font-bold text-[var(--fg)]">IndexedDB (local)</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-[var(--border)]">
                            <span className="atlas-label">Population Points</span>
                            <span className="text-sm font-bold text-[var(--fg)]">{points.length.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-[var(--border)]">
                            <span className="atlas-label">Tenancy</span>
                            <span className="text-sm font-bold text-indigo-500">Multi-Tenant (RBAC)</span>
                        </div>
                    </div>

                    <div className="mt-8 p-6 bg-[var(--item-bg)] rounded-2xl border border-[var(--border)] text-xs text-[var(--text-muted)] leading-relaxed italic">
                        All data is processed locally in your browser. Nothing is uploaded to a server.
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
