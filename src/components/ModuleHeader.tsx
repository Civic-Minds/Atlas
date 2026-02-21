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
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-6">
            <div className="flex items-center gap-4">
                <h1 className="atlas-h2">{title}</h1>
                {badge && (
                    <span className={`atlas-label bg-[var(--item-bg)] border border-[var(--border)] px-3 py-1 rounded-full ${badge.color || ''}`}>
                        {badge.label}
                    </span>
                )}
                {subtitle && <p className="text-sm text-[var(--text-muted)] font-medium">{subtitle}</p>}
            </div>
            {actions && actions.length > 0 && (
                <div className="flex items-center gap-3">
                    {actions.map((action, i) => {
                        const Icon = action.icon;
                        const variantClass = action.variant === 'primary' ? 'btn-primary' : (action.variant === 'ghost' ? 'btn-ghost' : 'btn-secondary');
                        return (
                            <button
                                key={i}
                                onClick={action.onClick}
                                className={variantClass}
                            >
                                {Icon && <Icon className="w-4 h-4" />}
                                {action.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
};
