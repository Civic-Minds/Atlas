import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface FeatureHighlight {
    icon: React.ReactNode;
    title: string;
    description: string;
}

interface ModuleLandingProps {
    title: string;
    description: string;
    icon: LucideIcon;
    features: FeatureHighlight[];
}

export const ModuleLanding: React.FC<ModuleLandingProps> = ({
    title,
    description,
    icon: Icon,
    features
}) => {
    return (
        <div className="flex-1 flex flex-col overflow-y-auto bg-[var(--bg)]">
            {/* Full hero section */}
            <div className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
                {/* Decorative background grid */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: `linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)`,
                    backgroundSize: '60px 60px'
                }} />

                {/* Radial glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/[0.04] blur-[100px] pointer-events-none" />

                <div className="relative max-w-4xl mx-auto px-8 text-center">
                    {/* Module label */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        className="mb-6"
                    >
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
                            Atlas Platform
                        </span>
                    </motion.div>

                    {/* Title */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter text-[var(--text-primary)] leading-[0.9] mb-8"
                    >
                        {title}
                    </motion.h1>

                    {/* Description */}
                    <motion.p
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="text-lg md:text-xl text-[var(--text-secondary)] font-medium leading-relaxed max-w-lg mx-auto"
                    >
                        {description}
                    </motion.p>
                </div>
            </div>

            {/* Features section */}
            <div className="relative">
                <div className="max-w-5xl mx-auto px-8 pb-32">
                    {/* Section header */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex items-center gap-6 mb-12"
                    >
                        <div className="h-px flex-1 bg-[var(--border)]" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
                            Capabilities
                        </span>
                        <div className="h-px flex-1 bg-[var(--border)]" />
                    </motion.div>

                    {/* Feature cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border)] rounded-2xl overflow-hidden border border-[var(--border)]">
                        {features.map((feature, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.35 + (idx * 0.08) }}
                                className="bg-[var(--bg)] p-8 md:p-10 group"
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <span className="text-[48px] font-black tracking-tighter text-[var(--border)] leading-none select-none">
                                        {String(idx + 1).padStart(2, '0')}
                                    </span>
                                </div>
                                <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed font-medium">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
