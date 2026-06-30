import React from 'react';
import { getTierColor } from '../../utils/colors';
import type { HeadwayByPeriod, HeadwayByHour } from '../../hooks/useAgencyData';

export function headwayToTierColor(h: number | null | undefined): string {
  if (!h) return getTierColor(null);
  if (h <= 10) return getTierColor('10');
  if (h <= 15) return getTierColor('15');
  if (h <= 20) return getTierColor('20');
  if (h <= 30) return getTierColor('30');
  if (h <= 60) return getTierColor('60');
  return getTierColor('infrequent');
}

// Hours shown: 5 AM through 2 AM next day (GTFS hour 26)
const HOURS = Array.from({ length: 22 }, (_, i) => i + 5);

// Label positions: 6a, 12p, 6p, 12a
const HOUR_LABELS: Record<number, string> = { 6: '6a', 12: '12p', 18: '6p', 24: '12a' };

interface HourlySparklineProps {
  byHour: HeadwayByHour;
}

export function HeadwaySparkline({ byHour }: HourlySparklineProps) {
  const H = 28;
  const valids = HOURS.map(h => byHour[h]).filter((v): v is number => v != null);
  if (valids.length === 0) return null;

  const maxFreq = Math.max(...valids.map(v => 1 / v));
  const minFreq = Math.min(...valids.map(v => 1 / v));

  return (
    <div className="mt-3 mb-4 pt-3 border-t border-[var(--border-primary)]">
      <div className="flex items-end gap-2">
        <span className="text-[9px] font-bold tracking-wider text-[var(--text-muted)] uppercase pb-5 shrink-0">Freq</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-end gap-px">
            {HOURS.map(h => {
              const hw = byHour[h];
              const hasValue = hw != null;
              const freq = hw ? 1 / hw : 0;
              const barH = hasValue
                ? (maxFreq > minFreq
                    ? Math.max(4, Math.round((freq - minFreq) / (maxFreq - minFreq) * (H - 4) + 4))
                    : H)
                : 0;
              return (
                <div key={h} className="flex-1 min-w-0 flex flex-col items-center">
                  <div style={{ height: H }} className="flex items-end justify-center w-full">
                    {hasValue && (
                      <div
                        style={{ height: barH, background: headwayToTierColor(hw) }}
                        className="w-[7px] rounded-sm opacity-90"
                        title={`${h > 24 ? h - 24 : h}${h < 12 || h >= 24 ? 'am' : 'pm'}: ${hw}m`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-px mt-0.5">
            {HOURS.map(h => (
              <div key={h} className="flex-1 min-w-0 text-center">
                {HOUR_LABELS[h] && (
                  <span className="text-[6px] text-[var(--text-dim)]">{HOUR_LABELS[h]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Legacy period-based export kept for any callers that still use it
export type { HeadwayByPeriod };
