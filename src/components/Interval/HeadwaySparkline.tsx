import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { headwayToTierColor } from '../../utils/colors';
export { headwayToTierColor };
import { periodKeyForHour, isHourInPeriod, SPARKLINE_HOURS, TIME_PERIODS } from '../../../shared/config';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { TimePeriod } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod, HeadwayByHour } from '../../hooks/useAgencyData';

const HOURS = SPARKLINE_HOURS;

// Label positions: 6a, 12p, 6p, 12a
const HOUR_LABELS: Record<number, string> = { 6: '6a', 12: '12p', 18: '6p', 24: '12a' };

// Each bar covers a 90-min window (h:00-(h+1):30), not a strict hour -- see
// docs/ROUTE_SERVICE_METRICS.md's "headwayByHour" section for why. The bar position/label
// reads like a precise hour, so spell out the real window on hover rather than let it imply
// more precision than the underlying data has.
function formatClock(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h24 < 12 ? 'a' : 'p';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

function formatHourWindowTitle(h: number, headway: number): string {
  return `${formatClock(h * 60)}–${formatClock(h * 60 + 90)}: every ${headway} min`;
}

const HOUR_TO_PERIOD: Record<number, string> = Object.fromEntries(
  HOURS.map(h => [h, periodKeyForHour(h)]).filter(([, p]) => p != null),
) as Record<number, string>;

// Contiguous hover bands per period (overnight tail: 2 AM, 3 AM, 4 AM, 5 AM)
const PERIOD_BANDS: Record<string, { left: number; width: number }[]> = (() => {
  const result: Record<string, { left: number; width: number }[]> = {};
  let i = 0;
  while (i < HOURS.length) {
    const p = HOUR_TO_PERIOD[HOURS[i]];
    if (!p) { i++; continue; }
    const start = i;
    while (i < HOURS.length && HOUR_TO_PERIOD[HOURS[i]] === p) i++;
    (result[p] ??= []).push({ left: start / HOURS.length, width: (i - start) / HOURS.length });
  }
  return result;
})();

const PERIOD_OVERVIEW_BANDS = TIME_PERIODS.map(period => {
  const bands = PERIOD_BANDS[period.key] ?? [];
  const first = bands[0];
  const last = bands[bands.length - 1];
  return first && last
    ? { ...period, left: first.left, width: last.left + last.width - first.left }
    : null;
}).filter((band): band is (typeof TIME_PERIODS)[number] & { left: number; width: number } => band != null);

interface HourlySparklineProps {
  byHour: HeadwayByHour;
  stackedByHour?: Record<number, { label: string; headway: number; color: string }[]>;
  period?: string;
  onPeriodChange?: (period: string) => void;
  onPeriodHover?: (period: string | null) => void;
  onHourHover?: (hour: number | null) => void;
  /** Beta-only control for opening the full-day schedule view. */
  allowExpand?: boolean;
  /** Keep the legend's vertical space while a route branch is hovered. */
  reserveStackedLegendSpace?: boolean;
  title?: string;
  /** Used by the modal's larger, all-period rendering. */
  expanded?: boolean;
}

export function HeadwaySparkline({ byHour, stackedByHour, period, onPeriodChange, onPeriodHover, onHourHover, allowExpand = false, reserveStackedLegendSpace = false, title = 'Schedule overview', expanded = false }: HourlySparklineProps) {
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  const H = expanded ? 150 : 28;
  const valids = HOURS.map(h => byHour[h]).filter((v): v is number => v != null);
  if (valids.length === 0) return null;

  const maxFreq = Math.max(...valids.map(v => 1 / v));
  const minFreq = Math.min(...valids.map(v => 1 / v));

  const activePeriodKey = expanded ? null : period && period !== 'all' ? period : null;

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
    const p = HOUR_TO_PERIOD[hour] ?? null;
    setHoveredPeriod(p);
    setHoveredHour(hour);
    onPeriodHover?.(p);
    onHourHover?.(hour);
  } : undefined;

  const handleClick = interactive ? (e: React.MouseEvent<HTMLDivElement>) => {
    if (expanded) return;
    const clicked = HOUR_TO_PERIOD[HOURS[posFromEvent(e)]];
    if (clicked) onPeriodChange(period === clicked ? 'all' : clicked);
  } : undefined;

  const handleMouseLeave = interactive ? () => {
    setHoveredPeriod(null);
    setHoveredHour(null);
    onPeriodHover?.(null);
    onHourHover?.(null);
  } : undefined;

  const bands = hoveredPeriod ? PERIOD_BANDS[hoveredPeriod] : null;
  const activeLabelKey = (hoveredPeriod ?? (!expanded && period && period !== 'all' ? period : null)) as TimePeriod | null;
  const stackedLegend = stackedByHour
    ? Array.from(new Map(
      Object.values(stackedByHour).flat().map(segment => [segment.label, segment]),
    ).values())
    : [];

  return (
    <div className={`relative ${expanded ? 'mt-2 mb-4' : 'mt-6 mb-4'}`}>
      {allowExpand && !expanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          aria-label="Expand schedule"
          title="Expand schedule"
          className="absolute right-0 -top-1 z-20 p-1 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
      <div
        className={`relative ${expanded ? 'pt-12' : 'pt-5'} ${interactive ? 'cursor-pointer select-none' : ''}`}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        >
        {expanded && PERIOD_OVERVIEW_BANDS.map(band => (
          <div
            key={band.key}
            className="absolute inset-y-5 rounded-sm pointer-events-none odd:bg-[var(--bg-btn-hover)] even:bg-transparent opacity-40"
            style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%` }}
          >
            <span className="absolute -top-5 left-1 text-[9px] font-black text-[var(--text-muted)] whitespace-nowrap">
              {band.label}
            </span>
          </div>
        ))}
        {activeLabelKey && (
          <span className={`absolute top-0 text-[9px] font-bold text-[var(--text-dim)] pointer-events-none ${allowExpand && !expanded ? 'right-7' : 'right-0'}`}>
            {PERIOD_LABELS[activeLabelKey]}
          </span>
        )}
        {/* Hover region highlight — visible on light bg */}
        {bands?.map((band, i) => (
          <div
            key={i}
            className="absolute inset-y-0 rounded-sm pointer-events-none"
            style={{
              left: `${band.left * 100}%`,
              width: `${band.width * 100}%`,
              background: 'var(--bg-btn-hover)',
            }}
          />
        ))}
        <div className="relative z-10 flex items-end gap-px">
          {HOURS.map(h => {
            const hw = byHour[h];
            const hasValue = hw != null;
            const freq = hw ? 1 / hw : 0;
            const barH = hasValue
              ? (maxFreq > minFreq
                  ? Math.max(4, Math.round((freq - minFreq) / (maxFreq - minFreq) * (H - 4) + 4))
                  : H)
              : 0;
            const inActivePeriod = activePeriodKey
              ? isHourInPeriod(h, activePeriodKey)
              : true;
            const inHovered = hoveredPeriod ? HOUR_TO_PERIOD[h] === hoveredPeriod : false;
            const isTooltipHover = hoveredHour === h;
            const segments = stackedByHour?.[h] ?? [];
            const segmentTotalFreq = segments.reduce((sum, segment) => sum + 1 / segment.headway, 0);
            // Hovered-but-inactive bars show their tier color at reduced opacity as a preview
            const barColor = hasValue
              ? (inActivePeriod || inHovered ? headwayToTierColor(hw) : 'var(--border-primary)')
              : undefined;
            const opacity = !hasValue ? undefined
              : inActivePeriod ? 'opacity-90'
              : inHovered ? 'opacity-60'
              : 'opacity-40';
            return (
              <div
                key={h}
                className="flex-1 min-w-0 flex flex-col items-center"
                title={hasValue ? formatHourWindowTitle(h, hw) : undefined}
              >
                <div style={{ height: H }} className="flex items-end justify-center w-full">
                  {hasValue && (
                    segments.length > 0 && segmentTotalFreq > 0 ? (
                      <div className={`${expanded ? 'w-[14px]' : 'w-[7px]'} flex flex-col-reverse overflow-hidden rounded-sm transition-[opacity,transform] duration-75 ${opacity} ${isTooltipHover ? 'scale-y-[1.15] ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-app)]' : ''}`}>
                        {segments.map(segment => (
                          <div
                            key={segment.label}
                            style={{ height: Math.max(2, barH * ((1 / segment.headway) / segmentTotalFreq)), background: segment.color }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{ height: barH, background: barColor }}
                        className={`${expanded ? 'w-[14px]' : 'w-[7px]'} rounded-sm transition-[background,opacity,transform] duration-75 ${opacity} ${isTooltipHover ? 'scale-y-[1.15] ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-app)]' : ''}`}
                      />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
      {(stackedLegend.length > 0 || reserveStackedLegendSpace) && (
        <div className={`flex min-h-[10px] flex-wrap items-center justify-center gap-x-2 gap-y-0.5 mt-1 px-1 text-[7px] font-bold text-[var(--text-dim)] leading-tight`}>
          {stackedLegend.map(segment => (
            <span key={segment.label} className="inline-flex items-center gap-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: segment.color }} />
              {segment.label}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-px mt-1">
        {HOURS.map(h => (
          <div key={h} className="flex-1 min-w-0 text-center">
            {(expanded || HOUR_LABELS[h]) && (
              <span className={expanded ? 'text-[9px] text-[var(--text-dim)]' : 'text-[7px] text-[var(--text-dim)]'}>
                {expanded ? formatClock(h * 60) : HOUR_LABELS[h]}
              </span>
            )}
          </div>
        ))}
      </div>
      {expanded && (
        <div className="mt-3 min-h-5 text-center text-[10px] font-bold text-[var(--text-muted)]" aria-live="polite">
          {hoveredHour != null && byHour[hoveredHour] != null
            ? formatHourWindowTitle(hoveredHour, byHour[hoveredHour]!)
            : 'Hover over an hour to inspect its scheduled headway window.'}
        </div>
      )}
      {allowExpand && !expanded && isExpanded && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} full-day schedule`}
          className="fixed inset-0 z-[1700] flex items-center justify-center bg-[var(--bg-app)]/90 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget) setIsExpanded(false); }}
        >
          <div className="w-full max-w-6xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-[var(--text-primary)]">{title}</h2>
                <p className="mt-1 text-[10px] font-bold text-[var(--text-dim)]">
                  All time periods are shown together.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                aria-label="Close schedule"
                className="shrink-0 rounded-full p-1.5 text-[var(--text-dim)] hover:bg-[var(--bg-btn-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <HeadwaySparkline
              byHour={byHour}
              stackedByHour={stackedByHour}
              period="all"
              onPeriodChange={() => {}}
              onPeriodHover={onPeriodHover}
              onHourHover={onHourHover}
              title={title}
              expanded
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Legacy period-based export kept for any callers that still use it
export type { HeadwayByPeriod };
