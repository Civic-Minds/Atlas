import type { DayType } from '../../shared/dayTypes';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';
import { joinList } from '../../shared/overflowText';

/** The rule shown in each research view's info panel, always using the numbers currently selected. */

export const NIGHT_INFO_HEADING = 'Which routes run all night?';

/** Minutes after midnight as plain clock text: 3am, 2:30am, 6:45pm, midnight. */
export function clockText(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m === 0) return 'midnight';
  const hour24 = Math.floor(m / 60);
  const mins = m % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}${mins ? `:${String(mins).padStart(2, '0')}` : ''}${suffix}`;
}

export function nightRuleText(frequency: NightServiceFrequency): string {
  return `Routes with a departure at least every ${frequency} minutes from 2am to 6am.`;
}

export const FREQUENT_INFO_HEADING = 'Which routes are frequent?';

function dayList(days: readonly DayType[]): string {
  const names = days.map(day => (day === 'Weekday' ? 'weekdays' : `${day}s`));
  if (names.length === 0) return 'the selected day';
  return joinList(names);
}

export function frequentRuleText(options: {
  frequency: FrequentServiceFrequency;
  window: FrequentServiceWindow;
  days: readonly DayType[];
}): string {
  const startMin = 7 * 60;
  const endMin = options.window === 'extended' ? 24 * 60 : 19 * 60;
  return `Routes with a departure at least every ${options.frequency} minutes, ${clockText(startMin)} to ${clockText(endMin)}, on ${dayList(options.days)}.`;
}
