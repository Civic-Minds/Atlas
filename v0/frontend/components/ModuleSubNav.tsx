import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface TabDefinition<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

interface ModuleSubNavProps<T extends string> {
  tabs: TabDefinition<T>[];
  activeTab: T;
  onTabChange: (id: T) => void;
  className?: string;
}

export function ModuleSubNav<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: ModuleSubNavProps<T>) {
  return (
    <div className={`flex flex-wrap items-center gap-5 mb-3 border-b border-[var(--border)] ${className}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-2 py-3 text-[11px] font-bold transition-all border-b-2 -mb-px
              ${isActive 
                ? 'text-indigo-600 dark:text-indigo-400 border-indigo-500 bg-indigo-500/5' 
                : 'text-[var(--text-muted)] hover:text-[var(--fg)] border-transparent hover:bg-[var(--item-bg)]'
              }
              px-4
            `}
          >
            {Icon && (
              <Icon
                className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--text-muted)]'}`}
              />
            )}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
