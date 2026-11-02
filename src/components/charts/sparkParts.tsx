/** Width of a sparkline chart's value axis on the left. */
export const AXIS_W = 36;
/** A sparkline bar inside its column: narrow and rounded, the route card's shape. Position it with `bottom` and `height`. */
export const SPARK_BAR = 'absolute left-1/2 w-[60%] max-w-[12px] min-w-[3px] -translate-x-1/2 rounded-sm';

/** A sparkline chart's value ticks: the number in the axis and a faint line across the bars. */
export function SparkTicks({ ticks, y, format, textClassName = 'text-[var(--text-dim)]' }: {
  ticks: readonly number[];
  /** A tick's distance from the top of the bars, in px. */
  y: (t: number) => number;
  format: (t: number) => string;
  /** The number's colour (and size, beyond the default text-xs). */
  textClassName?: string;
}) {
  return (
    <>
      {ticks.map(t => (
        <div key={t} data-tick className="pointer-events-none absolute" style={{ top: y(t), left: 0, right: 0 }}>
          <span className={`absolute -translate-y-1/2 text-xs leading-none ${textClassName}`} style={{ left: 0, width: AXIS_W - 6, textAlign: 'right' }}>{format(t)}</span>
          <div className="absolute border-t border-[var(--border-primary)]" style={{ left: AXIS_W, right: 0, opacity: 0.7 }} />
        </div>
      ))}
    </>
  );
}
