import { CARD_NOTE } from '../../styles';
import { type PeriodKey } from '../../hooks/useIntervalStats';
import { periodWithHourText } from '../../content/noticeCopy';
import { PERIOD_OVERVIEW_BANDS } from '../../utils/sparklinePeriods';

/**
 * The hovered (or selected) period's name: above the route card's chart, and on each full-day chart's title line
 * (CIV-1094). `className` places it.
 */
export function HoveredPeriodName({ period, hour = null, className = '' }: { period: PeriodKey | null; /** #1819: the hovered hour, named beside the period on the card's chart. */ hour?: number | null; className?: string }) {
  if (!period) return null;
  return (
    <span className={`${CARD_NOTE} pointer-events-none ${className}`} data-testid="hovered-period-name">
      {periodWithHourText(period, hour)}
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
