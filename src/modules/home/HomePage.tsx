import React from 'react';
import { motion } from 'framer-motion';
import {
    Target,
    Map as MapIcon,
    Activity,
    ArrowRight,
    Search,
    TrendingUp,
    Brain,
    Zap,
    FileCheck,
    Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { REPORT_CARDS } from '../report-cards/data/reportCardsData';

import { CityHero } from './components/CityHero';

const FEATURES = [
    {
        id: 'audit',
        title: 'Audit',
        cta: 'Check Metadata',
        description: 'Technical GTFS validation and spec compliance auditing.',
        icon: <FileCheck className="w-5 h-5" />,
        color: 'blue',
        path: '/verifier',
        meta: 'Validation'
    },
    {
        id: 'strategy',
        title: 'Strategy',
        cta: 'Monitor System',
        description: 'Real-time performance monitoring and headway tracking.',
        icon: <Target className="w-5 h-5" />,
        color: 'emerald',
        path: '/strategy',
        meta: 'Real-time'
    },
    {
        id: 'simulate',
        title: 'Simulate',
        cta: 'Generate Reports',
        description: 'Executive performance audits and national peer benchmarking.',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'indigo',
        path: '/simulator',
        meta: 'Audit'
    },
    {
        id: 'predict',
        title: 'Predict',
        cta: 'Model Scenario',
        description: 'Predictive impact of service changes on travel times.',
        icon: <Activity className="w-5 h-5" />,
        color: 'purple',
        path: '/predict',
        meta: 'Analysis'
    },
    {
        id: 'optimize',
        title: 'Optimize',
        cta: 'Explore Gaps',
        description: 'Long-term network growth planning and gap detection.',
        icon: <Zap className="w-5 h-5" />,
        color: 'rose',
        path: '/atlas',
        meta: 'Planning'
    }
];

const COLOR_MAP: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 group-hover:border-emerald-500',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20 group-hover:border-amber-500',
    indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 group-hover:border-indigo-500',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20 group-hover:border-purple-500',
    rose: 'bg-rose-500/10 text-rose-600 border-rose-500/20 group-hover:border-rose-500',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20 group-hover:border-blue-500'
};

const LINE_COLOR_MAP: Record<string, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
    rose: 'bg-rose-500',
    blue: 'bg-blue-500'
};

const WORDS = ['Intelligence', 'Precision', 'Efficiency', 'Visibility'];

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const [wordIndex] = React.useState(() => Math.floor(Math.random() * WORDS.length));

    return (
        <div className="flex-1 flex flex-col relative w-full overflow-x-hidden">
            <CityHero />

            <div className="px-8 py-12 md:py-20 max-w-7xl mx-auto w-full relative z-10">
                <div className="mb-12">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    >

                        <h1 className="text-6xl md:text-[7rem] font-black tracking-tighter text-slate-950 dark:text-white leading-[0.85] mb-10">
                            Modern Transit <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-br from-indigo-500 via-indigo-600 to-emerald-500 drop-shadow-sm">
                                <motion.span
                                    key={WORDS[wordIndex]}
                                    initial={{ opacity: 0, y: 20, rotateX: -90 }}
                                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                                    exit={{ opacity: 0, y: -20, rotateX: 90 }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    className="inline-block origin-bottom"
                                >
                                    {WORDS[wordIndex]}
                                </motion.span>
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed font-medium mb-0 opacity-80">
                            Architecting the next generation of urban mobility through better data and bolder network strategy.
                        </p>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 relative z-10">
                    {FEATURES.map((feature, idx) => (
                        <motion.button
                            key={feature.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                            onClick={() => navigate(feature.path)}
                            className="group relative flex flex-col h-[400px] precision-card p-8 text-left hover:bg-[var(--panel)] transition-all overflow-hidden border-[var(--border)] hover:border-transparent"
                        >
                            <div className="flex flex-col gap-6 mb-8">
                                <div className="flex items-center justify-between">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 border ${COLOR_MAP[feature.color] || 'bg-[var(--item-bg)] text-[var(--text-primary)] border-[var(--border)]'}`}>
                                        {feature.icon}
                                    </div>
                                    <span className="atlas-mono text-[10px] text-[var(--text-muted)] opacity-60">
                                        {feature.meta}
                                    </span>
                                </div>
                                <h3 className="atlas-h3">
                                    {feature.title}
                                </h3>
                            </div>

                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-8 flex-1">
                                {feature.description}
                            </p>

                            {/* Graphic Placeholder - Precise line work */}
                            <div className="relative h-24 mb-6 border-l border-b border-[var(--border)] opacity-20 group-hover:opacity-100 transition-opacity">
                                <div className="absolute bottom-0 left-0 w-full h-full p-2 flex flex-col justify-end gap-1.5">
                                    <div className={`h-1.5 ${LINE_COLOR_MAP[feature.color]} opacity-60`} style={{ width: '40%' }} />
                                    <div className="h-1.5 bg-[var(--text-muted)] opacity-20" style={{ width: '70%' }} />
                                    <div className={`h-1.5 ${LINE_COLOR_MAP[feature.color]} opacity-40`} style={{ width: '25%' }} />
                                </div>
                            </div>

                            <div className="flex justify-between items-center mt-auto">
                                <span className="atlas-label text-[9px] group-hover:text-[var(--accent-primary)] transition-colors">
                                    {feature.cta}
                                </span>
                                <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] group-hover:translate-x-1 transition-all" />
                            </div>

                            {/* Hover edge indicator */}
                            <div className={`absolute top-0 right-0 w-1 h-full ${LINE_COLOR_MAP[feature.color]} opacity-0 group-hover:opacity-100 transition-opacity`} />
                        </motion.button>
                    ))}
                </div>

                <footer className="mt-40 pt-16 border-t border-[var(--border)]">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
                        <div className="col-span-1 md:col-span-3">
                            <div className="flex items-center gap-1.5 mb-6">
                                <span className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
                                    Atlas
                                </span>
                                <span className="text-[20px] font-medium tracking-normal text-[var(--text-muted)]">
                                    by Civic Minds
                                </span>
                            </div>
                            <p className="text-[13px] text-[var(--text-secondary)] max-w-sm font-medium leading-relaxed">
                                Intelligence for Mobility
                            </p>
                        </div>
                        <div className="flex flex-col gap-4">
                            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Platform</span>
                            <div className="flex flex-col gap-4">
                                {FEATURES.map(f => (
                                    <button key={f.id} onClick={() => navigate(f.path)} className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-left font-medium">
                                        {f.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-4">
                            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Resources</span>
                            <div className="flex flex-col gap-4">
                                <button className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-left font-medium">
                                    Docs
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-center gap-8 py-8 border-t border-[var(--border)]">
                        <div className="flex items-center">
                            <div className="text-[11px] text-[var(--text-muted)] font-medium leading-none">
                                © 2026 Civic Minds
                            </div>
                        </div>
                        <div className="flex gap-8">
                            <button className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Privacy Policy</button>
                            <button className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Terms of Service</button>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default HomePage;
