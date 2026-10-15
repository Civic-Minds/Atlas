import { SPARKLINE_HOURS, SPARKLINE_HOUR_LABELS } from '../../../shared/config';

export interface HourColumn {
  /** Hour of day, 0-23. */
  hour: number;
  n: number;
  /** Shares of n, bottom to top; they add up to 1. */
  parts: readonly number[];
}

export interface HourPart {
  name: string;
  /** CSS colour (a token). */
  color: string;
}

const H = 96;
const clock = (h24: number) => `${h24 % 12 === 0 ? 12 : h24 % 12}${h24 < 12 ? ' am' : ' pm'}`;

/**
 * A bar for each hour of the day, in the same shape as the route card's schedule sparkline: same hour order, narrow
 * rounded bars, 90% opacity, a faded bar where there are too few departures, and the same axis labels (6a, 12p, 6p, 12a).
 * Each bar splits into shares (for example ahead / on time / late).
 */
export default function HourBars({ columns, parts, ariaLabel, minN = 30 }: { columns: readonly HourColumn[]; parts: readonly HourPart[]; ariaLabel: string; minN?: number }) {
  const byHour = new Map(columns.map(c => [c.hour, c]));
  const text = (c: HourColumn) => `${clock(c.hour)}: ${c.parts.map((p, i) => `${parts[i].name} ${Math.round(p * 100)}%`).join(', ')} (${c.n.toLocaleString()} departures)`;
  return (
    <figure className="m-0" role="img" aria-label={ariaLabel}>
      <div className="flex items-end gap-px" style={{ height: H }}>
        {SPARKLINE_HOURS.map(gtfsHour => {
          const h24 = gtfsHour % 24;
          const c = byHour.get(h24);
          const enough = !!c && c.n >= minN;
          return (
            <div
              key={gtfsHour}
              className="flex h-full min-w-0 flex-1 items-end justify-center"
              title={c ? text(c) : undefined}
              aria-label={c ? text(c) : undefined}
              tabIndex={c ? 0 : undefined}
            >
              {c && (
                <div className={`flex w-[60%] max-w-[14px] min-w-[3px] flex-col-reverse overflow-hidden rounded-sm ${enough ? 'opacity-90' : 'opacity-40'}`} style={{ height: H }}>
                  {c.parts.map((share, i) => <div key={parts[i].name} style={{ height: `${share * 100}%`, background: parts[i].color }} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-px" aria-hidden="true">
        {SPARKLINE_HOURS.map(h => (
          <div key={h} className="min-w-0 flex-1 text-center"><span className="text-xs text-[var(--text-dim)]">{SPARKLINE_HOUR_LABELS[h]}</span></div>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--text-dim)]">
        <span className="font-normal">Faded bars are based on fewer than {minN} departures.</span>
        {parts.map(p => <span key={p.name} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden="true" />{p.name}</span>)}
      </figcaption>
    </figure>
  );
}
