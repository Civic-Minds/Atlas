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
        <header className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 mt-4 p-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border border-white/20 dark:border-slate-800/50 rounded-[2.5rem] shadow-glass relative overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/10 active:scale-[0.995]">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] via-transparent to-emerald-500/[0.03] opacity-100" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />

            <div className="flex items-center gap-6 relative z-10">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">
                        {title}
                        <span className="text-indigo-500">.</span>
                    </h1>
                    <div className="flex items-center gap-3">
                        {badge && (
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border shadow-sm ${badge.color || 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20 shadow-indigo-500/10'}`}>
                                {badge.label}
                            </span>
                        )}
                        {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.1em] opacity-80">{subtitle}</p>}
                    </div>
                </div>
            </div>

            {actions && actions.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 relative z-10">
                    {actions.map((action, i) => {
                        const Icon = action.icon;
                        const isPrimary = action.variant === 'primary';
                        const isGhost = action.variant === 'ghost';

                        return (
                            <button
                                key={i}
                                onClick={action.onClick}
                                className={`
                                    group flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] transition-all duration-300 active:scale-95
                                    ${isPrimary
                                        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 hover:-translate-y-0.5'
                                        : isGhost
                                            ? 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/5'
                                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-400 hover:shadow-lg'
                                    }
                                `}
                            >
                                {Icon && <Icon className={`w-4 h-4 transition-transform duration-500 group-hover:rotate-12 ${isPrimary ? 'text-white' : 'text-indigo-500'}`} />}
                                <span>{action.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
};
