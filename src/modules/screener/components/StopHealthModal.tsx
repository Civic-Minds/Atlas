import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, ChevronRight, X } from 'lucide-react';
import { SpacingResult } from '../../../types/gtfs';

interface StopHealthModalProps {
    isOpen: boolean;
    onClose: () => void;
    results: SpacingResult[];
}

export const StopHealthModal: React.FC<StopHealthModalProps> = ({
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
                        className="relative w-full max-w-5xl max-h-[85vh] bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel)]">
                            <div>
                                <h2 className="atlas-h3">Stop Spacing & Health Audit</h2>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Identifying redundancy and optimizing walk-shed coverage. Target: 400m-800m spacing.</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-[var(--item-bg)] rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {results.length === 0 ? (
                                    <div className="col-span-full py-20 text-center opacity-40">
                                        <Database className="w-12 h-12 mx-auto mb-4 stroke-1" />
                                        <p className="atlas-label">No spacing data available. <br />Upload a GTFS file to run diagnostics.</p>
                                    </div>
                                ) : (
                                    results.filter(s => s.redundantPairs.length > 0).map((spacing) => (
                                        <div key={`${spacing.route}-${spacing.direction}`} className="precision-panel p-6 flex flex-col gap-4 group hover:border-amber-500/30 transition-all">
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
    );
};
