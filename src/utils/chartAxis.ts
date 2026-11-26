/**
 * Minute-axis maths the Live charts share (CIV-2976 D13): RunTimeChart, the run-time rows and the gaps chart each
 * had their own copy.
 */

/** A minutes range over `values` with 2 minutes of headroom each side, on whole 5-minute steps, never below 0. */
export function runTimeAxis(values: readonly number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 10 };
  return { min: Math.max(0, Math.floor((Math.min(...values) - 2) / 5) * 5), max: Math.ceil((Math.max(...values) + 2) / 5) * 5 };
}

/** Axis ticks on whole 5 minutes, or 10 when the range is over 30 minutes. */
export function minuteTicks(scale: { min: number; max: number }): number[] {
  const step = (scale.max - scale.min || 1) > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = Math.ceil(scale.min / step) * step; t <= scale.max; t += step) ticks.push(t);
  return ticks;
}
