import { SPARKLINE_HOURS } from '../../../shared/config';
import { tripTimeBarHeight, type TripTimeSeries } from '../../utils/tripTime';

/**
 * The full-day chart's hour column row and bar shape (width and round ends); the trip-time strip
 * uses the same, so each of its bars sits under, and is as wide and round as, the bar above.
 * The bar takes 40% of its hour column (CIV-510; was 55%), but never less than the card chart's
 * 7px, so phones keep the card's bar width.
 */
export const TRIP_TIME_LABEL = 'Trip time';
export const FULL_DAY_COLUMN_ROW = 'flex gap-px';
export const FULL_DAY_BAR_SHAPE = 'w-[40%] min-w-[7px] max-w-[24px] rounded-full';

/**
 * A small label and an hourly chart directly under the full-day frequency chart, the same height,
 * sharing its clock labels below both (CIV-510). The strip uses the chart's own
 * hour columns (same row, gap and bar shape), so each bar sits under its hour, and is scaled
 * from zero with the longest trip time at full height (tripTimeBarHeight). Hovering or tapping a bar
 * reports that hour through the chart's hover line; the hours with the longest trip time are drawn
 * darker. Renders nothing without data.
 */
export function TripTimeStrip({ series, label = TRIP_TIME_LABEL, height, serviceHours, hoveredHour, onHourHover, className = 'mt-3', labelClassName = '', barsClassName = 'mt-1' }: {
  series: TripTimeSeries | null | undefined;
  label?: string;
  /** The bar area height: the frequency chart's own, so the two charts match. */
  height: number;
  /** Hours the chart above has trips in; one with no trip time gets a faint tick, so the gap doesn't read as no service. */
  serviceHours?: ReadonlySet<number>;
  hoveredHour?: number | null;
  onHourHover?: (hour: number | null) => void;
  /** Spacing overrides: the 2x2 grid names the column once and aligns the strip with the chart beside it. */
  className?: string;
  labelClassName?: string;
  barsClassName?: string;
}) {
  const values = series ? SPARKLINE_HOURS.map(h => series.byHour[h]).filter((v): v is number => v != null) : [];
  if (!series || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className={className} data-testid="trip-time-strip">
      <div className={`text-left text-xs font-bold text-[var(--text-muted)] ${labelClassName}`}>
        {label}
        {series.loop ? ' (one full loop)' : ''}
      </div>
      <div className={`${barsClassName} ${FULL_DAY_COLUMN_ROW} items-end`} onMouseLeave={() => onHourHover?.(null)}>
        {SPARKLINE_HOURS.map(h => {
          const minutes = series.byHour[h];
          const hovered = hoveredHour === h && minutes != null;
          // Every hour at the longest trip time is drawn darker, so the chart shows them without a caption.
          const slowest = minutes != null && max > min && minutes === max;
          return (
            <div
              key={h}
              className="relative flex min-w-0 flex-1 items-end justify-center"
              style={{ height }}
              onMouseEnter={() => onHourHover?.(minutes != null ? h : null)}
              onClick={() => onHourHover?.(minutes != null ? h : null)}
            >
              {hovered && <div className="absolute inset-0 rounded-sm bg-[var(--bg-btn-hover)] pointer-events-none" />}
              {minutes != null ? (
                <div
                  data-testid="trip-time-bar"
                  className={`relative ${FULL_DAY_BAR_SHAPE} bg-[var(--text-dim)] ${slowest ? 'opacity-100' : hovered ? 'opacity-75' : 'opacity-50'}`}
                  style={{ height: tripTimeBarHeight(minutes, max, height) }}
                />
              ) : serviceHours?.has(h) ? (
                // An empty slot, not a value: a dashed outline at a neutral height.
                <div
                  data-testid="trip-time-missing"
                  className={`${FULL_DAY_BAR_SHAPE} border border-dashed border-[var(--text-dim)] opacity-40`}
                  style={{ height: Math.round(height * 0.4) }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
