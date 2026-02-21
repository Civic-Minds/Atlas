import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ExternalLink, Users, Bus, DollarSign, Activity } from 'lucide-react';
import { REPORT_CARDS, AgencyReportCard } from './data/reportCardsData';
import './ReportCards.css';

const AgencyCard: React.FC<{ agency: AgencyReportCard }> = ({ agency }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="agency-card flex flex-col"
        >
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-2xl font-black tracking-tight text-[var(--fg)]">{agency.name}</h3>
                    <p className="text-sm text-[var(--text-muted)] font-medium">{agency.city}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <FileText className="w-5 h-5" />
                </div>
            </div>

            <div className="space-y-1">
                <div className="metric-row">
                    <div className="flex items-center gap-2">
                        <Bus className="w-4 h-4 text-indigo-500" />
                        <span className="metric-label">Fleet Size</span>
                    </div>
                    <span className="metric-value">{agency.metrics.fleetSize.toLocaleString()} Vehicles</span>
                </div>
                <div className="metric-row">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-500" />
                        <span className="metric-label">Staffing (total)</span>
                    </div>
                    <span className="metric-value">{agency.metrics.headcount.total.toLocaleString()} Staff</span>
                </div>
                <div className="metric-row">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-indigo-500" />
                        <span className="metric-label">Recent Bus Cost</span>
                    </div>
                    <span className="metric-value">${(agency.metrics.procurement.recentBusCost / 1000000).toFixed(1)}M</span>
                </div>
                <div className="metric-row">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        <span className="metric-label">Cost / Rev Hr</span>
                    </div>
                    <span className="metric-value">${agency.metrics.efficiency.costPerRevenueHour}</span>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[var(--border)]">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Verified Sources</h4>
                <div className="flex flex-wrap gap-2">
                    {agency.sources.map((source, idx) => (
                        <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="source-tag hover:bg-indigo-500/20 transition-colors"
                        >
                            {source.label} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

const ReportCardsView: React.FC = () => {
    return (
        <div className="report-cards-container overflow-y-auto">
            <header className="report-cards-header">
                <div className="max-w-7xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 border border-emerald-500/20">
                        Public Transparency Layer
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-[var(--fg)] mb-4">
                        Transit <span className="text-indigo-600 dark:text-indigo-400">Report Cards</span>
                    </h1>
                    <p className="text-lg text-[var(--text-muted)] max-w-2xl font-medium opacity-70">
                        Granular, verifiable data on North American transit agencies. Sourced from procurement records, board minutes, and budget documents.
                    </p>
                </div>
            </header>

            <main className="max-w-7xl mx-auto w-full">
                <div className="report-cards-grid">
                    {REPORT_CARDS.map(agency => (
                        <AgencyCard key={agency.id} agency={agency} />
                    ))}
                </div>
            </main>
        </div>
    );
};

export default ReportCardsView;
