import type { DayType } from '../../shared/dayTypes';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';

/** The rule shown in each research view's info panel, always using the numbers currently selected. */

export const NIGHT_INFO_HEADING = 'Which routes run all night?';

export function nightRuleText(frequency: NightServiceFrequency): string {
  return `Listed routes leave at least every ${frequency} minutes from 2am to 6am, including one within ${frequency} minutes of 2am and one within ${frequency} minutes of 6am.`;
}

export const FREQUENT_INFO_HEADING = 'Which routes are frequent?';

function dayList(days: readonly DayType[]): string {
  const names = days.map(day => (day === 'Weekday' ? 'weekdays' : `${day}s`));
  if (names.length === 0) return 'the selected day';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function frequentRuleText(options: {
  frequency: FrequentServiceFrequency;
  window: FrequentServiceWindow;
  days: readonly DayType[];
}): string {
  const hours = options.window === 'extended' ? '7am to midnight' : '7am to 7pm';
  return `A route counts if it leaves at least every ${options.frequency} minutes, ${hours}, on ${dayList(options.days)}, including one within ${options.frequency} minutes of the start and one within ${options.frequency} minutes of the end.`;
}
