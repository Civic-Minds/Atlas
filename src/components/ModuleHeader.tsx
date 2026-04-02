import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Action {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'ghost';
}

interface ModuleHeaderProps {
    title?: string;
    subtitle?: string;
    badge?: {
        label: string;
        color?: string;
    };
    actions?: Action[];
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, subtitle, badge, actions }) => {
    return (
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
                {title && (
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">
                        {title}
                    </h1>
                )}
                {badge && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.color || 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20'}`}>
                        {badge.label}
                    </span>
                )}
                {subtitle && <span className="text-xs text-[var(--text-muted)] font-medium">{subtitle}</span>}
            </div>

            {actions && actions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {actions.map((action, i) => {
                        const Icon = action.icon;
                        const isPrimary = action.variant === 'primary';
                        const isGhost = action.variant === 'ghost';

                        return (
                            <button
                                key={i}
                                onClick={action.onClick}
                                className={`
                                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-[11px] transition-colors duration-150
                                    ${isPrimary
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                        : isGhost
                                            ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--item-bg)]'
                                            : 'bg-[var(--item-bg)] text-[var(--text-primary)] border border-[var(--border)] hover:border-indigo-500/40'
                                    }
                                `}
                            >
                                {Icon && <Icon className={`w-3.5 h-3.5 ${isPrimary ? 'text-white' : 'text-[var(--text-muted)]'}`} />}
                                <span>{action.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
};
