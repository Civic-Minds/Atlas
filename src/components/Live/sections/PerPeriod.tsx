import { BANDS } from './figures';

/** The four time-of-day periods (everything but "All day"). */
export const PERIOD_BANDS_ONLY = BANDS.filter(([k]) => k !== 'all');

/** A section's answer for each time of day, as a compact list (no toggle): "AM peak: builds up by King St West". */
export default function PerPeriod({ title, rows }: { title: string; rows: Array<{ key: string; label: string; text: string }> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-sm font-black">{title}</h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        {rows.map(r => <div key={r.key} className="contents"><dt className="text-[var(--text-muted)]">{r.label}</dt><dd className="m-0">{r.text}</dd></div>)}
      </dl>
    </div>
  );
}
