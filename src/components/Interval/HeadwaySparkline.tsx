import React, { useState } from 'react';
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

const PERIOD_HOURS: Record<string, [number, number]> = {
  amPeak:    [6,  9],
  midday:    [9,  15],
  pmPeak:    [15, 19],
  evening:   [19, 23],
  late:      [23, 26],
  overnight: [26, 30],
};

const HOUR_TO_PERIOD: Record<number, string> = {};
for (let h = 5; h < 6; h++) HOUR_TO_PERIOD[h] = 'amPeak';  // hour 5 → snap to amPeak
for (let h = 6; h < 9; h++) HOUR_TO_PERIOD[h] = 'amPeak';
for (let h = 9; h < 15; h++) HOUR_TO_PERIOD[h] = 'midday';
for (let h = 15; h < 19; h++) HOUR_TO_PERIOD[h] = 'pmPeak';
for (let h = 19; h < 23; h++) HOUR_TO_PERIOD[h] = 'evening';
for (let h = 23; h <= 26; h++) HOUR_TO_PERIOD[h] = 'late';

// Pre-compute each period's position as fractions of the chart width
const PERIOD_BANDS: Record<string, { left: number; width: number }> = (() => {
  const raw: Record<string, { start: number; count: number }> = {};
  HOURS.forEach((h, i) => {
    const p = HOUR_TO_PERIOD[h];
    if (!p) return;
    if (!raw[p]) raw[p] = { start: i, count: 0 };
    raw[p].count++;
  });
  const result: Record<string, { left: number; width: number }> = {};
  for (const [p, { start, count }] of Object.entries(raw)) {
    result[p] = { left: start / HOURS.length, width: count / HOURS.length };
  }
  return result;
})();

interface HourlySparklineProps {
  byHour: HeadwayByHour;
  period?: string;
  onPeriodChange?: (period: string) => void;
}

export function HeadwaySparkline({ byHour, period, onPeriodChange }: HourlySparklineProps) {
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<{ hour: number; x: number } | null>(null);

  const H = 28;
  const valids = HOURS.map(h => byHour[h]).filter((v): v is number => v != null);
  if (valids.length === 0) return null;

  const maxFreq = Math.max(...valids.map(v => 1 / v));
  const minFreq = Math.min(...valids.map(v => 1 / v));

  const activePeriodRange = period && period !== 'all' ? PERIOD_HOURS[period] : null;

  const interactive = !!onPeriodChange;

  const posFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.min(Math.floor(fraction * HOURS.length), HOURS.length - 1);
  };

  const handleMouseMove = interactive ? (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.min(Math.floor(fraction * HOURS.length), HOURS.length - 1);
    const hour = HOURS[idx];
    setHoveredPeriod(HOUR_TO_PERIOD[hour] ?? null);
    setHoveredTooltip({ hour, x: fraction });
  } : undefined;

  const handleClick = interactive ? (e: React.MouseEvent<HTMLDivElement>) => {
    const clicked = HOUR_TO_PERIOD[HOURS[posFromEvent(e)]];
    if (clicked) onPeriodChange(period === clicked ? 'all' : clicked);
  } : undefined;

  const handleMouseLeave = interactive ? () => {
    setHoveredPeriod(null);
    setHoveredTooltip(null);
  } : undefined;

  const band = hoveredPeriod ? PERIOD_BANDS[hoveredPeriod] : null;

  const formatHour = (h: number): string => {
    let h24 = h > 24 ? h - 24 : h;
    if (h24 === 24) h24 = 0;
    const ampm = h24 < 12 ? 'AM' : 'PM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12} ${ampm}`;
  };

  return (
    <div className="mt-6 mb-4">
      <div
        className={`relative pt-5 ${interactive ? 'cursor-pointer select-none' : ''}`}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Hover region highlight — visible on light bg */}
        {band && (
          <div
            className="absolute inset-y-0 rounded-sm pointer-events-none"
            style={{
              left: `${band.left * 100}%`,
              width: `${band.width * 100}%`,
              background: 'var(--bg-btn-hover)',
            }}
          />
        )}
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
            const inActivePeriod = activePeriodRange
              ? h >= activePeriodRange[0] && h < activePeriodRange[1]
              : true;
            const inHovered = hoveredPeriod ? HOUR_TO_PERIOD[h] === hoveredPeriod : false;
            const isTooltipHover = hoveredTooltip?.hour === h;
            // Hovered-but-inactive bars show their tier color at reduced opacity as a preview
            const barColor = hasValue
              ? (inActivePeriod || inHovered ? headwayToTierColor(hw) : 'var(--border-primary)')
              : undefined;
            const opacity = !hasValue ? undefined
              : inActivePeriod ? 'opacity-90'
              : inHovered ? 'opacity-60'
              : 'opacity-40';
            return (
              <div key={h} className="flex-1 min-w-0 flex flex-col items-center">
                <div style={{ height: H }} className="flex items-end justify-center w-full">
                  {hasValue && (
                    <div
                      style={{ height: barH, background: barColor }}
                      className={`w-[7px] rounded-sm transition-[background,opacity,transform] duration-75 ${opacity} ${isTooltipHover ? 'scale-y-[1.15] ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-app)]' : ''}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom hover tooltip — replaces ugly native title= */}
        {hoveredTooltip && (() => {
          const hw = byHour[hoveredTooltip.hour];
          if (hw == null) return null;
          return (
            <div
              className="absolute text-[9px] font-bold whitespace-nowrap bg-[var(--bg-header)] border border-[var(--border-primary)] rounded-md px-1.5 py-0.5 pointer-events-none shadow-sm z-10"
              style={{
                left: `${hoveredTooltip.x * 100}%`,
                top: 0,
                transform: 'translate(-50%, -100%)',
              }}
            >
              {formatHour(hoveredTooltip.hour)} · every {hw} min
            </div>
          );
        })()}
      </div>
      <div className="flex gap-px mt-1">
        {HOURS.map(h => (
          <div key={h} className="flex-1 min-w-0 text-center">
            {HOUR_LABELS[h] && (
              <span className="text-[7px] text-[var(--text-dim)]">{HOUR_LABELS[h]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Legacy period-based export kept for any callers that still use it
export type { HeadwayByPeriod };
