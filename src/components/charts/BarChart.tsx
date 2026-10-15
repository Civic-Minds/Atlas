export interface Bar {
  label: string;
  value: number;
  /** Text at the end of the bar (the figure with its sample size). */
  valueText: string;
}

/** Horizontal bars, one per row: a label, a bar scaled to the largest value, and the figure. Inline HTML, no library. */
export default function BarChart({ bars, ariaLabel }: { bars: readonly Bar[]; ariaLabel: string }) {
  const max = Math.max(...bars.map(b => b.value), 1e-9);
  return (
    <ul className="m-0 list-none space-y-1.5 p-0" aria-label={ariaLabel}>
      {bars.map(b => (
        <li key={b.label} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[minmax(0,16rem)_1fr_auto]">
          <span className="truncate text-[var(--text-primary)]" title={b.label}>{b.label}</span>
          <span className="block h-2.5 rounded-full bg-[var(--control-inactive-bg)]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }} />
          </span>
          <span className="whitespace-nowrap text-[var(--text-muted)]">{b.valueText}</span>
        </li>
      ))}
    </ul>
  );
}
