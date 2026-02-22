import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Action {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'ghost';
}

interface ModuleHeaderProps {
    title: string;
    subtitle?: string;
    badge?: {
        label: string;
        color?: string;
    };
    actions?: Action[];
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, subtitle, badge, actions }) => {
    return (
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 mt-4 p-8 bg-[var(--card)]/30 border border-[var(--border)] rounded-[2rem] shadow-tactile relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="flex items-center gap-6 relative z-10">
                <div className="flex flex-col gap-1">
                    <h1 className="atlas-h2 !text-4xl">{title}</h1>
                    <div className="flex items-center gap-3">
                        {badge && (
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20 shadow-sm">
                                {badge.label}
                            </span>
                        )}
                        {subtitle && <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider opacity-60">{subtitle}</p>}
                    </div>
                </div>
            </div>

            {actions && actions.length > 0 && (
                <div className="flex items-center gap-3 relative z-10">
                    {actions.map((action, i) => {
                        const Icon = action.icon;
                        const variantClass = action.variant === 'primary' ? 'btn-primary !px-8 !py-3.5 !rounded-2xl shadow-lg shadow-indigo-500/20' : (action.variant === 'ghost' ? 'btn-ghost' : 'btn-secondary !px-6 !py-3.5 !rounded-2xl shadow-sm');
                        return (
                            <button
                                key={i}
                                onClick={action.onClick}
                                className={variantClass}
                            >
                                {Icon && <Icon className="w-4 h-4" />}
                                <span className="uppercase tracking-widest text-[10px] font-black">{action.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
};
