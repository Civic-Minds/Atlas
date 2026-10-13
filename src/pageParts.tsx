import { FREQUENCY_BANDS, NO_MIDDAY_PHRASE } from '../shared/agencyPages';

export interface StatItem {
  value: string;
  label: string;
}

/** Plain large numbers with small labels in one row, separated by space only (wraps on phones). */
export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
      {items.map(item => (
        <div key={item.label} className="min-w-0 max-w-[16rem]">
          <dd className="whitespace-nowrap text-3xl font-black tracking-tight">{item.value}</dd>
          <dt className="mt-1 text-sm text-[var(--text-muted)]">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

const BAND_PHRASES = [...FREQUENCY_BANDS.map(b => b.phrase), NO_MIDDAY_PHRASE];
/** Light to stronger tints of the accent, best frequency last-to-first; the final entry is the neutral no-service grey. */
const BAND_FILLS = [
  'color-mix(in srgb, var(--accent) 80%, var(--bg-app))',
  'color-mix(in srgb, var(--accent) 64%, var(--bg-app))',
  'color-mix(in srgb, var(--accent) 50%, var(--bg-app))',
  'color-mix(in srgb, var(--accent) 38%, var(--bg-app))',
  'color-mix(in srgb, var(--accent) 28%, var(--bg-app))',
  'color-mix(in srgb, var(--accent) 20%, var(--bg-app))',
  'var(--control-inactive-bg)',
];

/** One flat stacked bar of route counts per weekday-midday frequency band, with a plain legend of counts under it. */
export function FrequencyBar({ counts }: { counts: number[] }) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const shown = counts.map((n, i) => ({ n, i })).filter(x => x.n > 0);
  const summary = shown.map(x => `${x.n} ${x.n === 1 ? 'route' : 'routes'} ${BAND_PHRASES[x.i]}`).join(', ');
  return (
    <div className="mt-5">
      <div role="img" aria-label={summary} className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        {shown.map(x => (
          <div key={x.i} className="h-full min-w-1" style={{ flexGrow: x.n, flexBasis: 0, background: BAND_FILLS[x.i] }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-sm text-[var(--text-primary)] sm:grid-cols-2">
        {shown.map(x => (
          <li key={x.i} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: BAND_FILLS[x.i] }} />
            <span><span className="font-black">{x.n}</span> {x.n === 1 ? 'route' : 'routes'} {BAND_PHRASES[x.i]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
