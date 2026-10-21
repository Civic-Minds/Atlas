import { SPARKLINE_HOURS } from '../../../shared/config';
import { tripTimeBarHeight, tripTimeHourTitle, tripTimeSummary, type TripTimeSeries } from '../../utils/tripTime';

/** The strip's height: the same 32px as the card's hour chart, so the variation reads. */
export const TRIP_TIME_STRIP_HEIGHT = 32;

/**
 * A line and an hourly strip under the full-day frequency chart. The strip's bars share the
 * chart's hour columns and are scaled across the route's own fastest-to-slowest range
 * (tripTimeBarHeight); minutes show on hover, as on the chart. Renders nothing without data.
 */
export function TripTimeStrip({ series, label }: { series: TripTimeSeries | null | undefined; label?: string }) {
  const summary = tripTimeSummary(series, label);
  if (!series || !summary) return null;
  const values = SPARKLINE_HOURS.map(h => series.byHour[h]).filter((v): v is number => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const STRIP_H = TRIP_TIME_STRIP_HEIGHT;
  return (
    <div className="mt-3" data-testid="trip-time-strip">
      <div className="text-center text-xs font-bold text-[var(--text-muted)]">
        {summary}
        {series.loop ? ' (one full loop)' : ''}
      </div>
      <div className="mt-1 flex w-full items-end" style={{ height: STRIP_H }}>
        {SPARKLINE_HOURS.map(h => {
          const minutes = series.byHour[h];
          return (
            <div
              key={h}
              className="flex min-w-0 flex-1 items-end justify-center"
              title={minutes != null ? tripTimeHourTitle(h, minutes) : undefined}
            >
              {minutes != null && (
                <div
                  data-testid="trip-time-bar"
                  className="w-[8px] sm:w-[14px] rounded-sm bg-[var(--text-dim)] opacity-60 hover:opacity-100"
                  style={{ height: tripTimeBarHeight(minutes, min, max, STRIP_H) }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
