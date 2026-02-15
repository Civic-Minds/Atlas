import React from 'react';
import { motion } from 'framer-motion';
import {
    Zap,
    Target,
    Map as MapIcon,
    Activity,
    ArrowRight,
    Brain
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
    {
        id: 'screener',
        title: 'Screen',
        cta: 'Open Screen',
        description: 'Automated GTFS analysis and route tiering.',
        icon: <Zap className="w-6 h-6" />,
        color: 'emerald',
        path: '/screener',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-emerald-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        {/* Unified Grid */}
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />

                        {/* Routes (Primary Paths) */}
                        <path d="M 40 20 L 40 160" strokeWidth="1.5" opacity="0.1" />
                        <path d="M 10 70 L 190 70" strokeWidth="1.5" opacity="0.2" />
                        <path d="M 10 130 L 190 130" strokeWidth="1.5" opacity="0.2" />

                        {/* Bus: Turning Path (Snap Turn) */}
                        <motion.g
                            initial={{ x: 40, y: 20, rotate: 90 }}
                            animate={{
                                x: [40, 40, 40, 190],
                                y: [20, 70, 70, 70],
                                rotate: [90, 90, 0, 0]
                            }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear", times: [0, 0.25, 0.26, 1] }}
                        >
                            <rect x="-9" y="-4.5" width="18" height="9" rx="2" fill="currentColor" />
                            <rect x="-7" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="-2" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="3" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                        </motion.g>

                        {/* Train: Straight Fast Path */}
                        <motion.g
                            animate={{ x: [-20, 220] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                        >
                            <g transform="translate(0, 130)">
                                <rect x="-17" y="-4" width="10" height="8" rx="1" fill="currentColor" />
                                <rect x="-15" y="-2.5" width="6" height="4" rx="0.5" fill="#fff" opacity="0.4" />
                                <rect x="-5" y="-4" width="10" height="8" rx="1" fill="currentColor" />
                                <rect x="-3" y="-2.5" width="6" height="4" rx="0.5" fill="#fff" opacity="0.4" />
                                <rect x="7" y="-4" width="10" height="8" rx="1" fill="currentColor" />
                                <rect x="9" y="-2.5" width="6" height="4" rx="0.5" fill="#fff" opacity="0.4" />
                            </g>
                        </motion.g>

                        {/* Ambient Particles */}
                        {[...Array(5)].map((_, i) => (
                            <motion.circle key={i} r="1" fill="currentColor" opacity="0.05"
                                animate={{ x: [20 + i * 30, 40 + i * 30], y: [40 + (i % 3) * 40, 60 + (i % 3) * 40], opacity: [0, 0.1, 0] }}
                                transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                            />
                        ))}
                    </g>
                </svg>
            </div>
        )
    },
    {
        id: 'verifier',
        title: 'Verify',
        cta: 'Open Verify',
        description: 'Human-in-the-loop verification game.',
        icon: <Target className="w-6 h-6" />,
        color: 'amber',
        path: '/verifier',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-amber-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        {/* Unified Grid */}
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />

                        {/* Nodes (Standardized Geometry) */}
                        <g opacity="0.3">
                            <circle cx="60" cy="90" r="10" strokeDasharray="3 3" />
                            <circle cx="60" cy="90" r="3" fill="currentColor" />
                        </g>

                        {/* Corrected Node with Pulsed Ping */}
                        <g transform="translate(140, 90)">
                            <circle r="18" strokeWidth="1" opacity="0.1" />
                            <motion.circle r="16" strokeWidth="1.5" animate={{ opacity: [0.1, 0.4, 0.1], scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                            <circle r="6" fill="currentColor" />
                            {/* Target Pings */}
                            <motion.circle r="25" stroke="currentColor" strokeWidth="1" animate={{ scale: [0.8, 1.5], opacity: [0.3, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
                        </g>

                        {/* Standard Transition Arrow */}
                        <motion.path d="M 85 90 L 115 90" strokeWidth="1.5" strokeLinecap="round" animate={{ x: [0, 5, 0] }} transition={{ duration: 2, repeat: Infinity }} />
                        <path d="M 110 85 L 115 90 L 110 95" strokeWidth="1.5" strokeLinecap="round" />

                        {/* Standard HUD Success Mark */}
                        <motion.path
                            d="M 130 65 L 140 75 L 165 50"
                            stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 3 }}
                        />
                    </g>
                </svg>
            </div>
        )
    },
    {
        id: 'simulator',
        title: 'Simulate',
        cta: 'Open Simulate',
        description: 'Stop consolidation and performance modeling.',
        icon: <Activity className="w-6 h-6" />,
        color: 'indigo',
        path: '/simulator',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-indigo-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        {/* Unified Grid */}
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />

                        {/* Route Path */}
                        <path d="M 20 90 L 180 90" strokeWidth="1.5" opacity="0.1" strokeDasharray="4 4" />

                        {/* Standard "X" Marks (Redesigned for Cohesion) */}
                        <g opacity="0.3">
                            <path d="M 45 85 L 55 95 M 55 85 L 45 95" strokeWidth="1" />
                            <path d="M 85 85 L 95 95 M 95 85 L 85 95" strokeWidth="1" />
                            <path d="M 155 85 L 165 95 M 165 85 L 155 95" strokeWidth="1" />
                        </g>

                        {/* Standard Consolidated Hub */}
                        <g transform="translate(120, 90)">
                            <motion.circle r="14" strokeWidth="1" opacity="0.2" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 3, repeat: Infinity }} />
                            <circle r="6" fill="currentColor" />
                        </g>

                        {/* Standard Bus with Motion Trail */}
                        <motion.g
                            initial={{ x: 20, y: 90 }}
                            animate={{ x: [20, 180] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "anticipate" }}
                        >
                            <rect x="-9" y="-4.5" width="18" height="9" rx="2" fill="currentColor" />
                            <rect x="-7" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="-2" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="3" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            {/* Motion Blur */}
                            <motion.rect x="-25" y="-3.5" width="15" height="7" rx="2" fill="currentColor" opacity="0.1" />
                        </motion.g>
                    </g>
                </svg>
            </div>
        )
    },
    {
        id: 'optimize',
        title: 'Optimize',
        cta: 'Open Optimize',
        description: 'Generative AI for network redesign.',
        icon: <Brain className="w-6 h-6" />,
        color: 'purple',
        path: '/optimize',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-purple-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        {/* Unified Grid */}
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />

                        {/* Standardized Neural Hub */}
                        <g transform="translate(100, 90)">
                            <motion.circle r="35" opacity="0.05" fill="currentColor" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 4, repeat: Infinity }} />
                            <circle r="20" strokeWidth="1.5" opacity="0.2" />
                            <motion.circle r="20" strokeWidth="1.5" strokeDasharray="5 5" animate={{ rotate: 360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} />
                            <circle r="8" fill="currentColor" />
                        </g>

                        {/* Standardized Convergence Particles */}
                        {[...Array(8)].map((_, i) => (
                            <motion.path
                                key={i}
                                d={`M ${100 + Math.cos(i * 45) * 80} ${90 + Math.sin(i * 45) * 80} L 100 90`}
                                strokeWidth="1" opacity="0.1" strokeDasharray="3 3"
                                animate={{ strokeDashoffset: [10, 0], opacity: [0.1, 0.3, 0.1] }}
                                transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                            />
                        ))}
                    </g>
                </svg>
            </div>
        )
    },
    {
        id: 'atlas',
        title: 'Atlas',
        cta: 'Explore Atlas',
        description: 'National longitudinal database viewer.',
        icon: <MapIcon className="w-6 h-6" />,
        color: 'rose',
        path: '/atlas',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-rose-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        {/* Unified Grid */}
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />

                        {/* Standardized Wandering Bus (Snap Turn) */}
                        <motion.g
                            initial={{ x: 80, y: 80, rotate: 0 }}
                            animate={{
                                x: [80, 160, 160, 80, 80],
                                y: [80, 80, 160, 160, 80],
                                rotate: [0, 0, 90, 90, 0]
                            }}
                            transition={{ duration: 12, repeat: Infinity, ease: "linear", times: [0, 0.3, 0.31, 0.7, 0.71, 1] }}
                        >
                            <rect x="-9" y="-4.5" width="18" height="9" rx="2" fill="currentColor" />
                            <rect x="-7" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="-2" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="3" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                        </motion.g>

                        {/* Standardized Isochrones */}
                        <g transform="translate(120, 120)">
                            <circle r="40" opacity="0.05" strokeWidth="1.5" />
                            <motion.circle r="25" opacity="0.1" strokeWidth="1.5" animate={{ scale: [0.95, 1.05, 0.95] }} transition={{ duration: 4, repeat: Infinity }} />
                            <circle r="8" fill="currentColor" />
                        </g>

                        {/* Standardized Ambient Pings */}
                        <motion.circle cx="40" cy="40" r="2" fill="currentColor" animate={{ opacity: [0, 0.2, 0] }} transition={{ duration: 2, repeat: Infinity }} />
                        <motion.circle cx="160" cy="40" r="2" fill="currentColor" animate={{ opacity: [0, 0.2, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} />
                    </g>
                </svg>
            </div>
        )
    }
];

const WORDS = ['intelligence', 'precision', 'efficiency', 'visibility'];

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const [wordIndex, setWordIndex] = React.useState(0);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev) => (prev + 1) % WORDS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex-1 flex flex-col px-6 py-12 md:py-24 max-w-7xl mx-auto w-full">
            <div className="mb-24 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <h1 className="atlas-h1 mb-8 text-5xl md:text-8xl leading-tight font-black tracking-tighter">
                        Modern transit <br className="hidden md:block" />
                        <span className="relative inline-block text-indigo-600 dark:text-indigo-400 min-w-[300px] md:min-w-[600px]">
                            <motion.span
                                key={WORDS[wordIndex]}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.5 }}
                                className="inline-block"
                            >
                                {WORDS[wordIndex]}
                            </motion.span>
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-[var(--text-muted)] max-w-3xl leading-relaxed mx-auto font-medium opacity-70">
                        High-precision tools for GTFS analysis, stop consolidation, and network performance modeling—built for the next generation of urban planning.
                    </p>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
                {FEATURES.map((feature, idx) => (
                    <motion.button
                        key={feature.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: idx * 0.1, ease: "easeOut" }}
                        onClick={() => navigate(feature.path)}
                        className="group relative bg-[var(--card)] border border-[var(--border)] rounded-[2.5rem] text-left flex flex-col h-[340px] hover:border-indigo-500/30 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all duration-700 overflow-hidden cursor-pointer p-6"
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`w-12 h-12 rounded-2xl bg-${feature.color}-500/10 flex items-center justify-center text-${feature.color}-600 dark:text-${feature.color}-400 border border-${feature.color}-500/20 group-hover:scale-110 transition-all duration-500`}>
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-black tracking-tight text-[var(--fg)]">
                                {feature.title}
                            </h3>
                        </div>

                        <p className="text-[14px] text-[var(--text-muted)] leading-relaxed mb-4 font-medium opacity-80">
                            {feature.description}
                        </p>

                        <div className="flex-1 w-full relative mb-2 flex items-center justify-center overflow-hidden">
                            <div className="w-full h-full transform group-hover:scale-110 transition-transform duration-1000 opacity-100">
                                {feature.graphic}
                            </div>
                        </div>

                        <div className="flex justify-end items-center gap-3 mt-auto group/cta">
                            <span className={`text-[10px] font-black tracking-[0.2em] uppercase text-${feature.color}-500 dark:text-${feature.color}-400`}>
                                {feature.cta}
                            </span>
                            <ArrowRight className={`w-4 h-4 text-${feature.color}-500 dark:text-${feature.color}-400 group-hover/cta:translate-x-2 transition-transform duration-300`} />
                        </div>
                    </motion.button>
                ))}
            </div>

            <footer className="mt-40 pt-16 border-t border-[var(--border)]">
                <div className="flex flex-col md:flex-row justify-between items-center gap-12 px-4">
                    <div className="text-sm font-bold tracking-widest text-[var(--text-muted)] opacity-40">
                        © 2026 civic minds <span className="mx-4 text-[var(--border)]">•</span> intelligence for mobility
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
