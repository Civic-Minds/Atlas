import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Database, ArrowRight, Zap, Target, SlidersHorizontal, Map as MapIcon, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SimulatorTeaser: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="relative flex-1 w-full h-full overflow-hidden bg-[var(--bg)] flex items-center justify-center min-h-[calc(100vh-80px)]">
            {/* Background Map / HUD Mock - Blurred & Dynamic */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-30 dark:opacity-20 select-none">
                {/* Simulated routes overlay */}
                <div className="absolute top-1/4 left-1/4 w-[1200px] h-[800px] -translate-x-1/2 -translate-y-1/2 opacity-20 rotate-[-15deg]">
                    <svg viewBox="0 0 100 100" className="w-full h-full stroke-indigo-500 fill-none" strokeWidth="0.2">
                        <path d="M10,90 Q30,50 60,60 T90,10" className="animate-[dash_6s_linear_infinite]" strokeLinecap="round" strokeDasharray="2 4" />
                        <path d="M20,80 Q40,60 50,40 T80,20" className="stroke-cyan-500 animate-[dash_4s_linear_infinite]" strokeLinecap="round" strokeDasharray="1 3" />
                    </svg>
                </div>

                {/* Tech Gradients & Grid */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[1200px] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)] blur-2xl" />
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage: `linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)`,
                        backgroundSize: '30px 30px'
                    }}
                />
            </div>

            <div className="relative z-10 w-full max-w-[1400px] mx-auto px-8 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                {/* Left side: Premium Copy */}
                <motion.div
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8 backdrop-blur-sm">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Simulator Target Design</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-[900] tracking-[-0.04em] text-[var(--fg)] mb-6 leading-[1.05]">
                        Model reality. <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-400">
                            Predict impact.
                        </span>
                    </h1>

                    <p className="text-lg font-medium text-[var(--text-secondary)] mb-10 max-w-md leading-relaxed">
                        Experiment with network topology changes in a sandboxed, low-latency environment. Upload a GTFS feed to begin executing real-time stop consolidation scenarios and observing service outcomes.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <button
                            onClick={() => navigate('/admin')}
                            className="w-full sm:w-auto group relative flex items-center justify-center gap-3 px-8 py-4 bg-[var(--fg)] text-[var(--bg)] rounded-2xl font-black text-sm uppercase tracking-wider hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(99,102,241,0.2)] hover:shadow-[0_0_60px_rgba(99,102,241,0.4)]"
                        >
                            <Database className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                            <span>Initialize Data</span>
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </motion.div>

                {/* Right side: Mock Interface Showcase */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="relative hidden lg:block"
                >
                    <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 blur-3xl opacity-50 rounded-[3rem]" />
                    <div className="relative rounded-3xl bg-[var(--item-bg)]/80 backdrop-blur-2xl border border-[var(--border)] p-6 shadow-2xl overflow-hidden group">

                        {/* Shimmer effect */}
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg] group-hover:animate-[shimmer_2s_infinite]" />

                        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border)]">
                            <div className="flex items-center gap-3 relative z-10">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                    <Activity className="w-5 h-5 text-indigo-500" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Live Logic</div>
                                    <div className="text-sm font-bold text-[var(--fg)] tracking-tight">Simulator Engine</div>
                                </div>
                            </div>
                            <div className="flex gap-1.5 relative z-10">
                                <div className="w-3 h-3 rounded-full bg-[var(--border)]" />
                                <div className="w-3 h-3 rounded-full bg-[var(--border)]" />
                                <div className="w-3 h-3 rounded-full bg-[var(--border)]" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                            {[
                                { icon: Target, title: 'Consolidation', value: 'Instant', color: 'text-indigo-500', bg: 'bg-indigo-500/10 border-indigo-500/20' },
                                { icon: Zap, title: 'Latency', value: '< 50ms', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
                                { icon: SlidersHorizontal, title: 'Evaluation', value: 'Dynamic', color: 'text-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                                { icon: Layers, title: 'Topology', value: 'High-Res', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                            ].map((stat, i) => (
                                <div key={i} className={`flex flex-col p-4 rounded-2xl bg-[var(--bg)]/50 border ${stat.bg} hover:scale-[1.02] transition-transform`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                                            <stat.icon className={`w-4 h-4 ${stat.color}`} />
                                        </div>
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${stat.color}`}>{stat.title}</span>
                                    </div>
                                    <span className="text-xl font-bold font-mono tracking-tighter text-[var(--fg)]">{stat.value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-transparent border border-indigo-500/20 relative z-10">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[var(--fg)] flex items-center gap-2">
                                    <MapIcon className="w-4 h-4 text-indigo-500" />
                                    Awaiting Network Data
                                </span>
                                <span className="text-[10px] font-mono font-bold tracking-wider text-indigo-500 animate-pulse">STANDBY</span>
                            </div>
                        </div>

                    </div>
                </motion.div>
            </div>
        </div>
    );
};
