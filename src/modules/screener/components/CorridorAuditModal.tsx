import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, ChevronRight, RotateCcw, Download } from 'lucide-react';
import { CorridorResult } from '../../../types/gtfs';

interface CorridorAuditModalProps {
    isOpen: boolean;
    onClose: () => void;
    results: CorridorResult[];
}

export const CorridorAuditModal: React.FC<CorridorAuditModalProps> = ({
    isOpen,
    onClose,
    results
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
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
                                onClick={onClose}
                                className="p-2 hover:bg-[var(--item-bg)] rounded-lg transition-colors"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 gap-4">
                                {results.length === 0 ? (
                                    <div className="py-20 text-center opacity-40">
                                        <MapIcon className="w-12 h-12 mx-auto mb-4 stroke-1" />
                                        <p className="atlas-label">No corridors detected <br />with current filters</p>
                                    </div>
                                ) : (
                                    results.map((corridor, idx) => (
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
    );
};
