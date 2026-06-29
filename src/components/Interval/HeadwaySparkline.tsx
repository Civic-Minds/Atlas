import React from 'react';
import { getTierColor } from '../../utils/colors';
import type { HeadwayByPeriod } from '../../hooks/useAgencyData';

const SPARKLINE_PERIODS: Array<{ key: keyof HeadwayByPeriod; label: string }> = [
  { key: 'amPeak',    label: 'AM' },
  { key: 'midday',    label: 'MID' },
  { key: 'pmPeak',    label: 'PM' },
  { key: 'evening',   label: 'EVE' },
  { key: 'lateNight', label: 'NIGHT' },
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
  const H = 28;
  return (
    <div className="mt-3 mb-4 pt-3 border-t border-[var(--border-primary)]">
      <div className="flex items-end gap-3">
        <span className="text-[9px] font-bold tracking-wider text-[var(--text-muted)] uppercase pb-[18px]">Frequency</span>
        <div className="flex gap-2.5">
          {SPARKLINE_PERIODS.map(({ key, label }) => {
            const h = byPeriod[key];
            const hasValue = h != null;
            const freq = h ? 1 / h : 0;
            const barH = hasValue
              ? (maxFreq > minFreq ? Math.max(6, Math.round((freq - minFreq) / (maxFreq - minFreq) * (H - 6) + 6)) : H)
              : 0;
            const color = headwayToTierColor(h);
            return (
              <div key={key} className="flex flex-col items-center gap-0.5 shrink-0">
                <div style={{ height: H }} className="flex items-end justify-center w-[14px]">
                  {hasValue && (
                    <div
                      style={{ height: barH, background: color }}
                      className="w-2.5 rounded-sm transition-all duration-300 opacity-90"
                    />
                  )}
                </div>
                <span className="text-[7px] font-bold text-[var(--text-dim)] tracking-wide">{label}</span>
                <span className="text-[7px] text-[var(--text-dim)]">{hasValue ? `${h}m` : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
