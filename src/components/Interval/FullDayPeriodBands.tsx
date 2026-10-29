import { CARD_NOTE } from '../../styles';
import { PERIOD_LABELS, type TimePeriod } from '../../hooks/useIntervalStats';
import { PERIOD_OVERVIEW_BANDS } from '../../utils/sparklinePeriods';

/**
 * The hovered (or selected) period's name, in the row a chart leaves above its bars: the route card's chart and both
 * full-day charts (CIV-1094). Positioned inside that chart's relative wrapper.
 */
export function HoveredPeriodName({ period, className = 'right-0' }: { period: TimePeriod | null; className?: string }) {
  if (!period) return null;
  return (
    <span className={`absolute top-0 ${CARD_NOTE} pointer-events-none ${className}`} data-testid="hovered-period-name">
      {PERIOD_LABELS[period]}
    </span>
  );
}

/**
 * The full-day charts' period bands (CIV-1094): every other period lightly shaded, behind the bars, the same on the
 * frequency and trip time charts. Fills its positioned parent.
 */
export function FullDayPeriodBands({ className = 'inset-0' }: { className?: string }) {
  return (
    <div className={`absolute pointer-events-none ${className}`} aria-hidden="true" data-testid="full-day-period-bands">
      {PERIOD_OVERVIEW_BANDS.map(band => (
        <div
          key={band.key}
          className="absolute top-0 bottom-0 rounded-sm odd:bg-[var(--bg-btn-hover)] even:bg-transparent opacity-40"
          style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%` }}
        />
      ))}
    </div>
  );
}
