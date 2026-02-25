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
    Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { REPORT_CARDS } from '../report-cards/data/reportCardsData';

const FEATURES = [
    {
        id: 'screener',
        title: 'Screen',
        cta: 'Analyze Integrity',
        description: 'Automated GTFS analysis and route tiering.',
        icon: <Target className="w-5 h-5" />,
        color: 'emerald',
        path: '/screener',
        meta: 'Feed Validation'
    },
    {
        id: 'simulator',
        title: 'Simulate',
        cta: 'Model Scenarios',
        description: 'Stop consolidation and performance modeling.',
        icon: <Activity className="w-5 h-5" />,
        color: 'indigo',
        path: '/simulator',
        meta: 'Impact Analysis'
    },
    {
        id: 'optimize',
        title: 'Optimize',
        cta: 'Design Network',
        description: 'Generative AI for network redesign.',
        icon: <Brain className="w-5 h-5" />,
        color: 'purple',
        path: '/optimize',
        meta: 'Generative Design'
    },
    {
        id: 'explorer',
        title: 'Explorer',
        cta: 'Discover Cities',
        description: 'National longitudinal database viewer.',
        icon: <MapIcon className="w-5 h-5" />,
        color: 'rose',
        path: '/explorer',
        meta: `${REPORT_CARDS.length} Cities Indexed`
    },
    {
        id: 'predict',
        title: 'Predict',
        cta: 'Map Opportunities',
        description: 'Identify transit deserts and opportunity zones.',
        icon: <Zap className="w-5 h-5" />,
        color: 'blue',
        path: '/predict',
        meta: 'Gap Detection'
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
    const [wordIndex, setWordIndex] = React.useState(0);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev: number) => (prev + 1) % WORDS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex-1 flex flex-col px-8 py-12 md:py-24 max-w-7xl mx-auto w-full">
            {/* Background Grid - Professional Technical feel */}
            <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            <div className="mb-24">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-px w-8 bg-[var(--accent-primary)]" />
                        <span className="atlas-label tracking-[0.3em] font-black text-[var(--accent-primary)]">Civic Minds Atlas v1.5</span>
                    </div>
                    <h1 className="atlas-h1 mb-10 max-w-4xl">
                        Modern transit <br />
                        <span className="text-[var(--accent-primary)]">
                            <motion.span
                                key={WORDS[wordIndex]}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.4 }}
                                className="inline-block"
                            >
                                {WORDS[wordIndex]}
                            </motion.span>
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-[var(--text-secondary)] max-w-3xl leading-relaxed font-medium">
                        Architecting the next generation of urban mobility through better data and bolder network strategy.
                    </p>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                    <div className="col-span-2">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded bg-[var(--accent-primary)] flex items-center justify-center">
                                <Zap className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold text-[var(--text-primary)]">Atlas</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] max-w-sm font-medium">
                            The professional benchmark for transit integrity and network performance simulation.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4">
                        <span className="atlas-label">Platform</span>
                        <div className="flex flex-col gap-3">
                            {FEATURES.slice(0, 3).map(f => (
                                <button key={f.id} onClick={() => navigate(f.path)} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors text-left font-bold">
                                    {f.title}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-4">
                        <span className="atlas-label">Analysis</span>
                        <div className="flex flex-col gap-3">
                            {FEATURES.slice(3).map(f => (
                                <button key={f.id} onClick={() => navigate(f.path)} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors text-left font-bold">
                                    {f.title}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-8 py-8 border-t border-[var(--border)]">
                    <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest tabular">
                        © 2026 Civic Minds • Intelligence For Mobility
                    </div>
                    <div className="flex gap-8">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-[var(--text-primary)] transition-colors">Privacy Policy</span>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest cursor-pointer hover:text-[var(--text-primary)] transition-colors">Terms of Service</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
