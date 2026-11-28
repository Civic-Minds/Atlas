import { dayPlural, type DayType } from '../../shared/dayTypes';
import { FREQUENT_WINDOW_LABELS, type FrequentServiceFrequency, type FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';
import { joinList } from '../../shared/overflowText';
import { headwayOrBetter } from '../../shared/headwayText';
import { OVERNIGHT_STORY } from '../../shared/researchStories';
import { PERIOD_LABELS } from '../../shared/rules/periods';

/** The rule shown in each research mode's info panel, always using the numbers currently selected. */

/** The Overnight mode's info panel heading: the story's heading (shared/researchStories.ts, CIV-1629). */
export const NIGHT_INFO_HEADING = OVERNIGHT_STORY.heading;
/** The Night Service route list's title, also the back link of a route opened from it (#1326). */
export const NIGHT_LIST_TITLE = OVERNIGHT_STORY.cardTitle;

/**
 * The title of a problem report sent from the Night list: the period's name and the frequency filter set, never a "view"
 * (CIV-3167: Ryan, 2026-11-28, picked "Overnight · every 30 min or better", exact words "1").
 */
export function nightReportTitle(frequency: NightServiceFrequency): string {
  return `${PERIOD_LABELS.overnight} · ${headwayOrBetter(frequency)}`;
}

export function nightRuleText(frequency: NightServiceFrequency): string {
  return `Routes with a departure ${headwayOrBetter(frequency)} from 2–5 AM.`;
}

export const FREQUENT_INFO_HEADING = 'Which routes are frequent?';

function dayList(days: readonly DayType[]): string {
  const names = days.map(dayPlural);
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
