import React from 'react';
import { motion } from 'framer-motion';
import { Brain, ArrowLeft, Sparkles, Cpu, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function OptimizeView() {
    const navigate = useNavigate();

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[var(--bg)]">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl w-full text-center space-y-8"
            >
                <div className="relative inline-block">
                    <div className="w-24 h-24 bg-purple-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-purple-500/20 relative z-10">
                        <Brain className="w-12 h-12 text-purple-500" />
                    </div>
                    <motion.div
                        animate={{
                            scale: [1, 1.2, 1],
                            rotate: [0, 90, 180, 270, 360],
                            opacity: [0.2, 0.5, 0.2]
                        }}
                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full"
                    />
                </div>

                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-600 dark:text-purple-400 text-xs font-bold tracking-widest uppercase">
                        <Sparkles className="w-3 h-3" />
                        Coming Soon
                    </div>
                    <h1 className="atlas-h1 text-4xl md:text-6xl tracking-tight">
                        Generative <span className="text-purple-600 dark:text-purple-400">Optimization</span>
                    </h1>
                    <p className="text-xl text-[var(--text-muted)] leading-relaxed font-medium">
                        The next frontier of network design. Using machine learning to automatically propose "mathematically perfect" grid configurations before adding human nuance.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div className="glass-panel p-6 space-y-3 border-purple-500/10">
                        <Cpu className="w-6 h-6 text-purple-500" />
                        <h3 className="font-bold text-lg">AI-Proposal Engine</h3>
                        <p className="text-sm text-[var(--text-muted)]">Automated generation of least-cost vs. most-coverage scenarios based on regional goals.</p>
                    </div>
                    <div className="glass-panel p-6 space-y-3 border-purple-500/10">
                        <Zap className="w-6 h-6 text-purple-500" />
                        <h3 className="font-bold text-lg">Frequency Balancing</h3>
                        <p className="text-sm text-[var(--text-muted)]">Real-time adjustments to headways to maximize connection reliability across the grid.</p>
                    </div>
                </div>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/')}
                    className="btn-secondary px-8 py-4 rounded-2xl group mx-auto"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Ecosystem
                </motion.button>
            </motion.div>
        </div>
    );
}
