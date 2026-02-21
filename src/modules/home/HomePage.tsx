import React from 'react';
import { motion } from 'framer-motion';
import {
    Zap,
    Target,
    Map as MapIcon,
    Activity,
    ArrowRight,
    Brain,
    LayoutGrid
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
    {
        id: 'screener',
        title: 'Screen',
        cta: 'Open Screen',
        description: 'Automated GTFS analysis and route tiering.',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" opacity="0.2" />
                <path d="M3 12h18M12 3v18" opacity="0.2" />
                <path d="M7 16V8l5 8V8l5 8" />
            </svg>
        ),
        color: 'emerald',
        path: '/screener',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-emerald-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />
                        <path d="M 40 10 L 40 170" strokeWidth="1.5" opacity="0.1" />
                        <path d="M 120 10 L 120 170" strokeWidth="1.5" opacity="0.1" />
                        <path d="M 10 70 L 190 70" strokeWidth="1.5" opacity="0.15" />
                        <path d="M 10 120 L 190 120" strokeWidth="1.5" opacity="0.15" />
                        <path d="M 10 170 L 190 170" strokeWidth="1.5" opacity="0.15" />

                        {/* Bus Route 1: North to East (Constant 25px/s) */}
                        <motion.g
                            initial={{ x: 40, y: 0, rotate: 90, opacity: 0 }}
                            animate={{
                                x: [40, 40, 40, 40, 200, 200],
                                y: [0, 5, 70, 70, 70, 70],
                                rotate: [90, 90, 90, 0, 0, 0],
                                opacity: [0, 1, 1, 1, 1, 0]
                            }}
                            transition={{
                                duration: 9.4,
                                repeat: Infinity,
                                repeatDelay: 6,
                                ease: "linear",
                                times: [0, 0.021, 0.297, 0.319, 0.979, 1]
                            }}
                        >
                            <rect x="-9" y="-4.5" width="18" height="9" rx="2" fill="currentColor" />
                            <rect x="-7" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="-2" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="3" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                        </motion.g>

                        {/* Bus Route 2: East to South (Constant 25px/s) */}
                        <motion.g
                            initial={{ x: 200, y: 120, rotate: 180, opacity: 0 }}
                            animate={{
                                x: [200, 195, 120, 120, 120, 120],
                                y: [120, 120, 120, 120, 150, 150],
                                rotate: [180, 180, 180, 90, 90, 90],
                                opacity: [0, 1, 1, 1, 1, 0]
                            }}
                            transition={{
                                duration: 4.6,
                                repeat: Infinity,
                                repeatDelay: 8,
                                delay: 6,
                                ease: "linear",
                                times: [0, 0.043, 0.695, 0.739, 0.957, 1]
                            }}
                        >
                            <rect x="-9" y="-4.5" width="18" height="9" rx="2" fill="currentColor" />
                            <rect x="-7" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="-2" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                            <rect x="3" y="-2" width="4" height="4" rx="0.5" fill="#fff" opacity="0.9" />
                        </motion.g>

                        {/* Train: Dedicated Bottom Corridor (No Collision with Bus) */}
                        {[0, 1].map((i) => (
                            <motion.g
                                key={i}
                                animate={{ x: [-80, 280], opacity: [0, 1, 1, 0] }}
                                transition={{
                                    duration: 5,
                                    repeat: Infinity,
                                    repeatDelay: 7,
                                    delay: i * 6,
                                    ease: "linear",
                                    times: [0, 0.05, 0.95, 1]
                                }}
                            >
                                <g transform="translate(0, 170)">
                                    <rect x="-17" y="-4" width="10" height="8" rx="1" fill="currentColor" />
                                    <rect x="-15" y="-2.5" width="6" height="4" rx="0.5" fill="#fff" opacity="0.4" />
                                    <rect x="-5" y="-4" width="10" height="8" rx="1" fill="currentColor" />
                                    <rect x="-3" y="-2.5" width="6" height="4" rx="0.5" fill="#fff" opacity="0.4" />
                                    <rect x="7" y="-4" width="10" height="8" rx="1" fill="currentColor" />
                                    <rect x="9" y="-2.5" width="6" height="4" rx="0.5" fill="#fff" opacity="0.4" />
                                </g>
                            </motion.g>
                        ))}

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
        icon: (
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" opacity="0.2" />
                <path d="M8 12l3 3 5-5" />
            </svg>
        ),
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
        icon: (
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12c3-5 6 5 9 0s6-5 9 0" />
                <circle cx="3" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="21" cy="12" r="1.5" fill="currentColor" />
            </svg>
        ),
        color: 'indigo',
        path: '/simulator',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-indigo-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />

                        {/* Simulation Nodes */}
                        <motion.path d="M 40 40 L 160 40 L 160 160 L 40 160 Z" strokeDasharray="4 4" opacity="0.2" animate={{ strokeDashoffset: [0, -8] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />

                        {[40, 100, 160].map((y, i) => (
                            <motion.g
                                key={i}
                                initial={{ x: 20 }}
                                animate={{ x: [20, 180] }}
                                transition={{ duration: 3 + i, repeat: Infinity, ease: "linear" }}
                            >
                                <rect x="-6" y={y - 3} width="12" height="6" rx="1" fill="currentColor" />
                            </motion.g>
                        ))}
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
        icon: (
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" opacity="0.2" />
                <path d="M12 9V5m-4 4L5 6m3 7H4m4 4l-3 3m7-4v4m4-4l3 3m-7-4h4m-4-4l3-3" opacity="0.6" />
                <path d="M12 12l2-2m-2 2l-2 2m2-2l2 2m-2-2l-2-2" strokeWidth="1.5" />
            </svg>
        ),
        color: 'purple',
        path: '/optimize',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-purple-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />
                        <g transform="translate(100, 90)">
                            <motion.circle r="12" strokeWidth="1.5" animate={{ opacity: [0.1, 0.3, 0.1], scale: [1, 1.2, 1] }} transition={{ duration: 3, repeat: Infinity }} />
                            <circle r="4" fill="currentColor" />
                            <motion.path d="M -20 -20 L 20 20 M -20 20 L 20 -20" strokeWidth="1" opacity="0.2" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} />
                        </g>
                    </g>
                </svg>
            </div>
        )
    },
    {
        id: 'explorer',
        title: 'Explorer',
        cta: 'Explore Database',
        description: 'National longitudinal database viewer.',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" opacity="0.1" />
                <path d="M12 3v18M3 12h18" opacity="0.1" />
                <path d="M12 12l4-4m-8 8l4-4" strokeWidth="2.5" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
        ),
        color: 'rose',
        path: '/explorer',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-rose-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <path d="M 0 40 L 200 40 M 0 80 L 200 80 M 0 120 L 200 120 M 0 160 L 200 160" opacity="0.05" />
                        <motion.g transform="translate(100, 90)" animate={{ y: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}>
                            <rect x="-30" y="-15" width="60" height="30" rx="4" fill="currentColor" opacity="0.1" stroke="currentColor" />
                            <rect x="-30" y="-5" width="60" height="30" rx="4" fill="currentColor" opacity="0.2" stroke="currentColor" />
                            <rect x="-30" y="5" width="60" height="30" rx="4" fill="currentColor" opacity="0.3" stroke="currentColor" />
                        </motion.g>
                    </g>
                </svg>
            </div>
        )
    },
    {
        id: 'predict',
        title: 'Predict',
        cta: 'Run Prediction',
        description: 'Identify transit deserts and opportunity zones.',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
        ),
        color: 'blue',
        path: '/predict',
        graphic: (
            <div className="w-full h-full flex items-center justify-center p-2">
                <svg viewBox="0 0 200 180" className="w-full h-full text-blue-500">
                    <g fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M 40 0 L 40 180 M 80 0 L 80 180 M 120 0 L 120 180 M 160 0 L 160 180" opacity="0.05" />
                        <circle cx="100" cy="90" r="40" strokeDasharray="4 4" opacity="0.2" />
                        <motion.circle cx="100" cy="90" r="40" stroke="currentColor" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, repeat: Infinity }} />
                        <motion.path d="M 80 90 L 120 90 M 100 70 L 100 110" stroke="currentColor" strokeWidth="1" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity }} />
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 px-4 mb-16">
                    <div className="flex flex-col gap-4">
                        <h4 className="text-sm font-black text-[var(--fg)] uppercase tracking-wider">Agencies</h4>
                        <div className="flex flex-col gap-2">
                            {FEATURES.map(f => (
                                <button key={f.id} onClick={() => navigate(f.path)} className="text-sm text-[var(--text-muted)] hover:text-indigo-600 transition-colors text-left font-semibold">
                                    {f.title}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-4">
                        <h4 className="text-sm font-black text-[var(--fg)] uppercase tracking-wider">Advocacy</h4>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => navigate('/reports')} className="text-sm text-[var(--text-muted)] hover:text-emerald-600 transition-colors text-left font-semibold">
                                Report Cards
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-12 px-4 py-8 border-t border-[var(--border)]">
                    <div className="text-sm font-bold text-[var(--text-muted)]">
                        © 2026 Civic Minds <span className="mx-4 text-[var(--border)]">•</span> Intelligence For Mobility
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
