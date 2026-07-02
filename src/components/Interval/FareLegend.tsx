import React from 'react';
import { FARE_TIERS } from '../../utils/colors';
import { FLOATING_CARD } from '../../styles';

interface FareLegendProps {
  className?: string;
}

export default function FareLegend({ className = '' }: FareLegendProps) {
  return (
    <div className={`${FLOATING_CARD} ${className} px-3 py-2.5 pointer-events-auto`}>
      <span className="text-[10px] font-black text-[var(--text-muted)] tracking-wide">Base fare</span>
      <div className="flex flex-col gap-y-1 mt-1.5">
        {FARE_TIERS.map(t => (
          <div key={t.label} className="flex items-center gap-2">
            <span className="w-4 h-[3px] rounded-full shrink-0" style={{ background: t.color }} />
            <span className="text-[11px] font-bold text-[var(--text-primary)]">{t.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-0.5 pt-1.5 border-t border-[var(--border-primary)]">
          <span className="w-4 h-[3px] rounded-full shrink-0 bg-[#6b7280]" />
          <span className="text-[11px] font-bold text-[var(--text-dim)]">unknown</span>
        </div>
      </div>
    </div>
  );
}
