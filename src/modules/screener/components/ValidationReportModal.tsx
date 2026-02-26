import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, AlertCircle, Info, CheckCircle2, FileText } from 'lucide-react';
import { ValidationReport, ValidationIssue } from '../../../core/validation';

interface ValidationReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: ValidationReport | null;
}

const SEVERITY_CONFIG = {
    error: {
        icon: AlertCircle,
        label: 'Error',
        bg: 'bg-red-500/10',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-500/20',
        bullet: 'bg-red-500',
    },
    warning: {
        icon: AlertTriangle,
        label: 'Warning',
        bg: 'bg-amber-500/10',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/20',
        bullet: 'bg-amber-500',
    },
    info: {
        icon: Info,
        label: 'Info',
        bg: 'bg-blue-500/10',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-500/20',
        bullet: 'bg-blue-500',
    },
};

function IssueRow({ issue }: { issue: ValidationIssue }) {
    const config = SEVERITY_CONFIG[issue.severity];
    const Icon = config.icon;

    return (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${config.border} ${config.bg}`}>
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.text}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${config.text}`}>
                        {config.label}
                    </span>
                    <span className="text-[9px] font-mono text-[var(--text-muted)]">{issue.code}</span>
                    <span className="text-[9px] font-mono text-[var(--text-muted)]">— {issue.file}</span>
                    {issue.field && (
                        <span className="text-[9px] font-mono text-[var(--text-muted)]">→ {issue.field}</span>
                    )}
                </div>
                <p className="text-sm text-[var(--fg)] font-medium">{issue.message}</p>
                {issue.examples && issue.examples.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {issue.examples.map((ex, i) => (
                            <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--item-bg)] border border-[var(--border)] text-[var(--text-muted)]">
                                {ex}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            {issue.count && issue.count > 1 && (
                <span className="text-[10px] font-bold atlas-mono text-[var(--text-muted)] shrink-0">
                    ×{issue.count.toLocaleString()}
                </span>
            )}
        </div>
    );
}

export function ValidationReportModal({ isOpen, onClose, report }: ValidationReportModalProps) {
    if (!report) return null;

    const isClean = report.totalIssues === 0;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="glass-panel w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isClean ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                                    {isClean
                                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        : <FileText className="w-5 h-5 text-amber-500" />
                                    }
                                </div>
                                <div>
                                    <h2 className="atlas-h2 text-lg">GTFS Validation Report</h2>
                                    <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">
                                        {report.feedName} — {new Date(report.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-[var(--item-bg)] transition-colors"
                            >
                                <X className="w-5 h-5 text-[var(--text-muted)]" />
                            </button>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-4 md:grid-cols-7 gap-px bg-[var(--border)] border-b border-[var(--border)]">
                            {[
                                { label: 'Routes', value: report.summary.routes },
                                { label: 'Trips', value: report.summary.trips.toLocaleString() },
                                { label: 'Stops', value: report.summary.stops.toLocaleString() },
                                { label: 'Stop Times', value: report.summary.stopTimes.toLocaleString() },
                                { label: 'Calendar', value: report.summary.calendarEntries },
                                { label: 'Cal Dates', value: report.summary.calendarDates.toLocaleString() },
                                { label: 'Shapes', value: report.summary.shapes },
                            ].map(stat => (
                                <div key={stat.label} className="bg-[var(--bg)] px-4 py-3 text-center">
                                    <div className="text-sm font-black atlas-mono text-[var(--fg)]">{stat.value}</div>
                                    <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{stat.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Score Bar */}
                        <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] bg-[var(--item-bg)]">
                            {report.errors > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-red-500" />
                                    <span className="text-xs font-bold text-red-600 dark:text-red-400">{report.errors} errors</span>
                                </div>
                            )}
                            {report.warnings > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{report.warnings} warnings</span>
                                </div>
                            )}
                            {report.infos > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{report.infos} info</span>
                                </div>
                            )}
                            {isClean && (
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    ✓ No issues detected — feed is spec-compliant
                                </span>
                            )}
                        </div>

                        {/* Issues List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {report.issues.length === 0 ? (
                                <div className="text-center py-12">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                                    <p className="text-lg font-bold text-[var(--fg)]">Feed looks good!</p>
                                    <p className="text-sm text-[var(--text-muted)] mt-1">
                                        All required files, fields, and references check out.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Errors first, then warnings, then info */}
                                    {report.issues
                                        .sort((a, b) => {
                                            const order = { error: 0, warning: 1, info: 2 };
                                            return order[a.severity] - order[b.severity];
                                        })
                                        .map((issue, i) => (
                                            <IssueRow key={i} issue={issue} />
                                        ))
                                    }
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
