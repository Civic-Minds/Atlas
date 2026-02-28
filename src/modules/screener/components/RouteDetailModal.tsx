import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Zap, Activity, BarChart3, ChevronRight, TrendingUp, AlertTriangle, List, Calendar, Info, CheckCircle2, Flag, SkipForward, MessageSquare } from 'lucide-react';
import { AnalysisResult, RawRouteDepartures, DayName, ALL_DAYS, WEEKDAYS, DAY_TO_TYPE } from '../../../types/gtfs';
import { useTransitStore } from '../../../types/store';
import { useCatalogStore } from '../../../types/catalogStore';
import type { VerificationStatus } from '../../../types/catalog';

interface RouteDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: AnalysisResult | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? 'pm' : 'am';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')}${ampm}`;
};

const formatTime24 = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Departure List — the raw audit table
// ---------------------------------------------------------------------------

const DepartureList: React.FC<{
    departureTimes: number[];
    gaps: number[];
    tierThreshold: number | null;
}> = ({ departureTimes, gaps, tierThreshold }) => {
    if (departureTimes.length === 0) {
        return <div className="text-sm text-[var(--text-muted)] italic py-4">No departures found.</div>;
    }

    return (
        <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-sm">
                <thead className="sticky top-0 bg-[var(--bg)] z-10">
                    <tr className="border-b border-[var(--border)]">
                        <th className="px-3 py-2 atlas-label text-[9px]">#</th>
                        <th className="px-3 py-2 atlas-label text-[9px]">Departure</th>
                        <th className="px-3 py-2 atlas-label text-[9px] text-right">Gap from prev</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                    {departureTimes.map((time, i) => {
                        const gap = i > 0 ? gaps[i - 1] : null;
                        const exceedsThreshold = tierThreshold !== null && gap !== null && gap > tierThreshold;
                        const nearThreshold = tierThreshold !== null && gap !== null && gap > tierThreshold - 5 && gap <= tierThreshold;
                        return (
                            <tr
                                key={i}
                                className={exceedsThreshold ? 'bg-red-500/5' : ''}
                            >
                                <td className="px-3 py-1.5 atlas-mono text-[10px] text-[var(--text-muted)]">{i + 1}</td>
                                <td className="px-3 py-1.5">
                                    <span className="atlas-mono font-bold text-xs">{formatTime(time)}</span>
                                    <span className="atlas-mono text-[10px] text-[var(--text-muted)] ml-2">{formatTime24(time)}</span>
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                    {gap !== null ? (
                                        <span className={`atlas-mono font-bold text-xs ${exceedsThreshold
                                            ? 'text-red-500'
                                            : nearThreshold
                                                ? 'text-amber-500'
                                                : 'text-[var(--fg)]'
                                            }`}>
                                            {Math.round(gap)}m
                                            {exceedsThreshold && tierThreshold && (
                                                <span className="text-[9px] text-red-400 ml-1">
                                                    +{Math.round(gap - tierThreshold)}
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-[var(--text-muted)]">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Headway Timeline — visual scatter plot of gaps
// ---------------------------------------------------------------------------

const HeadwayTimeline: React.FC<{
    times: number[];
    gaps: number[];
    tierThreshold: number | null;
}> = ({ times, gaps, tierThreshold }) => {
    if (times.length < 2 || gaps.length === 0) {
        return <div className="text-sm text-[var(--text-muted)] italic py-4">Not enough departures for timeline.</div>;
    }

    const width = 600;
    const height = 180;
    const padding = { top: 20, right: 30, bottom: 40, left: 50 };

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeSpan = maxTime - minTime || 1;
    const maxGap = Math.max(...gaps, 60);

    const xScale = (time: number) => ((time - minTime) / timeSpan) * (width - padding.left - padding.right) + padding.left;
    const yScale = (gap: number) => height - padding.bottom - (gap / maxGap) * (height - padding.top - padding.bottom);

    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    return (
        <div className="relative">
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="var(--border)" strokeWidth="1" />
                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="var(--border)" strokeWidth="1" />

                {/* Tier threshold line */}
                {tierThreshold !== null && tierThreshold <= maxGap && (
                    <g>
                        <line
                            x1={padding.left}
                            y1={yScale(tierThreshold)}
                            x2={width - padding.right}
                            y2={yScale(tierThreshold)}
                            stroke="rgb(239 68 68)"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                            opacity="0.6"
                        />
                        <text
                            x={width - padding.right + 4}
                            y={yScale(tierThreshold)}
                            alignmentBaseline="middle"
                            className="fill-red-500 text-[8px] font-bold"
                        >
                            {tierThreshold}m
                        </text>
                    </g>
                )}

                {/* Y axis labels */}
                {[0, 15, 30, 60].filter(v => v <= maxGap).map(v => (
                    <g key={v} transform={`translate(0, ${yScale(v)})`}>
                        <line x1={padding.left - 5} y1="0" x2={padding.left} y2="0" stroke="var(--border)" />
                        <text x={padding.left - 10} y="0" textAnchor="end" alignmentBaseline="middle" className="fill-[var(--text-muted)] text-[9px] atlas-mono">
                            {v}m
                        </text>
                    </g>
                ))}

                {/* X axis labels */}
                {Array.from({ length: 5 }).map((_, i) => {
                    const t = minTime + (timeSpan * i) / 4;
                    return (
                        <text key={i} x={xScale(t)} y={height - padding.bottom + 20} textAnchor="middle" className="fill-[var(--text-muted)] text-[9px] atlas-mono">
                            {formatTime(t)}
                        </text>
                    );
                })}

                {/* Data points */}
                {gaps.map((gap, i) => {
                    const time = times[i + 1] || times[i];
                    const exceeds = tierThreshold !== null && gap > tierThreshold;
                    return (
                        <g key={i}>
                            <motion.circle
                                cx={xScale(time)}
                                cy={yScale(gap)}
                                r={hoveredIdx === i ? 5 : 3}
                                fill={exceeds ? 'rgb(239 68 68)' : gap <= 15 ? 'rgb(16 185 129)' : gap <= 30 ? 'rgb(59 130 246)' : 'rgb(245 158 11)'}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.005 }}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                className="cursor-pointer"
                            />
                            {hoveredIdx === i && (
                                <g transform={`translate(${xScale(time)}, ${yScale(gap) - 15})`}>
                                    <rect x="-35" y="-20" width="70" height="20" rx="4" fill="var(--card)" stroke="var(--border)" />
                                    <text textAnchor="middle" y="-7" className="fill-[var(--fg)] text-[10px] font-bold">
                                        {Math.round(gap)}m @ {formatTime(time)}
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

// ---------------------------------------------------------------------------
// Departure Strip — compact visual showing all departures as ticks on a bar
// ---------------------------------------------------------------------------

const DepartureStrip: React.FC<{ times: number[] }> = ({ times }) => {
    if (times.length === 0) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = max - min || 1;

    return (
        <div className="relative h-8 bg-[var(--item-bg)] rounded-lg border border-[var(--border)] overflow-hidden">
            {/* Hour markers */}
            {Array.from({ length: 24 }).map((_, h) => {
                const m = h * 60;
                if (m < min || m > max) return null;
                return (
                    <div
                        key={h}
                        className="absolute top-0 h-full border-l border-[var(--border)]"
                        style={{ left: `${((m - min) / span) * 100}%` }}
                    >
                        <span className="absolute -top-0.5 left-0.5 text-[7px] text-[var(--text-muted)] atlas-mono">{h}</span>
                    </div>
                );
            })}
            {/* Departure ticks */}
            {times.map((t, i) => (
                <div
                    key={i}
                    className="absolute top-1 bottom-1 w-[2px] bg-indigo-500 rounded-full"
                    style={{ left: `${((t - min) / span) * 100}%` }}
                />
            ))}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Service ID breakdown
// ---------------------------------------------------------------------------

const ServiceIdBadges: React.FC<{ serviceIds: string[]; warnings: string[] }> = ({ serviceIds, warnings }) => (
    <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
            {serviceIds.map(sid => (
                <span key={sid} className="atlas-mono text-[9px] px-2 py-0.5 bg-[var(--item-bg)] border border-[var(--border)] rounded-md font-bold">
                    {sid}
                </span>
            ))}
        </div>
        {warnings.length > 0 && (
            <div className="space-y-1">
                {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-amber-500 text-[10px]">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{w}</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// ---------------------------------------------------------------------------
// Gap Distribution — "10 gaps of 10min, 2 gaps of 12min" summary
// ---------------------------------------------------------------------------

const GapDistribution: React.FC<{
    gaps: number[];
    tierThreshold: number | null;
}> = ({ gaps, tierThreshold }) => {
    const distribution = useMemo(() => {
        if (gaps.length === 0) return [];
        // Round each gap to nearest minute, then count occurrences
        const counts = new Map<number, number>();
        for (const g of gaps) {
            const rounded = Math.round(g);
            counts.set(rounded, (counts.get(rounded) || 0) + 1);
        }
        // Sort by gap size ascending
        return Array.from(counts.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([gap, count]) => ({ gap, count }));
    }, [gaps]);

    if (distribution.length === 0) return null;

    const maxCount = Math.max(...distribution.map(d => d.count));

    return (
        <div className="space-y-1.5">
            {distribution.map(({ gap, count }) => {
                const exceeds = tierThreshold !== null && gap > tierThreshold;
                const barWidth = (count / maxCount) * 100;
                return (
                    <div key={gap} className="flex items-center gap-3 text-xs">
                        <span className={`atlas-mono font-bold w-10 text-right shrink-0 ${exceeds ? 'text-red-500' : 'text-[var(--fg)]'}`}>
                            {gap}m
                        </span>
                        <div className="flex-1 h-5 bg-[var(--item-bg)] rounded border border-[var(--border)] overflow-hidden">
                            <div
                                className={`h-full rounded transition-all ${exceeds ? 'bg-red-500/40' : 'bg-indigo-500/30'}`}
                                style={{ width: `${barWidth}%` }}
                            />
                        </div>
                        <span className={`atlas-mono font-bold w-8 shrink-0 ${exceeds ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                            {count}x
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Per-day tab content
// ---------------------------------------------------------------------------

const DayDetail: React.FC<{
    raw: RawRouteDepartures;
    tierThreshold: number | null;
}> = ({ raw, tierThreshold }) => {
    const gapStats = useMemo(() => {
        if (raw.gaps.length === 0) return null;
        const sorted = [...raw.gaps].sort((a, b) => a - b);
        const max = sorted[sorted.length - 1];
        const min = sorted[0];
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const exceedCount = tierThreshold !== null ? sorted.filter(g => g > tierThreshold).length : 0;
        return { min, max, avg, median, exceedCount, total: sorted.length };
    }, [raw.gaps, tierThreshold]);

    return (
        <div className="space-y-6">
            {/* Quick stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="precision-panel p-3 text-center">
                    <div className="atlas-label text-[8px] mb-1">Trips</div>
                    <div className="text-lg font-black atlas-mono">{raw.tripCount}</div>
                </div>
                <div className="precision-panel p-3 text-center">
                    <div className="atlas-label text-[8px] mb-1">Span</div>
                    <div className="text-lg font-black atlas-mono">{formatTime(raw.serviceSpan.start)}–{formatTime(raw.serviceSpan.end)}</div>
                </div>
                {gapStats && (
                    <>
                        <div className="precision-panel p-3 text-center">
                            <div className="atlas-label text-[8px] mb-1">Median Gap</div>
                            <div className="text-lg font-black atlas-mono">{Math.round(gapStats.median)}m</div>
                        </div>
                        <div className="precision-panel p-3 text-center">
                            <div className="atlas-label text-[8px] mb-1">Max Gap</div>
                            <div className={`text-lg font-black atlas-mono ${tierThreshold !== null && gapStats.max > tierThreshold ? 'text-red-500' : ''}`}>
                                {Math.round(gapStats.max)}m
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Threshold violations summary */}
            {tierThreshold !== null && gapStats && gapStats.exceedCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-xl text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-red-600 dark:text-red-400 font-bold">
                        {gapStats.exceedCount} of {gapStats.total} gaps exceed {tierThreshold}m threshold
                    </span>
                </div>
            )}

            {/* Gap Distribution */}
            <div>
                <div className="atlas-label text-[8px] mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3 h-3" /> Gap Distribution
                </div>
                <div className="precision-panel p-4">
                    <GapDistribution gaps={raw.gaps} tierThreshold={tierThreshold} />
                </div>
            </div>

            {/* Departure strip */}
            <div>
                <div className="atlas-label text-[8px] mb-2">Departure Timeline</div>
                <DepartureStrip times={raw.departureTimes} />
            </div>

            {/* Service IDs */}
            <div>
                <div className="atlas-label text-[8px] mb-2">Contributing Service IDs</div>
                <ServiceIdBadges serviceIds={raw.serviceIds} warnings={raw.warnings} />
            </div>

            {/* Departure list + timeline side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <div className="atlas-label text-[8px] mb-2 flex items-center gap-1.5">
                        <List className="w-3 h-3" /> All Departures
                    </div>
                    <div className="precision-panel overflow-hidden">
                        <DepartureList
                            departureTimes={raw.departureTimes}
                            gaps={raw.gaps}
                            tierThreshold={tierThreshold}
                        />
                    </div>
                </div>
                <div>
                    <div className="atlas-label text-[8px] mb-2 flex items-center gap-1.5">
                        <BarChart3 className="w-3 h-3" /> Headway Chart
                    </div>
                    <div className="precision-panel p-4">
                        <HeadwayTimeline
                            times={raw.departureTimes}
                            gaps={raw.gaps}
                            tierThreshold={tierThreshold}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Verification Controls — Mark Verified / Flag / Skip
// ---------------------------------------------------------------------------

const VerificationPanel: React.FC<{
    routeId: string | null;
    currentStatus: VerificationStatus | null;
    verifiedAt?: number;
    notes?: string;
}> = ({ routeId, currentStatus, verifiedAt, notes: existingNotes }) => {
    const updateVerification = useCatalogStore(s => s.updateVerification);
    const [showNotes, setShowNotes] = useState(false);
    const [notesText, setNotesText] = useState(existingNotes || '');
    const [saving, setSaving] = useState(false);

    if (!routeId) {
        return (
            <div className="precision-panel p-4 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <Info className="w-4 h-4 shrink-0" />
                <span>Commit this feed to the catalog to enable route verification.</span>
            </div>
        );
    }

    const handleVerify = async (status: VerificationStatus) => {
        setSaving(true);
        try {
            await updateVerification(routeId, status, status === 'flagged' ? notesText : undefined);
        } finally {
            setSaving(false);
        }
    };

    const statusConfig: Record<VerificationStatus, { icon: React.ReactNode; label: string; color: string; bg: string; border: string }> = {
        verified: { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Verified', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
        flagged: { icon: <Flag className="w-4 h-4" />, label: 'Flagged', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
        skipped: { icon: <SkipForward className="w-4 h-4" />, label: 'Skipped', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
        unreviewed: { icon: <Clock className="w-4 h-4" />, label: 'Unreviewed', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    };

    const current = currentStatus ? statusConfig[currentStatus] : statusConfig.unreviewed;

    return (
        <div className="precision-panel p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`${current.color}`}>{current.icon}</span>
                    <span className="atlas-label text-[9px]">Verification</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${current.bg} ${current.color} border ${current.border}`}>
                        {current.label}
                    </span>
                    {verifiedAt && (
                        <span className="text-[9px] text-[var(--text-muted)] atlas-mono ml-1">
                            {new Date(verifiedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleVerify('verified')}
                    disabled={saving || currentStatus === 'verified'}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border ${currentStatus === 'verified'
                        ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 cursor-default'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:text-emerald-500 hover:border-emerald-500/30 hover:bg-emerald-500/5'
                    }`}
                >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                </button>
                <button
                    onClick={() => { setShowNotes(true); }}
                    disabled={saving}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border ${currentStatus === 'flagged'
                        ? 'bg-red-500/20 text-red-500 border-red-500/40'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/5'
                    }`}
                >
                    <Flag className="w-3.5 h-3.5" /> Flag
                </button>
                <button
                    onClick={() => handleVerify('skipped')}
                    disabled={saving || currentStatus === 'skipped'}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border ${currentStatus === 'skipped'
                        ? 'bg-slate-500/20 text-slate-400 border-slate-500/40 cursor-default'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:text-slate-400 hover:border-slate-500/30 hover:bg-slate-500/5'
                    }`}
                >
                    <SkipForward className="w-3.5 h-3.5" /> Skip
                </button>
                {currentStatus && currentStatus !== 'unreviewed' && (
                    <button
                        onClick={() => handleVerify('unreviewed')}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border border-[var(--border)] text-[var(--text-muted)] hover:text-amber-500 hover:border-amber-500/30 ml-auto"
                    >
                        Reset
                    </button>
                )}
            </div>

            {/* Flag notes input */}
            {showNotes && (
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-red-500 shrink-0" />
                    <input
                        type="text"
                        value={notesText}
                        onChange={e => setNotesText(e.target.value)}
                        placeholder="What's wrong with this data?"
                        className="flex-1 px-3 py-2 bg-[var(--item-bg)] border border-red-500/20 rounded-lg text-xs focus:outline-none focus:border-red-500/50"
                        onKeyDown={e => { if (e.key === 'Enter') { handleVerify('flagged'); setShowNotes(false); } }}
                    />
                    <button
                        onClick={() => { handleVerify('flagged'); setShowNotes(false); }}
                        className="px-3 py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg text-[10px] font-bold hover:bg-red-500/20 transition-colors"
                    >
                        Submit
                    </button>
                </div>
            )}

            {/* Existing notes display */}
            {existingNotes && currentStatus === 'flagged' && !showNotes && (
                <div className="flex items-start gap-2 px-3 py-2 bg-red-500/5 border border-red-500/10 rounded-lg text-xs text-red-400">
                    <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{existingNotes}</span>
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

export const RouteDetailModal: React.FC<RouteDetailModalProps> = ({ isOpen, onClose, result }) => {
    const rawDepartures = useTransitStore(s => s.rawDepartures);
    const activeCriteria = useTransitStore(s => s.activeCriteria);
    const currentRoutes = useCatalogStore(s => s.currentRoutes);
    const [activeTab, setActiveTab] = useState<'summary' | 'audit'>('summary');
    const [selectedDay, setSelectedDay] = useState<DayName | null>(null);

    // Find this route in the catalog (if committed)
    const catalogRoute = useMemo(() => {
        if (!result) return null;
        return currentRoutes.find(
            r => r.route === result.route && r.dir === result.dir && r.dayType === result.day
        ) || null;
    }, [currentRoutes, result]);

    // Get the raw departures for this route/direction
    const matchingRaw = useMemo(() => {
        if (!result) return [];
        return rawDepartures.filter(
            r => r.route === result.route && r.dir === result.dir
        );
    }, [rawDepartures, result]);

    // Filter to relevant days based on the result's day type
    const relevantDays = useMemo(() => {
        if (!result) return [];
        const dayType = result.day; // 'Weekday' | 'Saturday' | 'Sunday'
        if (dayType === 'Weekday') return WEEKDAYS;
        if (dayType === 'Saturday') return ['Saturday' as DayName];
        if (dayType === 'Sunday') return ['Sunday' as DayName];
        return ALL_DAYS;
    }, [result]);

    const dayRawMap = useMemo(() => {
        const map = new Map<DayName, RawRouteDepartures>();
        for (const raw of matchingRaw) {
            map.set(raw.day, raw);
        }
        return map;
    }, [matchingRaw]);

    // Auto-select first available day
    const effectiveDay = selectedDay && dayRawMap.has(selectedDay) ? selectedDay : relevantDays.find(d => dayRawMap.has(d)) || null;

    // Get tier threshold from the result's tier classification
    const tierThreshold = useMemo(() => {
        if (!result) return null;
        const tierNum = parseInt(result.tier);
        return isNaN(tierNum) ? null : tierNum;
    }, [result]);

    if (!result) return null;

    const reliabilityColor = result.reliabilityScore >= 80 ? 'text-emerald-500' : result.reliabilityScore >= 60 ? 'text-amber-500' : 'text-red-500';
    const currentRaw = effectiveDay ? dayRawMap.get(effectiveDay) : null;

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
                        className="relative w-full max-w-5xl max-h-[90vh] bg-[var(--bg)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    >
                        {/* Header */}
                        <div className="p-8 border-b border-[var(--border)] relative overflow-hidden shrink-0">
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
                                            {result.daysIncluded && result.daysIncluded.length > 0 && (
                                                <span className="text-[9px] text-[var(--text-muted)]">
                                                    ({result.daysIncluded.join(', ')})
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-3xl font-black tracking-tight">
                                            Route Audit
                                        </h2>
                                    </div>
                                </div>
                                <button onClick={onClose} className="p-3 hover:bg-[var(--item-bg)] rounded-2xl transition-all border border-transparent hover:border-[var(--border)]">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Tab switch */}
                            <div className="flex gap-1 bg-[var(--item-bg)] p-1 rounded-xl w-fit mt-6 border border-[var(--border)]">
                                <button
                                    onClick={() => setActiveTab('summary')}
                                    className={`px-5 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'summary'
                                        ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
                                        }`}
                                >
                                    <BarChart3 className="w-3 h-3" /> Summary
                                </button>
                                <button
                                    onClick={() => setActiveTab('audit')}
                                    className={`px-5 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'audit'
                                        ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
                                        }`}
                                >
                                    <List className="w-3 h-3" /> Departure Audit
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg)] custom-scrollbar">
                            {/* Verification Controls */}
                            <div className="mb-6">
                                <VerificationPanel
                                    routeId={catalogRoute?.id || null}
                                    currentStatus={catalogRoute?.verificationStatus || null}
                                    verifiedAt={catalogRoute?.verifiedAt}
                                    notes={catalogRoute?.verificationNotes}
                                />
                            </div>

                            {activeTab === 'summary' ? (
                                /* ====== SUMMARY TAB ====== */
                                <>
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
                                            <div className="mt-2 text-xs text-[var(--text-muted)] uppercase tracking-wider">
                                                Tier: {result.tier}m
                                            </div>
                                        </div>
                                    </div>

                                    {/* Headway Timeline */}
                                    <div className="precision-panel p-8 mb-8">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold flex items-center gap-2">
                                                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                                                    Headway Timeline
                                                </h3>
                                                <p className="text-sm text-[var(--text-muted)]">Gap between consecutive departures. Dashed red line = tier threshold.</p>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex items-center gap-2 text-[10px] atlas-label">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> &le;15m
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] atlas-label">
                                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> &le;30m
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] atlas-label">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> &gt;30m
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] atlas-label">
                                                    <span className="w-2 h-2 rounded-full bg-red-500"></span> Over tier
                                                </div>
                                            </div>
                                        </div>
                                        <HeadwayTimeline times={result.times} gaps={result.gaps} tierThreshold={tierThreshold} />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Service Character */}
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
                                                {result.serviceSpan && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-[var(--text-muted)]">Service Span</span>
                                                        <span className="font-black atlas-mono">{formatTime(result.serviceSpan.start)} – {formatTime(result.serviceSpan.end)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Service IDs & Warnings */}
                                        <div className="precision-panel p-6">
                                            <h4 className="atlas-label mb-4 flex items-center gap-2">
                                                <Info className="w-4 h-4 text-indigo-500" />
                                                Data Provenance
                                            </h4>
                                            {result.serviceIds && result.serviceIds.length > 0 ? (
                                                <ServiceIdBadges serviceIds={result.serviceIds} warnings={result.warnings || []} />
                                            ) : (
                                                <p className="text-sm text-[var(--text-muted)] italic">No service_id data available.</p>
                                            )}
                                            {result.daysIncluded && result.daysIncluded.length > 0 && (
                                                <div className="mt-4">
                                                    <div className="atlas-label text-[8px] mb-2">Days Included in Rollup</div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {result.daysIncluded.map(d => (
                                                            <span key={d} className="text-[9px] font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-md">
                                                                {d.slice(0, 3)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* ====== AUDIT TAB ====== */
                                <>
                                    {matchingRaw.length === 0 ? (
                                        <div className="precision-panel p-12 text-center">
                                            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-4" />
                                            <p className="text-sm text-[var(--text-muted)]">
                                                Raw departure data not available. Re-upload GTFS to populate audit data.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Day selector tabs */}
                                            <div className="flex gap-1 bg-[var(--item-bg)] p-1 rounded-xl w-fit mb-6 border border-[var(--border)]">
                                                {relevantDays.map(day => {
                                                    const raw = dayRawMap.get(day);
                                                    const hasData = !!raw;
                                                    return (
                                                        <button
                                                            key={day}
                                                            onClick={() => hasData && setSelectedDay(day)}
                                                            disabled={!hasData}
                                                            className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${effectiveDay === day
                                                                ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                                                                : hasData
                                                                    ? 'text-[var(--text-muted)] hover:text-[var(--fg)]'
                                                                    : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                                                                }`}
                                                        >
                                                            <Calendar className="w-3 h-3" />
                                                            {day.slice(0, 3)}
                                                            {hasData && (
                                                                <span className="atlas-mono text-[8px] ml-0.5 opacity-60">{raw!.tripCount}</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Tier context */}
                                            {tierThreshold !== null && (
                                                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-xs mb-6">
                                                    <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                    <span className="text-[var(--fg)]">
                                                        Classified tier: <span className="font-black atlas-mono">{tierThreshold}m</span>.
                                                        Gaps exceeding this threshold are highlighted in red.
                                                    </span>
                                                </div>
                                            )}

                                            {/* Day content */}
                                            {currentRaw ? (
                                                <DayDetail raw={currentRaw} tierThreshold={tierThreshold} />
                                            ) : (
                                                <div className="precision-panel p-8 text-center text-sm text-[var(--text-muted)] italic">
                                                    No service on this day.
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-4 bg-[var(--item-bg)] border-t border-[var(--border)] flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2 text-[10px] atlas-label text-[var(--text-muted)]">
                                <AlertTriangle className="w-3 h-3" />
                                Based on uploaded GTFS feed • Verify against published schedules
                            </div>
                            <button onClick={onClose} className="px-6 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs font-bold hover:border-indigo-500/40 transition-colors">
                                Close
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
