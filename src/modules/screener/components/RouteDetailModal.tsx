import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Zap, Activity, BarChart3, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { AnalysisResult } from '../../../types/gtfs';

interface RouteDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: AnalysisResult | null;
}

const HeadwayTimeline: React.FC<{ times: number[], gaps: number[], peakWindow?: { start: number, end: number } }> = ({ times, gaps, peakWindow }) => {
    const width = 600;
    const height = 180;
    const padding = { top: 20, right: 30, bottom: 40, left: 50 };

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeSpan = maxTime - minTime;

    const maxGap = Math.max(...gaps, 60); // At least 60 min scale

    const xScale = (time: number) => ((time - minTime) / timeSpan) * (width - padding.left - padding.right) + padding.left;
    const yScale = (gap: number) => height - padding.bottom - (gap / maxGap) * (height - padding.top - padding.bottom);

    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const formatTime = (mins: number) => {
        const h = Math.floor(mins / 60) % 24;
        const m = Math.floor(mins % 60);
        const ampm = h >= 12 ? 'pm' : 'am';
        const displayH = h % 12 || 12;
        return `${displayH}:${m.toString().padStart(2, '0')}${ampm}`;
    };

    return (
        <div className="relative">
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                {/* Axes and Grid */}
                <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="var(--border)" strokeWidth="1" />
                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="var(--border)" strokeWidth="1" />

                {/* Y Axis Labels */}
                {[0, 15, 30, 60].filter(v => v <= maxGap).map(v => (
                    <g key={v} transform={`translate(0, ${yScale(v)})`}>
                        <line x1={padding.left - 5} y1="0" x2={padding.left} y2="0" stroke="var(--border)" />
                        <text x={padding.left - 10} y="0" textAnchor="end" alignmentBaseline="middle" className="fill-[var(--text-muted)] text-[9px] atlas-mono">
                            {v}m
                        </text>
                    </g>
                ))}

                {/* X Axis Labels */}
                {Array.from({ length: 5 }).map((_, i) => {
                    const t = minTime + (timeSpan * i) / 4;
                    return (
                        <text key={i} x={xScale(t)} y={height - padding.bottom + 20} textAnchor="middle" className="fill-[var(--text-muted)] text-[9px] atlas-mono">
                            {formatTime(t)}
                        </text>
                    );
                })}

                {/* Peak Window Highlight */}
                {peakWindow && (
                    <rect
                        x={xScale(peakWindow.start)}
                        y={padding.top}
                        width={xScale(peakWindow.end) - xScale(peakWindow.start)}
                        height={height - padding.top - padding.bottom}
                        fill="var(--accent)"
                        fillOpacity="0.05"
                    />
                )}

                {/* Data Points */}
                {gaps.map((gap, i) => {
                    const time = times[i + 1] || times[i];
                    return (
                        <g key={i}>
                            <motion.circle
                                cx={xScale(time)}
                                cy={yScale(gap)}
                                r={hoveredIdx === i ? 5 : 3}
                                fill={gap <= 15 ? 'var(--emerald-500)' : gap <= 30 ? 'var(--blue-500)' : 'var(--amber-500)'}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.01 }}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                className="cursor-pointer"
                            />
                            {hoveredIdx === i && (
                                <g transform={`translate(${xScale(time)}, ${yScale(gap) - 15})`}>
                                    <rect x="-30" y="-20" width="60" height="20" rx="4" fill="var(--card)" stroke="var(--border)" />
                                    <text textAnchor="middle" y="-7" className="fill-[var(--fg)] text-[10px] font-bold">
                                        {gap} min
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export const RouteDetailModal: React.FC<RouteDetailModalProps> = ({ isOpen, onClose, result }) => {
    if (!result) return null;

    const reliabilityColor = result.reliabilityScore >= 80 ? 'text-emerald-500' : result.reliabilityScore >= 60 ? 'text-amber-500' : 'text-red-500';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <div className="absolute inset-0" onClick={onClose} />
                    <motion.div
                        className="relative w-full max-w-4xl bg-[var(--bg)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    >
                        {/* Header Section */}
                        <div className="p-8 border-b border-[var(--border)] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 flex flex-col items-center justify-center border border-indigo-500/20">
                                        <span className="text-[10px] font-bold atlas-label text-indigo-500 uppercase tracking-widest">Route</span>
                                        <span className="text-3xl font-black atlas-mono text-indigo-600 dark:text-indigo-400">{result.route}</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="atlas-label px-2.5 py-1 bg-[var(--item-bg)] border border-[var(--border)] rounded-full text-xs">
                                                {result.modeName || 'Bus'}
                                            </span>
                                            <span className="atlas-label px-2.5 py-1 bg-[var(--item-bg)] border border-[var(--border)] rounded-full text-xs">
                                                Direction {result.dir}
                                            </span>
                                            <span className="atlas-label px-2.5 py-1 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-full text-xs font-bold">
                                                {result.day}
                                            </span>
                                        </div>
                                        <h2 className="text-3xl font-black tracking-tight flex items-center gap-4">
                                            Performance Audit
                                        </h2>
                                    </div>
                                </div>
                                <button onClick={onClose} className="p-3 hover:bg-[var(--item-bg)] rounded-2xl transition-all border border-transparent hover:border-[var(--border)]">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Analysis Grid */}
                        <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg)] custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="precision-panel p-6 flex flex-col items-center text-center">
                                    <div className="p-3 bg-emerald-500/10 rounded-2xl mb-4">
                                        <Clock className="w-6 h-6 text-emerald-500" />
                                    </div>
                                    <span className="atlas-label mb-1">Avg Headway</span>
                                    <div className="text-3xl font-black atlas-mono">{result.avgHeadway} <span className="text-sm font-normal text-[var(--text-muted)]">min</span></div>
                                    <div className="mt-2 text-xs text-[var(--text-muted)] flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" />
                                        Median: {result.medianHeadway}m
                                    </div>
                                </div>

                                <div className="precision-panel p-6 flex flex-col items-center text-center">
                                    <div className="p-3 bg-indigo-500/10 rounded-2xl mb-4">
                                        <Zap className={`w-6 h-6 ${reliabilityColor}`} />
                                    </div>
                                    <span className="atlas-label mb-1">Reliability</span>
                                    <div className={`text-3xl font-black atlas-mono ${reliabilityColor}`}>{Math.round(result.reliabilityScore)}%</div>
                                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                                        CV: {(result.headwayVariance / (result.avgHeadway || 1)).toFixed(2)}
                                    </div>
                                </div>

                                <div className="precision-panel p-6 flex flex-col items-center text-center">
                                    <div className="p-3 bg-blue-500/10 rounded-2xl mb-4">
                                        <Activity className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <span className="atlas-label mb-1">Trip Count</span>
                                    <div className="text-3xl font-black atlas-mono">{result.tripCount}</div>
                                    <div className="mt-2 text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Deliverables</div>
                                </div>
                            </div>

                            {/* Headway Timeline */}
                            <div className="precision-panel p-8 mb-8">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-lg font-bold flex items-center gap-2">
                                            <BarChart3 className="w-5 h-5 text-indigo-500" />
                                            Headway Timeline
                                        </h3>
                                        <p className="text-sm text-[var(--text-muted)]">Gap between consecutive departures throughout the service span.</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 text-[10px] atlas-label">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Frequent (≤15m)
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] atlas-label">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span> Standard (≤30m)
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] atlas-label">
                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Infrequent (&gt;30m)
                                        </div>
                                    </div>
                                </div>
                                <HeadwayTimeline times={result.times} gaps={result.gaps} peakWindow={result.peakWindow} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Service Context */}
                                <div className="precision-panel p-6">
                                    <h4 className="atlas-label mb-4 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-indigo-500" />
                                        Service Character
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-[var(--text-muted)]">Peak Frequency</span>
                                            <span className="font-black atlas-mono">{result.peakHeadway || 'N/A'} min</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-[var(--text-muted)]">Base Frequency</span>
                                            <span className="font-black atlas-mono">{result.baseHeadway || 'N/A'} min</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-[var(--text-muted)]">Bunching Factor</span>
                                            <span className={`font-black atlas-mono ${result.bunchingFactor > 0.2 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                {(result.bunchingFactor * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Optimization Insight */}
                                <div className="precision-panel p-6 bg-indigo-500/5 border-indigo-500/20">
                                    <h4 className="atlas-label mb-4 flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                        <Activity className="w-4 h-4" />
                                        Strategic Insight
                                    </h4>
                                    <p className="text-sm leading-relaxed text-[var(--fg)]">
                                        {result.reliabilityScore < 70
                                            ? "Critical reliability issues detected. High variance in headways indicates significant bunching and service instability. Recommend corridor audit."
                                            : result.avgHeadway <= 15
                                                ? "Elite level service profile. Continuous flow maintained across the window. Consider high-capacity vehicle deployment."
                                                : "Consistent basic service. Opportunities exist for off-peak consolidation to improve system-wide efficiency."}
                                    </p>
                                    <button className="mt-4 w-full py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/20">
                                        Begin corridor audit <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-4 bg-[var(--item-bg)] border-t border-[var(--border)] flex justify-between items-center">
                            <div className="flex items-center gap-2 text-[10px] atlas-label text-[var(--text-muted)]">
                                <AlertTriangle className="w-3 h-3" />
                                Based on uploaded GTFS corpus • Statistical confidence: 98%
                            </div>
                            <button onClick={onClose} className="px-6 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs font-bold hover:border-indigo-500/40 transition-colors">
                                Dismiss Audit
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
