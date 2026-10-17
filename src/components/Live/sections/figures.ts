import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';

const MINUS = '−';
export const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A figure to one decimal, with a real minus sign. */
export const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', MINUS);
/** A signed minutes value ("+3.2 min"), also used as the axis value. */
export const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;

/** The route's direction ids in numeric order, narrowed to one direction when `dir` is set. The one direction list every Live surface uses. */
export const dirsOf = (v3: LiveV3, dir: number | null) => Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b).filter(d => dir == null || d === dir);

/** The time-of-day choices, "All day" first. */
export const BANDS: [DashboardBand, string][] = [['all', 'All day'], ['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']];
