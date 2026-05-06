import React from 'react';

interface ModuleIntroProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function ModuleIntro({ title, subtitle, actions }: ModuleIntroProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        {title && <h1 className="module-kicker">{title}</h1>}
        {subtitle && (
          <p className={title ? 'module-subtitle' : 'text-[13px] text-[var(--text-muted)]'}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
