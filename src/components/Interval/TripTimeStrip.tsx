import { SPARKLINE_HOURS } from '../../../shared/config';
import { tripTimeBarHeight, tripTimeHourTitle, tripTimeSummary, type TripTimeSeries } from '../../utils/tripTime';

/** The strip's bar area height: tall enough to read as a second chart under the 150px one (CIV-493). */
export const TRIP_TIME_STRIP_HEIGHT = 80;

/** The full-day chart's hour column row and bar width; the strip uses the same so bars sit under their hour. */
export const FULL_DAY_COLUMN_ROW = 'flex gap-px';
export const FULL_DAY_BAR_WIDTH = 'w-[8px] sm:w-[14px]';

/**
 * A line and an hourly strip under the full-day frequency chart. The strip uses the chart's own
 * hour columns (same row, gap and bar width), so each bar sits under its hour, and is scaled
 * from zero with the longest trip time at full height (tripTimeBarHeight). Hovering or tapping a bar
 * reports that hour through the chart's hover line; the hours with the longest trip time are drawn
 * darker. Renders nothing without data.
 */
export function TripTimeStrip({ series, label, height = TRIP_TIME_STRIP_HEIGHT, serviceHours, hoveredHour, onHourHover }: {
  series: TripTimeSeries | null | undefined;
  label?: string;
  height?: number;
  /** Hours the chart above has trips in; one with no trip time gets a faint tick, so the gap doesn't read as no service. */
  serviceHours?: ReadonlySet<number>;
  hoveredHour?: number | null;
  onHourHover?: (hour: number | null) => void;
}) {
  const summary = tripTimeSummary(series, label);
  if (!series || !summary) return null;
  const values = SPARKLINE_HOURS.map(h => series.byHour[h]).filter((v): v is number => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className="mt-3" data-testid="trip-time-strip">
      <div className="text-left text-xs font-bold text-[var(--text-muted)]">
        {summary}
        {series.loop ? ' (one full loop)' : ''}
      </div>
      <div className={`mt-1 ${FULL_DAY_COLUMN_ROW} items-end`} onMouseLeave={() => onHourHover?.(null)}>
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
              title={minutes != null ? tripTimeHourTitle(h, minutes) : undefined}
              onMouseEnter={() => onHourHover?.(minutes != null ? h : null)}
              onClick={() => onHourHover?.(minutes != null ? h : null)}
            >
              {hovered && <div className="absolute inset-0 rounded-sm bg-[var(--bg-btn-hover)] pointer-events-none" />}
              {minutes != null ? (
                <div
                  data-testid="trip-time-bar"
                  className={`relative ${FULL_DAY_BAR_WIDTH} rounded-sm bg-[var(--text-dim)] ${slowest ? 'opacity-100' : hovered ? 'opacity-75' : 'opacity-50'}`}
                  style={{ height: tripTimeBarHeight(minutes, max, height) }}
                />
              ) : serviceHours?.has(h) ? (
                // An empty slot, not a value: a dashed outline at a neutral height.
                <div
                  data-testid="trip-time-missing"
                  className={`${FULL_DAY_BAR_WIDTH} rounded-sm border border-dashed border-[var(--text-dim)] opacity-40`}
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
