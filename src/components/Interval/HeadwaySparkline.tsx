import React from 'react';
import { getTierColor } from '../../utils/colors';
import type { HeadwayByPeriod } from '../../hooks/useAgencyData';

const SPARKLINE_PERIODS: Array<{ key: keyof HeadwayByPeriod; label: string }> = [
  { key: 'amPeak', label: 'AM' },
  { key: 'midday', label: 'Mid' },
  { key: 'pmPeak', label: 'PM' },
  { key: 'evening', label: 'Eve' },
];

export function headwayToTierColor(h: number | null | undefined): string {
  if (!h) return getTierColor(null);
  if (h <= 10) return getTierColor('10');
  if (h <= 15) return getTierColor('15');
  if (h <= 20) return getTierColor('20');
  if (h <= 30) return getTierColor('30');
  if (h <= 60) return getTierColor('60');
  return getTierColor('infrequent');
}

export function HeadwaySparkline({ byPeriod }: { byPeriod: HeadwayByPeriod }) {
  const values = SPARKLINE_PERIODS.map(p => byPeriod[p.key] ?? null);
  const valids = values.filter((v): v is number => v != null);
  if (valids.length === 0) return null;
  const maxFreq = Math.max(...valids.map(v => 1 / v));
  const minFreq = Math.min(...valids.map(v => 1 / v));
  const H = 26;
  return (
    <div className="mt-3 mb-4 pt-3 border-t border-[var(--border-primary)] flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Service Frequency</span>
        <span className="text-[8px] text-[var(--text-dim)] leading-snug max-w-[125px]">
          Taller bars signify more frequent service (shorter headways).
        </span>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {SPARKLINE_PERIODS.map(({ key, label }) => {
          const h = byPeriod[key];
          const hasValue = !!h;
          const freq = h ? 1 / h : 0;
          const barH = hasValue
            ? (maxFreq > minFreq ? Math.max(6, Math.round((freq - minFreq) / (maxFreq - minFreq) * (H - 6) + 6)) : H)
            : 3;
          const color = hasValue ? headwayToTierColor(h) : 'var(--border-primary)';
          return (
            <div key={key} className="flex flex-col items-center gap-1 shrink-0">
              <div style={{ height: H }} className="flex items-end justify-center w-[14px]">
                <div
                  style={{ height: barH, background: color }}
                  className={`w-2.5 rounded-sm transition-all duration-300 ${hasValue ? 'opacity-90' : 'opacity-25'}`}
                  title={hasValue ? `${label}: ${h} min` : `${label}: No service`}
                />
              </div>
              <span className="text-[7px] font-bold text-[var(--text-dim)] uppercase tracking-wide">
                {label === 'Mid' ? 'MID' : label === 'Eve' ? 'EVE' : label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
