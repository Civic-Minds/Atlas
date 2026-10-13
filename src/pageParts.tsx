import { useState } from 'react';
import { FREQUENCY_BANDS, NO_MIDDAY_PHRASE } from '../shared/agencyPages';
import { HEADWAY_TIERS } from '../shared/config';

const BAND_PHRASES = [...FREQUENCY_BANDS.map(b => b.phrase), NO_MIDDAY_PHRASE];
const BAND_SHORT = ['≤10 min', '11–15', '16–20', '21–30', '31–60', '60+', 'no midday'];
/** The map's own frequency colours (HEADWAY_TIERS, same bands and edges as the filters), then the neutral no-service grey. */
const BAND_FILLS = [...HEADWAY_TIERS.map(t => t.color), 'var(--control-inactive-bg)'];

/**
 * One flat stacked bar of route counts per weekday-midday frequency band. The legend is one short wrapping line;
 * hovering, focusing or tapping a segment shows the full sentence.
 */
export function FrequencyBar({ counts }: { counts: number[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const shown = counts.map((n, i) => ({ n, i })).filter(x => x.n > 0);
  const sentence = (x: { n: number; i: number }) => `${x.n} ${x.n === 1 ? 'route' : 'routes'} ${BAND_PHRASES[x.i]}`;
  let before = 0;
  const centres = new Map<number, number>();
  for (const x of shown) { centres.set(x.i, ((before + x.n / 2) / total) * 100); before += x.n; }
  const tip = shown.find(x => x.i === active);
  return (
    <div className="mt-5">
      <div className="relative" onMouseLeave={() => setActive(null)}>
        {tip && (
          <div role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-primary)] bg-[var(--bg-app)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]"
            style={{ left: `${Math.min(80, Math.max(20, centres.get(tip.i)!))}%` }}>
            {sentence(tip)}
          </div>
        )}
        <div role="group" aria-label="Routes by weekday midday frequency" className="flex h-4 gap-0.5 overflow-hidden rounded-full">
          {shown.map(x => (
            <button key={x.i} type="button" aria-label={sentence(x)} className="h-full min-w-1 cursor-default border-0 p-0 outline-offset-2"
              style={{ flexGrow: x.n, flexBasis: 0, background: BAND_FILLS[x.i] }}
              onMouseEnter={() => setActive(x.i)} onFocus={() => setActive(x.i)} onBlur={() => setActive(null)}
              onClick={() => setActive(a => (a === x.i ? null : x.i))} />
          ))}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-primary)]">
        {shown.map(x => (
          <li key={x.i} className="flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: BAND_FILLS[x.i] }} />
            <span><span className="font-black">{x.n}</span> {BAND_SHORT[x.i]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
