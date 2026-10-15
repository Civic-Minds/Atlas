import type { DayType } from '../../shared/dayTypes';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';

/** The rule shown in each research view's info panel, always using the numbers currently selected. */

export const NIGHT_INFO_HEADING = 'Which routes actually run through the night?';

export function nightRuleText(frequency: NightServiceFrequency): string {
  return `A route counts here only if it has a departure at least every ${frequency} minutes, 2am to 6am, with no gap at either end of the core overnight window.`;
}

export const FREQUENT_INFO_HEADING = 'Which routes are frequent?';

function dayList(days: readonly DayType[]): string {
  if (days.length <= 1) return days[0] ?? 'the selected day';
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}

export function frequentRuleText(options: {
  frequency: FrequentServiceFrequency;
  window: FrequentServiceWindow;
  days: readonly DayType[];
}): string {
  const hours = options.window === 'extended' ? '7am to midnight' : '7am to 7pm';
  return `A route counts here only if it has a departure at least every ${options.frequency} minutes, ${hours}, on ${dayList(options.days)}, with no gap at either end of that time.`;
}
