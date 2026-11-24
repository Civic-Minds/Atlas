/**
 * A small bar showing how far a count has got towards a goal, with its words beside it (CIV-2173: the Status page's days
 * recorded against the minimum to be listed). The bar is full once the count reaches the goal; the words come from the
 * caller, so the copy stays in its one source.
 */
export default function ProgressBar({ value, max, label, children }: {
  value: number;
  max: number;
  /** The bar's accessible name (what is being counted). */
  label: string;
  /** The words beside the bar. */
  children: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 1;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={children}
        className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--control-inactive-bg)]">
        <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
