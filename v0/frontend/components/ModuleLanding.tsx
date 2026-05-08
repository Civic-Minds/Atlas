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
            <div className="max-w-3xl mx-auto px-8 py-20 w-full">
                <div className="text-center mb-12">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-4"
                    >
                        <div className="w-14 h-14 rounded-xl bg-[var(--item-bg)] flex items-center justify-center mx-auto mb-6 border border-[var(--border)]">
                            <Icon className="w-6 h-6 text-[var(--text-muted)]" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                            {title}
                        </h1>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
                            {description}
                        </p>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {features.map((feature, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.1 + (idx * 0.05) }}
                            className="p-5 rounded-lg border border-[var(--border)] bg-[var(--item-bg)]/30"
                        >
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                                {feature.title}
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
};
