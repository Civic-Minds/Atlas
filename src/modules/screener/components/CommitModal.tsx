import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, CheckCircle2, AlertTriangle, ArrowRight, RefreshCcw, Plus, Minus } from 'lucide-react';
import { GtfsData, AnalysisResult } from '../../../types/gtfs';
import { useCatalogStore } from '../../../types/catalogStore';
import { extractFeedMeta } from '../../../core/catalog';
import { detectChanges, buildCatalogRoutes } from '../../../core/catalog';

interface CommitModalProps {
    isOpen: boolean;
    onClose: () => void;
    gtfsData: GtfsData;
    analysisResults: AnalysisResult[];
    fileName: string;
    onCommitted: (stats: { added: number; updated: number; unchanged: number }) => void;
}

export const CommitModal: React.FC<CommitModalProps> = ({
    isOpen, onClose, gtfsData, analysisResults, fileName, onCommitted
}) => {
    const { catalogRoutes, commitFeed } = useCatalogStore();
    const [agencyName, setAgencyName] = useState('');
    const [committing, setCommitting] = useState(false);
    const [committed, setCommitted] = useState(false);

    // Auto-detect agency name from feed_info
    const feedMetaPreview = useMemo(() => {
        if (!gtfsData) return null;
        const meta = extractFeedMeta(gtfsData, fileName);
        if (!agencyName) setAgencyName(meta.agencyName);
        return meta;
    }, [gtfsData, fileName]);

    // Preview change detection
    const changePreview = useMemo(() => {
        if (!feedMetaPreview || !agencyName) return null;
        const agencyId = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const incoming = buildCatalogRoutes(gtfsData, analysisResults, {
            feedId: 'preview',
            agencyId,
            agencyName,
        });
        return detectChanges(catalogRoutes, incoming);
    }, [feedMetaPreview, agencyName, gtfsData, analysisResults, catalogRoutes]);

    const existingAgencyRoutes = useMemo(() => {
        if (!agencyName) return 0;
        const agencyId = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return catalogRoutes.filter(r => r.agencyId === agencyId).length;
    }, [agencyName, catalogRoutes]);

    const handleCommit = async () => {
        if (!agencyName.trim()) return;
        setCommitting(true);
        try {
            const stats = await commitFeed(gtfsData, analysisResults, agencyName.trim(), fileName);
            setCommitted(true);
            onCommitted(stats);
        } catch (error) {
            console.error('Commit failed:', error);
        } finally {
            setCommitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    className="relative w-full max-w-lg bg-[var(--bg)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden"
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                                <Database className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black">Commit to Catalog</h2>
                                <p className="text-[10px] text-[var(--text-muted)] atlas-label">Add routes to permanent database</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-[var(--item-bg)] rounded-xl">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {committed ? (
                            /* Success state */
                            <div className="text-center py-8 space-y-4">
                                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                                <h3 className="text-xl font-black">Committed Successfully</h3>
                                <p className="text-sm text-[var(--text-muted)]">Routes have been added to your catalog.</p>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Agency Name */}
                                <div>
                                    <label className="atlas-label text-[9px] mb-2 block">Agency Name</label>
                                    <input
                                        type="text"
                                        value={agencyName}
                                        onChange={(e) => setAgencyName(e.target.value)}
                                        placeholder="e.g. LA Metro"
                                        className="w-full px-4 py-3 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>

                                {/* Feed Info */}
                                {feedMetaPreview && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="precision-panel p-3">
                                            <div className="atlas-label text-[8px] mb-1">File</div>
                                            <div className="text-xs font-bold truncate">{fileName}</div>
                                        </div>
                                        <div className="precision-panel p-3">
                                            <div className="atlas-label text-[8px] mb-1">Routes in Feed</div>
                                            <div className="text-xs font-bold atlas-mono">{feedMetaPreview.routeCount}</div>
                                        </div>
                                        {feedMetaPreview.feedStartDate && (
                                            <div className="precision-panel p-3">
                                                <div className="atlas-label text-[8px] mb-1">Effective From</div>
                                                <div className="text-xs font-bold atlas-mono">{feedMetaPreview.feedStartDate}</div>
                                            </div>
                                        )}
                                        {feedMetaPreview.feedEndDate && (
                                            <div className="precision-panel p-3">
                                                <div className="atlas-label text-[8px] mb-1">Effective Until</div>
                                                <div className="text-xs font-bold atlas-mono">{feedMetaPreview.feedEndDate}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Change Detection */}
                                {changePreview && (
                                    <div className="precision-panel p-4 space-y-3">
                                        <div className="atlas-label text-[8px] mb-2">
                                            {existingAgencyRoutes > 0 ? 'Change Detection' : 'Summary'}
                                        </div>

                                        {changePreview.added.length > 0 && (
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Plus className="w-3.5 h-3.5 text-emerald-500" />
                                                    <span>New routes</span>
                                                </div>
                                                <span className="font-black atlas-mono text-emerald-500">{changePreview.added.length}</span>
                                            </div>
                                        )}

                                        {changePreview.updated.length > 0 && (
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCcw className="w-3.5 h-3.5 text-amber-500" />
                                                    <span>Changed (will be unreviewed)</span>
                                                </div>
                                                <span className="font-black atlas-mono text-amber-500">{changePreview.updated.length}</span>
                                            </div>
                                        )}

                                        {changePreview.unchanged.length > 0 && (
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                                                    <span>Unchanged (verification inherited)</span>
                                                </div>
                                                <span className="font-black atlas-mono text-blue-500">{changePreview.unchanged.length}</span>
                                            </div>
                                        )}

                                        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-sm font-bold">
                                            <span>Total to catalog</span>
                                            <span className="atlas-mono">
                                                {changePreview.added.length + changePreview.updated.length + changePreview.unchanged.length}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Commit Button */}
                                <button
                                    onClick={handleCommit}
                                    disabled={committing || !agencyName.trim()}
                                    className="w-full py-4 bg-indigo-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                                >
                                    {committing ? (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Database className="w-4 h-4" />
                                            Commit {analysisResults.length} routes to catalog
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
