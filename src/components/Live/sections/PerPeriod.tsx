import { BANDS } from './figures';

/** The four time-of-day periods (everything but "All day"). */
export const PERIOD_BANDS_ONLY = BANDS.filter(([k]) => k !== 'all');

/** Rows with the same answer become one: "AM peak, Midday, PM peak, Evening: stays about level". Only merges, never rewrites. */
export function mergePeriodRows(rows: Array<{ key: string; label: string; text: string }>): Array<{ key: string; label: string; text: string }> {
  const out: Array<{ key: string; label: string; text: string }> = [];
  for (const r of rows) {
    const same = out.find(o => o.text === r.text);
    if (same) { same.label += `, ${r.label}`; same.key += `+${r.key}`; } else out.push({ ...r });
  }
  return out;
}

/** A section's answer for each time of day, as a compact list (no toggle): "AM peak: builds up by King St West". Identical answers are one row. */
export default function PerPeriod({ title, rows }: { title: string; rows: Array<{ key: string; label: string; text: string }> }) {
  if (!rows.length) return null;
  const merged = mergePeriodRows(rows);
  return (
    <div className="mt-3">
      <h4 className="text-sm font-black">{title}</h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        {merged.map(r => <div key={r.key} className="contents"><dt className="text-[var(--text-muted)]">{r.label}</dt><dd className="m-0">{r.text}</dd></div>)}
      </dl>
    </div>
  );
}
