import { SPARKLINE_HOURS } from '../../../shared/config';
import { tripTimeHourTitle, tripTimeSummary, type TripTimeSeries } from '../../utils/tripTime';

/**
 * A line and thin hourly strip under the full-day frequency chart. The strip's bars share the
 * chart's hour columns; minutes show on hover, as on the chart. Renders nothing without data.
 */
export function TripTimeStrip({ series, label }: { series: TripTimeSeries | null | undefined; label?: string }) {
  const summary = tripTimeSummary(series, label);
  if (!series || !summary) return null;
  const values = SPARKLINE_HOURS.map(h => series.byHour[h]).filter((v): v is number => v != null);
  const max = Math.max(...values);
  const STRIP_H = 16;
  return (
    <div className="mt-3" data-testid="trip-time-strip">
      <div className="text-center text-[10px] font-bold text-[var(--text-muted)]">
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
                  style={{ height: Math.max(3, Math.round((minutes / max) * STRIP_H)) }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
