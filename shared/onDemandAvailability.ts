import type { DayType } from './dayTypes.js';
import type { PeriodKey } from './config.js';

export type OnDemandPeriod = 'all' | PeriodKey;

export type OnDemandAvailability = Partial<Record<DayType, readonly OnDemandPeriod[]>>;

/** Unknown availability stays visible; authored schedules can opt into exact filtering. */
export function isOnDemandActive(
  availability: OnDemandAvailability | undefined,
  day: DayType,
  period: OnDemandPeriod,
): boolean {
  if (!availability) return true;
  const activePeriods = availability[day];
  if (!activePeriods) return true;
  if (period === 'all') return activePeriods.length > 0;
  return activePeriods.includes('all') || activePeriods.includes(period);
}
