import type { DayType } from '../../shared/dayTypes';
import { FREQUENT_WINDOW_LABELS, type FrequentServiceFrequency, type FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';
import { joinList } from '../../shared/overflowText';
import { headwayOrBetter } from '../../shared/headwayText';

/** The rule shown in each research view's info panel, always using the numbers currently selected. */

export const NIGHT_INFO_HEADING = 'Which routes run overnight?';

export function nightRuleText(frequency: NightServiceFrequency): string {
  return `Routes with a departure ${headwayOrBetter(frequency)} from 2–5 AM.`;
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
  return `Routes with a departure ${headwayOrBetter(options.frequency)}, ${FREQUENT_WINDOW_LABELS[options.window]}, on ${dayList(options.days)}.`;
}
