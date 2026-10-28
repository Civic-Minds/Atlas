import React, { useCallback, useEffect, useState } from 'react';
import { headwayToTierColor } from '../../utils/colors';
import { useColorMode } from '../../hooks/useColorMode';
export { headwayToTierColor };
import { CARD_NOTE, CHART_HEADING, CHART_PERIOD_LABEL } from '../../styles';
import { SPARKLINE_HOURS, SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { TimePeriod } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod, HeadwayByHour } from '../../hooks/useAgencyData';
import type { HeadwayByHourMaxGap } from '../../../shared/config';
import Pill from '../ui/Pill';
import ExpandDialog, { ExpandButton } from '../ui/ExpandDialog';
import LegendItem from '../ui/LegendItem';
import { delayAmount, headwayEvery, runTimeAmount } from '../../utils/headwayText';
import { TripTimeStrip, AxisOverlay, tripTimeAxisTicks, type AxisTick, tripTimeHeading, FULL_DAY_BAR_SHAPE, FULL_DAY_COLUMN_ROW } from './TripTimeStrip';
import { type TripTimeSeries } from '../../utils/tripTime';
import { syncUrlParams } from '../../utils/syncUrlParams';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { encodeFullDayUrlState, parseFullDayUrlState } from '../../utils/shareUrlState';
import { HOUR_TO_PERIOD, PERIOD_BANDS, PERIOD_OVERVIEW_BANDS } from '../../utils/sparklinePeriods';
import { headwayAxisTicks, hourBarColorHeadway, hourBarEmphasis, hourChartLitPeriod, hourChartMaxFreq, sparklineBarHeight } from '../../utils/hourChartModel';
export { headwayAxisTicks, sparklineBarHeight };

/** Bar area height of the route card's compact sparkline, in px. The one place to change it. */
export const SPARKLINE_CARD_HEIGHT = 38;
/** Bar area height of each full-day chart (frequency and trip time, the same so they compare), in px. */
export const SPARKLINE_EXPANDED_HEIGHT = 150;
/** The same on phones, where the two charts stack in a short screen. */
export const SPARKLINE_EXPANDED_HEIGHT_PHONE = 100;
/**
 * Each full-day chart when both directions show at once, in px. Desktop: a 2x2 grid (frequency charts
 * stacked on the left, trip time charts on the right), each half the dialog wide. Phone: all four stacked.
 */
export const SPARKLINE_PAIRED_HEIGHT = 96;
export const SPARKLINE_PAIRED_HEIGHT_PHONE = 44;

const HOURS = SPARKLINE_HOURS;

const BAR_OPACITY = { active: 'opacity-90', lit: 'opacity-60', dim: 'opacity-40' } as const;

// Label positions: 6a, 12p, 6p, 12a
const HOUR_LABELS = SPARKLINE_HOUR_LABELS;

function formatClock(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h24 < 12 ? 'a' : 'p';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

/** One row of clock labels under a chart column, every third hour so the 12px labels don't collide. */
function ClockLabels({ className = '' }: { className?: string }) {
  return (
    <div className={`flex gap-px mt-1 ${className}`} data-testid="full-day-clock-labels">
      {HOURS.map(h => (
        <div key={h} className="flex-1 min-w-0 text-center">
          <span className={`text-xs text-[var(--text-dim)] whitespace-nowrap ${(h - HOURS[0]) % 6 === 0 ? '' : (h - HOURS[0]) % 3 === 0 ? 'hidden sm:inline' : 'hidden'}`}>
            {formatClock(h * 60)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatHourTitle(h: number, headway: number): string {
  return `${formatClock(h * 60)}: ${headwayEvery(headway)}`;
}

function tripTimeAbout(minutes: number): string {
  return `about ${runTimeAmount(minutes)}`;
}

function formatTripTimeTitle(h: number, minutes: number): string {
  return `${formatClock(h * 60)}: ${tripTimeAbout(minutes)}`;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The direction the full-day view opens on: the slower one overall, i.e. the
 * longest typical (median) hourly headway, then the longer average headway.
 * Full ties keep the first direction.
 */
export function slowerDirectionKey(options: { key: string; byHour: HeadwayByHour }[] | undefined): string | null {
  let best: { key: string; typical: number; mean: number } | null = null;
  for (const option of options ?? []) {
    const values = HOURS.map(h => option.byHour[h]).filter((v): v is number => v != null && v > 0);
    if (values.length === 0) continue;
    const typical = medianOf(values);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (!best || typical > best.typical || (typical === best.typical && mean > best.mean)) {
      best = { key: option.key, typical, mean };
    }
  }
  return best?.key ?? options?.[0]?.key ?? null;
}

interface HourlySparklineProps {
  byHour: HeadwayByHour;
  maxGapByHour?: HeadwayByHourMaxGap;
  /** Branch segments per hour; a `faded` segment is drawn at the out-of-period fade (a selected branch's others). */
  stackedByHour?: Record<number, { label: string; headway: number; color: string; faded?: boolean }[]>;
  /** The legend's branches, when they differ from the stack's (default: the stack's own). */
  legendStackedByHour?: Record<number, { label: string; headway: number; color: string; faded?: boolean }[]>;
  /** Keep the legend's space but hide it, so a selection doesn't shift the card under the pointer. */
  legendInvisible?: boolean;
  /**
   * The route's one y-axis top, as trips per minute (1 / shortest headway across every direction and
   * branch), so selecting a branch or a full-day direction never rescales the bars (CIV-512).
   */
  scaleMaxFreq?: number;
  directionOptions?: { key: string; label: string; byHour: HeadwayByHour; tripTime?: TripTimeSeries | null }[];
  period?: string;
  onPeriodChange?: (period: string) => void;
  onPeriodHover?: (period: string | null) => void;
  onHourHover?: (hour: number | null) => void;
  /** Beta-only control for opening the full-day schedule view. */
  allowExpand?: boolean;
  /** Keep the legend's vertical space while a route branch is hovered. */
  reserveStackedLegendSpace?: boolean;
  title?: string;
  /** Names what the bars show in hour tooltips, e.g. "slower direction". */
  seriesLabel?: string;
  /** Used by the modal's larger, all-period rendering. */
  expanded?: boolean;
  /** Full-day view only: trip time by hour, drawn as a strip on the chart's own hour columns. */
  tripTime?: TripTimeSeries | null;
  /**
   * Both directions at once: this chart is one of the full-day view's two direction blocks. It takes the
   * smaller paired height, follows one hovered hour (and so one hovered period) shared with the other
   * blocks, and leaves the readout to the parent.
   */
  sharedHour?: number | null;
  onSharedHour?: (hour: number | null) => void;
  /** Name the periods along the top (default). Off for the second block, so the names show once. */
  showPeriodLabels?: boolean;
  /** Y-axis ticks (full-day, both directions): drawn over the bars, labels in a gutter the parent leaves. */
  yAxis?: AxisTick[];
}

export function HeadwaySparkline({ byHour, maxGapByHour, stackedByHour, directionOptions, period, onPeriodChange, onPeriodHover, onHourHover, allowExpand = false, reserveStackedLegendSpace = false, title = 'Schedule overview', seriesLabel, expanded = false, tripTime, legendStackedByHour, legendInvisible = false, scaleMaxFreq, sharedHour, onSharedHour, showPeriodLabels = true, yAxis }: HourlySparklineProps) {
  const colorMode = useColorMode();
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  // Hovering the trip-time strip reports that hour's trip time in the hover line instead.
  const [hoveredTripHour, setHoveredTripHour] = useState<number | null>(null);
  // Only the route card's chart (not the copy inside the full-day view) is linkable.
  const ownsUrl = allowExpand && !expanded;
  const [linkedFullDay] = useState(() => (
    ownsUrl && typeof window !== 'undefined' ? parseFullDayUrlState(window.location.search) : null
  ));
  const [isExpanded, setIsExpanded] = useState(() => linkedFullDay?.open ?? false);
  const closeExpanded = useCallback(() => setIsExpanded(false), []);
  // Two directions show side by side as four charts; one hovered hour is shared by all of them.
  const [modalHour, setModalHour] = useState<number | null>(null);
  const bothDirections = directionOptions?.length === 2;
  const [pickedDirection, setPickedDirection] = useState<string | null>(() => linkedFullDay?.direction ?? null);

  const defaultDirection = slowerDirectionKey(directionOptions);
  useEffect(() => {
    if (!ownsUrl) return;
    syncUrlParams(encodeFullDayUrlState({ open: isExpanded, direction: pickedDirection }, defaultDirection));
  }, [ownsUrl, isExpanded, pickedDirection, defaultDirection]);
  // Closing the route card closes the full-day view, so its params go with it.
  useEffect(() => {
    if (!ownsUrl) return;
    return () => syncUrlParams({ fullday: null, fdir: null });
  }, [ownsUrl]);

  const sharedMode = !!onSharedHour;
  const H = expanded
    ? (sharedMode
      ? (phone ? SPARKLINE_PAIRED_HEIGHT_PHONE : SPARKLINE_PAIRED_HEIGHT)
      : (phone ? SPARKLINE_EXPANDED_HEIGHT_PHONE : SPARKLINE_EXPANDED_HEIGHT))
    : SPARKLINE_CARD_HEIGHT;
  const labelRow = expanded && showPeriodLabels;
  const displayedByHour = byHour;
  // The full-day view shows the direction picked with the pills above it;
  // the inline chart always shows the route's merged schedule.
  const expandedDirection = (pickedDirection != null && directionOptions?.some(option => option.key === pickedDirection))
    ? pickedDirection
    : defaultDirection;
  const modalByHour = directionOptions?.find(option => option.key === expandedDirection)?.byHour ?? byHour;
  const valids = HOURS.map(h => displayedByHour[h]).filter((v): v is number => v != null);
  if (valids.length === 0) return null;

  // The route's fixed top when given (never below the tallest bar shown), else this series' busiest hour.
  const maxFreq = hourChartMaxFreq([displayedByHour], HOURS, scaleMaxFreq);

  const activePeriodKey = expanded ? null : period && period !== 'all' ? period : null;

  const interactive = !!onPeriodChange;
  // One bar look at both sizes (CIV-496): round-ended bars filling the same share of each
  // hour's column. The card's 7px bar fills about half its column; the full-day view keeps that share.
  const barShape = expanded ? FULL_DAY_BAR_SHAPE : 'w-[7px] rounded-full';

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
    onSharedHour?.(hour);
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
    onSharedHour?.(null);
  } : undefined;

  const readoutHour = hoveredTripHour ?? hoveredHour;
  // With both directions showing, the hovered hour (and its period band) is shared, so it shows in every chart.
  // With nothing hovered, the band stays behind the selected period, so it shows which hours the numbers below
  // come from (CIV-933). Hovering moves it; leaving the chart brings it back.
  const hoverPeriod = sharedMode ? (sharedHour != null ? HOUR_TO_PERIOD[sharedHour] ?? null : null) : hoveredPeriod;
  const litPeriod = hourChartLitPeriod(hoverPeriod, activePeriodKey, displayedByHour, HOURS);
  const bands = litPeriod ? PERIOD_BANDS[litPeriod] : null;
  // The full-day chart already labels every period along its top, so only the route card's chart names the hovered one.
  const activeLabelKey = (expanded ? null : hoveredPeriod ?? (period && period !== 'all' ? period : null)) as TimePeriod | null;
  const legendSource = legendStackedByHour ?? stackedByHour;
  const stackedLegend = legendSource
    ? Array.from(new Map(
      Object.values(legendSource).flat().map(segment => [segment.label, segment]),
    ).values())
    : [];

  // The full-day grid shows both directions at once, or the one picked (or only) direction. Every chart
  // shares one frequency scale and one trip time scale across the route's directions, so bars and axes compare.
  const pairH = phone ? SPARKLINE_PAIRED_HEIGHT_PHONE : SPARKLINE_PAIRED_HEIGHT;
  const pickedOption = directionOptions?.find(option => option.key === expandedDirection);
  const gridBlocks: { key: string; label: string; byHour: HeadwayByHour; tripTime?: TripTimeSeries | null }[] = bothDirections
    ? directionOptions!
    : [{ key: expandedDirection ?? 'all', label: '', byHour: modalByHour, tripTime: pickedOption ? pickedOption.tripTime : tripTime }];
  const scaleSources = directionOptions && directionOptions.length > 0 ? directionOptions : gridBlocks;
  const pairMaxFreq = hourChartMaxFreq(scaleSources.map(option => option.byHour), HOURS, scaleMaxFreq);
  const pairTripMax = Math.max(0, ...scaleSources.flatMap(option => HOURS.map(h => option.tripTime?.byHour[h]).filter((v): v is number => v != null)));
  const pairFreqTicks = headwayAxisTicks(pairMaxFreq, pairH);
  const pairTripTicks = tripTimeAxisTicks(pairTripMax, pairH);

  return (
    <div className={`relative ${sharedMode ? '' : expanded ? 'mt-2 mb-4' : 'mt-6 mb-4'}`}>
      {allowExpand && !expanded && <ExpandButton label="Expand schedule" onClick={() => setIsExpanded(true)} />}
      <div
        className={`relative ${expanded ? (labelRow ? 'pt-12' : 'pt-2') : 'pt-5'} ${interactive ? 'cursor-pointer select-none' : ''}`}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        >
        {expanded && PERIOD_OVERVIEW_BANDS.map(band => (
          <div
            key={band.key}
            className={`absolute ${labelRow ? 'top-12' : 'top-2'} bottom-0 rounded-sm pointer-events-none odd:bg-[var(--bg-btn-hover)] even:bg-transparent opacity-40`}
            style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%` }}
          >
            {labelRow && (
              <span className={`absolute -top-6 left-0.5 sm:left-1 ${CHART_PERIOD_LABEL} whitespace-nowrap`}>
                {band.label.endsWith(' peak') ? (
                  <>
                    <span className="sm:hidden" aria-hidden="true">{band.label.replace(' peak', '')}</span>
                    <span className="hidden sm:inline">{band.label}</span>
                  </>
                ) : band.label}
              </span>
            )}
          </div>
        ))}
        {yAxis && <AxisOverlay ticks={yAxis} height={H} className={labelRow ? 'top-12' : 'top-2'} />}
        {activeLabelKey && (
          <span className={`absolute top-0 ${CARD_NOTE} pointer-events-none ${allowExpand && !expanded ? 'right-7' : 'right-0'}`}>
            {PERIOD_LABELS[activeLabelKey]}
          </span>
        )}
        {/* Hover region highlight — visible on light bg. It starts below the label row
            (the top padding), so the period label sits above it, not inside it. */}
        {bands?.map((band, i) => (
          <div
            key={i}
            data-testid="sparkline-hover-band"
            className={`absolute ${expanded ? (labelRow ? 'top-12' : 'top-2') : 'top-5'} bottom-0 rounded-sm pointer-events-none`}
            style={{
              left: `${band.left * 100}%`,
              width: `${band.width * 100}%`,
              background: 'var(--bg-btn-hover)',
            }}
          />
        ))}
        <div className={`relative z-10 ${FULL_DAY_COLUMN_ROW} items-end`}>
          {HOURS.map(h => {
            const hw = displayedByHour[h];
            const maxGap = maxGapByHour?.[h];
            const hasValue = hw != null;
            const barH = sparklineBarHeight(hw, maxFreq, H);
            const isTooltipHover = sharedMode ? sharedHour === h : (hoveredHour === h || hoveredTripHour === h);
            const segments = stackedByHour?.[h] ?? [];
            const segmentTotalFreq = segments.reduce((sum, segment) => sum + 1 / segment.headway, 0);
            // One rule for every hour with trips (CIV-497): its colour (tier, or branch colours when
            // stacked), faded outside the selected period. Hours with no trips draw no bar.
            const barColor = hasValue ? headwayToTierColor(hourBarColorHeadway(hw, maxGap), colorMode) : undefined;
            const opacity = !hasValue ? undefined : BAR_OPACITY[hourBarEmphasis(h, activePeriodKey, litPeriod)];
            return (
              <div
                key={h}
                className="flex-1 min-w-0 flex flex-col items-center"
                title={hasValue && !expanded
                  ? `${formatHourTitle(h, hw)}${seriesLabel ? ` (${seriesLabel})` : ''}${maxGap != null && maxGap > hw ? `; longest gap ${delayAmount(maxGap)}` : ''}`
                  : undefined}
              >
                <div style={{ height: H }} className="relative flex items-end justify-center w-full">
                  {isTooltipHover && hasValue && (
                    <div data-testid="sparkline-hover-column" className="absolute inset-0 rounded-sm bg-[var(--bg-btn-hover)] pointer-events-none" />
                  )}
                  {hasValue && (
                    segments.length > 0 && segmentTotalFreq > 0 ? (
                      <div className={`${barShape} flex flex-col-reverse overflow-hidden transition-opacity duration-75 ${isTooltipHover ? 'opacity-100' : opacity}`}>
                        {/* Keyed by position too: two branches can share a name (TTC 51's "Donlands via Laird"). */}
                        {segments.map((segment, i) => (
                          <div
                            key={`${segment.label}-${i}`}
                            className={segment.faded ? 'opacity-40' : undefined}
                            style={{ height: Math.max(2, barH * ((1 / segment.headway) / segmentTotalFreq)), background: segment.color }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{ height: barH, background: barColor }}
                        className={`${barShape} transition-[background,opacity] duration-75 ${isTooltipHover ? 'opacity-100' : opacity}`}
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
        // Branches side by side while they fit, wrapping to the next line when they don't (CIV-936).
        <div className={`flex min-h-[10px] flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 ${CARD_NOTE} leading-tight ${legendInvisible ? 'invisible' : ''}`}>
          {stackedLegend.map((segment, i) => (
            <LegendItem key={`${segment.label}-${i}`} color={segment.color}>{segment.label}</LegendItem>
          ))}
        </div>
      )}
      {expanded && !sharedMode && (
        // Directly under the frequency chart, the same height, on the same hour columns; one row of
        // clock labels under both (CIV-510).
        <TripTimeStrip
          series={tripTime}
          height={H}
          serviceHours={new Set(HOURS.filter(h => displayedByHour[h] != null))}
          // Two-way hover (CIV-505): an hour hovered in either chart lights the same column in both.
          hoveredHour={hoveredTripHour ?? hoveredHour}
          onHourHover={setHoveredTripHour}
        />
      )}
      {!sharedMode && <div className="flex gap-px mt-1">
        {HOURS.map(h => (
          <div key={h} className="flex-1 min-w-0 text-center">
            {(expanded || HOUR_LABELS[h]) && (
              expanded ? (
                // Every third hour only, so the 12px clock labels don't collide.
                <span className={`text-xs text-[var(--text-dim)] whitespace-nowrap ${(h - HOURS[0]) % 3 === 0 ? '' : 'hidden'}`}>
                  {formatClock(h * 60)}
                </span>
              ) : (
                <span className="text-xs text-[var(--text-dim)]">{HOUR_LABELS[h]}</span>
              )
            )}
          </div>
        ))}
      </div>}
      {expanded && !sharedMode && (
        // Screen-reader text only (no visible readout, no browser tooltip in the full-day view): the
        // hovered hour's frequency and trip time, each in its existing wording.
        <div className="sr-only" aria-live="polite">
          {readoutHour != null && displayedByHour[readoutHour] != null && (
            <div>{formatHourTitle(readoutHour, displayedByHour[readoutHour]!)}</div>
          )}
          {readoutHour != null && tripTime?.byHour[readoutHour] != null && (
            <div>{formatTripTimeTitle(readoutHour, tripTime.byHour[readoutHour]!)}</div>
          )}
        </div>
      )}
      {allowExpand && !expanded && isExpanded && (
        <ExpandDialog
          title={title}
          note="All time periods are shown together."
          ariaLabel={`${title} full-day schedule`}
          closeLabel="Close schedule"
          onClose={closeExpanded}
        >
            {directionOptions && directionOptions.length > 1 && !bothDirections && (
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Schedule direction">
                {directionOptions.map(option => (
                  <Pill
                    key={option.key}
                    tone="glass"
                    size="segment"
                    selected={expandedDirection === option.key}
                    onClick={() => setPickedDirection(option.key)}
                  >
                    {option.label}
                  </Pill>
                ))}
              </div>
            )}
            <>
                {/* Two columns on desktop: the frequency charts on the left, the trip time charts on the right
                    (Westbound over Eastbound when both directions show). On a phone the same cells stack. */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4" data-testid="full-day-grid">
                  {/* The period names sit once above the frequency column (the bands matter only there). */}
                  <div className="pl-11 sm:col-start-1 sm:row-start-1" data-testid="full-day-period-labels">
                    <div className="relative h-4 mb-1">
                      {PERIOD_OVERVIEW_BANDS.map(band => (
                        <span
                          key={band.key}
                          // On a phone the last name ends at the chart's right edge (its start would run past it) and Night is
                          // dropped: it would overlap both its neighbours.
                          className={`absolute top-0 ${CHART_PERIOD_LABEL} whitespace-nowrap ${band.key === 'late' ? 'hidden sm:inline' : ''} ${phone && band.key === 'overnight' ? 'right-0' : ''}`}
                          style={phone && band.key === 'overnight' ? undefined : { left: `${band.left * 100}%` }}
                        >
                          {/* The frequency column is half the dialog wide, so the peaks use the short form ("AM", "PM"). */}
                          {band.label.replace(' peak', '')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`hidden sm:block pl-11 ${CHART_HEADING} sm:col-start-2 sm:row-start-1 sm:mb-1`}>{tripTimeHeading(gridBlocks.some(option => option.tripTime?.loop))}</div>
                  {gridBlocks.map(option => {
                    const hw = modalHour != null ? option.byHour[modalHour] : null;
                    const tt = modalHour != null ? option.tripTime?.byHour[modalHour] : null;
                    return (
                      <div key={option.key} className="contents" data-testid="full-day-direction">
                        {bothDirections && <div className="mt-3 mb-1 sm:col-span-2 text-sm font-black text-[var(--text-primary)]">{option.label}</div>}
                        <div className="relative pl-11">
                          {/* This chart's own number for the hovered hour, in a fixed spot so nothing jumps. */}
                          <div className="h-4 text-xs font-bold leading-4 text-[var(--text-muted)]" data-testid="full-day-chart-value" aria-hidden="true">
                            {hw != null ? headwayEvery(hw) : ''}
                          </div>
                          <HeadwaySparkline
                            byHour={option.byHour}
                            period="all"
                            onPeriodChange={() => {}}
                            onPeriodHover={onPeriodHover}
                            onHourHover={onHourHover}
                            title={title}
                            expanded
                            scaleMaxFreq={pairMaxFreq}
                            sharedHour={modalHour}
                            onSharedHour={setModalHour}
                            showPeriodLabels={false}
                            yAxis={pairFreqTicks}
                          />
                          <ClockLabels />
                        </div>
                        {HOURS.some(h => option.tripTime?.byHour[h] != null) && <div className="relative pl-11">
                          <TripTimeStrip
                            above={(
                              <div className="h-4 text-xs font-bold leading-4 text-[var(--text-muted)]" data-testid="full-day-chart-value" aria-hidden="true">
                                {tt != null ? tripTimeAbout(tt) : ''}
                              </div>
                            )}
                            series={option.tripTime}
                            height={pairH}
                            serviceHours={new Set(HOURS.filter(h => option.byHour[h] != null))}
                            hoveredHour={modalHour}
                            onHourHover={setModalHour}
                            className="mt-3 sm:mt-0"
                            labelClassName="sm:hidden"
                            barsClassName="mt-1 sm:mt-2"
                            scaleMax={pairTripMax}
                            axis={pairTripTicks}
                          />
                          {/* Every chart has its own clock row directly under it. */}
                          <ClockLabels />
                        </div>}
                      </div>
                    );
                  })}
                </div>
                {/* Screen-reader text only: the hovered hour once, then each direction's frequency and
                    trip time in their existing wording. Nothing visible, so the dialog reserves no space. */}
                <div className="sr-only" aria-live="polite" data-testid="full-day-readout">
                  {modalHour != null && gridBlocks.some(option => option.byHour[modalHour] != null || option.tripTime?.byHour[modalHour] != null) && (
                    <>
                      <div>{formatClock(modalHour * 60)}</div>
                      {gridBlocks.map(option => {
                        const hw = option.byHour[modalHour];
                        const tt = option.tripTime?.byHour[modalHour];
                        if (hw == null && tt == null) return null;
                        return (
                          <div key={option.key}>
                            {option.label ? `${option.label}: ` : ''}{[hw != null ? headwayEvery(hw) : null, tt != null ? tripTimeAbout(tt) : null].filter(Boolean).join('; ')}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
        </ExpandDialog>
      )}
    </div>
  );
}

// Legacy period-based export kept for any callers that still use it
export type { HeadwayByPeriod };
