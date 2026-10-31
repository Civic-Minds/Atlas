import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { tenth } from '../../../../shared/liveFormat';
import { PERIOD_LABELS } from '../../../../shared/config';

export const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A figure to one decimal, with a real minus sign. */
export const num = tenth;
/** A signed minutes value ("+3.2 min"), also used as the axis value. */
export const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;

/** The route's direction ids in numeric order, narrowed to one direction when `dir` is set. The one direction list every Live surface uses. */
export const dirsOf = (v3: LiveV3, dir: number | null) => Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b).filter(d => dir == null || d === dir);

/** The time-of-day choices, "All day" first. */
export const BANDS: [DashboardBand, string][] = [['all', 'All day'], ['amPeak', PERIOD_LABELS.amPeak], ['midday', PERIOD_LABELS.midday], ['pmPeak', PERIOD_LABELS.pmPeak], ['evening', PERIOD_LABELS.evening]];

/** A time of day in a sentence ("all day", "in the AM peak"). */
export const BAND_WORDS: Record<DashboardBand, string> = { all: 'all day', amPeak: 'in the AM peak', midday: 'at midday', pmPeak: 'in the PM peak', evening: 'in the evening' };

/** The kinds of day, "All days" first. */
export const DAYS: ['all' | 'weekday' | 'weekend', string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];
