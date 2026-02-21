import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface Feature {
    icon: React.ReactNode;
    title: string;
    desc: string;
}

interface EmptyStateHeroProps {
    icon: LucideIcon;
    title: string;
    description: string;
    primaryAction?: {
        label: string;
        icon: LucideIcon;
        onClick?: () => void;
        href?: string;
    };
    features?: Feature[];
}

export const EmptyStateHero: React.FC<EmptyStateHeroProps> = ({
    icon: Icon,
    title,
    description,
    primaryAction,
    features
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 w-full max-w-7xl mx-auto">
            <div className="text-center mb-16 max-w-2xl">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                >
                    <Icon className="w-16 h-16 text-indigo-500 mx-auto mb-6 opacity-20" />
                    <h2 className="atlas-h1">{title}</h2>
                    <p className="text-lg text-[var(--text-muted)]">{description}</p>
                </motion.div>
            </div>

            {primaryAction && (
                <div className="flex flex-col items-center gap-4 w-full">
                    {primaryAction.href ? (
                        <motion.a
                            href={primaryAction.href}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className="w-full max-w-md p-8 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl shadow-soft hover:border-indigo-500/30 transition-all text-center group"
                        >
                            <primaryAction.icon className="w-8 h-8 mx-auto text-indigo-500 mb-4" />
                            <div className="text-lg font-bold text-[var(--fg)] mb-1">{primaryAction.label}</div>
                            <p className="atlas-label">Initialize Module</p>
                        </motion.a>
                    ) : (
                        <motion.button
                            onClick={primaryAction.onClick}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className="w-full max-w-md p-8 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl shadow-soft hover:border-indigo-500/30 transition-all text-center group"
                        >
                            <primaryAction.icon className="w-8 h-8 mx-auto text-indigo-500 mb-4" />
                            <div className="text-lg font-bold text-[var(--fg)] mb-1">{primaryAction.label}</div>
                            <p className="atlas-label">Initialize Module</p>
                        </motion.button>
                    )}
                </div>
            )}

            {features && features.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl pt-24">
                    {features.map((f, i) => (
                        <div key={i} className="text-center group">
                            <div className="text-indigo-500 w-6 h-6 mx-auto mb-4 opacity-70 group-hover:opacity-100 transition-opacity">{f.icon}</div>
                            <div className="font-bold text-[var(--fg)] mb-2">{f.title}</div>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
