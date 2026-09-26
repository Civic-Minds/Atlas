import type { DayType } from './dayTypes.js';
import { TIME_PERIODS, type PeriodKey } from './config.js';

export type OnDemandPeriod = 'all' | PeriodKey;
export interface OnDemandHours {
  startHour: number;
  endHour: number;
}

export type OnDemandAvailability = Partial<Record<DayType, readonly OnDemandHours[]>>;

/** Unknown availability stays visible; authored schedules can opt into exact filtering. */
export function isOnDemandActive(
  availability: OnDemandAvailability | undefined,
  day: DayType,
  period: OnDemandPeriod,
): boolean {
  if (!availability) return true;
  const operatingWindows = availability[day];
  if (!operatingWindows) return true;
  if (period === 'all') return operatingWindows.length > 0;
  const selectedPeriod = TIME_PERIODS.find(candidate => candidate.key === period);
  if (!selectedPeriod) return true;
  return operatingWindows.some(window =>
    window.startHour < selectedPeriod.endHour && window.endHour > selectedPeriod.startHour,
  );
}
